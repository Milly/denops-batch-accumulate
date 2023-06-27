import { debounce, deferred } from "https://deno.land/std@0.192.0/async/mod.ts";
import type {
  Context,
  Denops,
  Dispatcher,
  Meta,
} from "https://deno.land/x/denops_core@v5.0.0/mod.ts";

type Call = [string, ...unknown[]];

class AccumulateHelper implements Denops {
  #denops: Denops;
  #calls: Call[] = [];
  #results: unknown[] = [];
  #errors: unknown[] = [];
  #closed = false;
  #resolved = deferred<void>();
  #called = deferred<void>();
  #onCalled = debounce(() => this.#called.resolve(), 0);

  constructor(denops: Denops) {
    this.#denops = denops;
  }

  static getCallsResolver(helper: AccumulateHelper) {
    const willStop = deferred<void>();
    const resolver = helper.#resolveCalls(willStop);
    return Object.assign(
      resolver,
      {
        stop: () => willStop.resolve(),
      },
    );
  }

  static close(helper: AccumulateHelper): void {
    helper.#closed = true;
  }

  get name(): string {
    return this.#denops.name;
  }

  get meta(): Meta {
    return this.#denops.meta;
  }

  get context(): Record<string | number | symbol, unknown> {
    return this.#denops.context;
  }

  get dispatcher(): Dispatcher {
    return this.#denops.dispatcher;
  }

  set dispatcher(dispatcher: Dispatcher) {
    this.#denops.dispatcher = dispatcher;
  }

  redraw(_force?: boolean): Promise<void> {
    throw new Error(
      "The 'redraw' method is not available on AccumulateHelper.",
    );
  }

  async call(fn: string, ...args: unknown[]): Promise<unknown> {
    this.#ensureAvailable();
    const callIndex = this.#calls.length;
    this.#calls.push([fn, ...args]);
    this.#onCalled();
    await this.#resolved;
    return this.#results[callIndex];
  }

  async batch(...calls: Call[]): Promise<unknown[]> {
    this.#ensureAvailable();
    const callIndex = this.#calls.length;
    this.#calls.push(...calls);
    this.#onCalled();
    await this.#resolved;
    return this.#results.slice(callIndex, callIndex + calls.length);
  }

  cmd(cmd: string, ctx: Context = {}): Promise<void> {
    this.#ensureAvailable();
    this.call("denops#api#cmd", cmd, ctx)
      .catch((reason) => void this.#errors.push(reason));
    return Promise.resolve();
  }

  eval(expr: string, ctx: Context = {}): Promise<unknown> {
    return this.call("denops#api#eval", expr, ctx);
  }

  dispatch(name: string, fn: string, ...args: unknown[]): Promise<unknown> {
    return this.#denops.dispatch(name, fn, ...args);
  }

  #ensureAvailable(): void {
    if (this.#closed) {
      throw new Error(
        "AccumulateHelper instance is not available outside of 'accumulate' block",
      );
    }
  }

  #ensureNoErrors(): void {
    if (this.#errors.length > 0) {
      throw this.#errors[0];
    }
  }

  #getCalls(): Call[] {
    return this.#calls.slice(this.#results.length);
  }

  #addResults(results: unknown[]): void {
    this.#results.push(...results);
    if (this.#results.length === this.#calls.length) {
      const lastResolved = this.#resolved;
      this.#resolved = deferred();
      this.#called = deferred();
      lastResolved.resolve();
    }
  }

  async #resolveCalls(willStop: Promise<void>): Promise<void> {
    for (;;) {
      await Promise.race([this.#called, willStop]);
      this.#ensureNoErrors();
      const calls = this.#getCalls();
      if (calls.length === 0) break;
      const results = await this.#denops.batch(...calls);
      this.#addResults(results);
    }
  }
}

/**
 * Execute multiple denops functions together whenever possible to reduce RPC overhead.
 *
 * `accumulate` preserves the structure of the complex object returned by the `executor`
 * and resolves Promise it contains.
 *
 * ```typescript
 * import { Denops } from "https://deno.land/x/denops_core@v5.0.0/mod.ts";
 * import * as fn from "https://deno.land/x/denops_std@v5.0.1/function/mod.ts";
 * import { accumulate } from "https://deno.land/x/denops_accumulate/batch/accumulate.ts";
 *
 * export async function main(denops: Denops): Promise<void> {
 *   const results = await accumulate(denops, async (denops) => {
 *     const lines = await fn.getline(denops, 1, "$");
 *     return lines.map(async (line, index) => {
 *       const keyword = await fn.matchstr(denops, line, "\\k\\+");
 *       return {
 *         lnum: index + 1,
 *         keyword,
 *         len: fn.len(denops, keyword),
 *       };
 *     });
 *   });
 * }
 * ```
 *
 * And the type of `results` are:
 *
 * ```typescript
 * const results: {
 *   lnum: number;
 *   keyword: string;
 *   len: number;
 * }[];
 * ```
 *
 * In the case of the example, the following 3 RPCs are called.
 *
 * 1. RPC call to `getline`.
 * 2. Multiple `matchstr` calls in one RPC.
 * 3. Multiple `len` calls in one RPC.
 *
 * The `denops` instance passed to the `accumulate` block is NOT available outside of
 * the block. An error is thrown when `denops.call()`, `denops.batch()`,
 * `denops.cmd()`, or `denops.eval()` is called.
 *
 * Note that `denops.redraw()` cannot be called within `accumulate()`.
 * If it is called, an error is raised.
 */
export async function accumulate<T extends unknown>(
  denops: Denops,
  executor: (helper: Denops) => T,
): Promise<Accumulate<T>> {
  const helper = new AccumulateHelper(denops);
  try {
    const resolver = AccumulateHelper.getCallsResolver(helper);
    const [result] = await Promise.all([
      (async () => {
        try {
          const obj = executor(helper);
          return await resolveResult(obj);
        } finally {
          resolver.stop();
        }
      })(),
      resolver,
    ]);
    return result as Accumulate<T>;
  } finally {
    AccumulateHelper.close(helper);
  }
}

async function resolveResult(obj: unknown): Promise<unknown> {
  obj = await obj;
  if (obj && (typeof obj === "object" || typeof obj === "function")) {
    if (obj instanceof Map) {
      const keyValues = await Promise.all(
        [...obj].flat().map((v) => resolveResult(v)),
      );
      obj.clear();
      for (let i = 0; i < keyValues.length; i += 2) {
        obj.set(keyValues[i], keyValues[i + 1]);
      }
    } else if (obj instanceof Set) {
      const values = await Promise.all([...obj].map((v) => resolveResult(v)));
      obj.clear();
      for (const value of values) {
        obj.add(value);
      }
    }
    {
      const keys = Object.keys(obj).filter((key) =>
        Object.getOwnPropertyDescriptor(obj, key)?.writable
      );
      const values = await Promise.all(
        // deno-lint-ignore no-explicit-any
        keys.map((key) => resolveResult((obj as any)[key])),
      );
      keys.forEach((key, i) => {
        // deno-lint-ignore no-explicit-any
        (obj as any)[key] = values[i];
      });
    }
  }
  return obj;
}

// deno-lint-ignore no-explicit-any
type AnyObject = Record<string, any>;
// deno-lint-ignore no-explicit-any
type AnyPromise = Promise<any>;
// deno-lint-ignore no-explicit-any
type AnyFunction = (...args: any[]) => any;
// deno-lint-ignore no-explicit-any
type AnyTuple = readonly [] | readonly [any, ...any[]];

type MapMember = keyof Map<unknown, unknown>;
type SetMember = keyof Set<unknown>;
type ArrayMember = keyof Array<unknown>;

type AwaitedDeep<T> = T extends AnyPromise ? AwaitedDeep<Awaited<T>>
  : T extends Map<infer MapKey, infer MapValue> ? AwaitedContainer<
      Map<AwaitedDeep<MapKey>, AwaitedDeep<MapValue>>,
      Omit<T, MapMember>
    >
  : T extends Set<infer SetValue>
    ? AwaitedContainer<Set<AwaitedDeep<SetValue>>, Omit<T, SetMember>>
  : T extends AnyTuple
    ? AwaitedContainer<AwaitedTuple<T>, Omit<T, ArrayMember | `${number}`>>
  : T extends ReadonlyArray<infer ArrayValue>
    ? AwaitedContainer<Array<AwaitedDeep<ArrayValue>>, Omit<T, ArrayMember>>
  : T extends AnyObject ? AwaitedObject<T>
  : T;

type AwaitedContainer<T, Extend extends AnyObject> = Extend extends
  Record<string, never> ? T : (T & AwaitedObject<Extend>);

// deno-lint-ignore no-explicit-any
type AwaitedTuple<T extends readonly [...any[]]> = T extends
  [infer A, ...infer R] ? [AwaitedDeep<A>, ...AwaitedTuple<R>] : [];

type AwaitedObject<T extends AnyObject> = Simplify<AwaitedObjectComp<T>>;
type AwaitedObjectComp<T extends AnyObject> = {
  [K in keyof T]: T[K] extends AnyFunction ? T[K] : AwaitedDeep<T[K]>;
};

// deno-lint-ignore ban-types
type Simplify<T> = { [K in keyof T]: T[K] } & {};

type Accumulate<T> = AwaitedDeep<T>;
