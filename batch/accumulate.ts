import { debounce } from "https://deno.land/std@0.224.0/async/mod.ts";
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
  #resolved = Promise.withResolvers<void>();
  #called = Promise.withResolvers<void>();
  #onCalled = debounce(() => this.#called.resolve(), 0);

  constructor(denops: Denops) {
    this.#denops = denops;
  }

  static getCallsResolver(helper: AccumulateHelper) {
    const willStop = Promise.withResolvers<void>();
    return {
      promise: helper.#resolveCalls(willStop.promise),
      stop: () => willStop.resolve(),
    };
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
    await this.#resolved.promise;
    return this.#results[callIndex];
  }

  async batch(...calls: Call[]): Promise<unknown[]> {
    this.#ensureAvailable();
    const callIndex = this.#calls.length;
    this.#calls.push(...calls);
    this.#onCalled();
    await this.#resolved.promise;
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
      this.#resolved = Promise.withResolvers();
      this.#called = Promise.withResolvers();
      lastResolved.resolve();
    }
  }

  async #resolveCalls(willStop: Promise<void>): Promise<void> {
    for (;;) {
      await Promise.race([this.#called.promise, willStop]);
      this.#ensureNoErrors();
      const calls = this.#getCalls();
      if (calls.length === 0) break;
      const results = await this.#denops.batch(...calls);
      this.#addResults(results);
    }
  }
}

/**
 * Call multiple denops functions together whenever possible to reduce RPC overhead.
 *
 * `accumulate` preserves the structure of the complex object returned by the
 * `executor` and resolves Promise it contains.
 *
 * ```typescript
 * import { Denops } from "https://deno.land/x/denops_core@v5.0.0/mod.ts";
 * import * as fn from "https://deno.land/x/denops_std@v5.0.1/function/mod.ts";
 * import { accumulate } from "https://deno.land/x/denops_accumulate/batch/accumulate.ts";
 * import { assertType, IsExact } from "https://deno.land/std@0.224.0/testing/types.ts";
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
 * assertType<
 *   IsExact<
 *     typeof results,
 *     { lnum: number; keyword: string; len: number; }[]
 *   >
 * >(true);
 * ```
 *
 * In the case of the example, the following 3 RPCs are called.
 *
 * 1. RPC call to `getline`.
 * 2. Multiple `matchstr` calls in one RPC.
 * 3. Multiple `len` calls in one RPC.
 *
 * The `denops` instance passed to the `accumulate` block is NOT available
 * outside of the block. An error is thrown when `denops.call()`,
 * `denops.batch()`, `denops.cmd()`, or `denops.eval()` is called.
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
    const run = async () => {
      try {
        const obj = executor(helper);
        return await resolveResult(obj);
      } finally {
        resolver.stop();
      }
    };
    const [result] = await Promise.all([run(), resolver.promise]);
    return result as Accumulate<T>;
  } finally {
    AccumulateHelper.close(helper);
  }
}

const EMPTY_CONTAINER_VALUES = Promise.resolve([]);

async function resolveResult(obj: unknown): Promise<unknown> {
  obj = await obj;
  if ((obj != null && typeof obj === "object") || typeof obj === "function") {
    const objKeys = Object.keys(obj).filter(
      (key) => Object.getOwnPropertyDescriptor(obj, key)?.writable,
    );
    const [containerValues, objValues] = await Promise.all([
      obj instanceof Map
        ? Promise.all([...obj].flat().map((v) => resolveResult(v)))
        : obj instanceof Set
        ? Promise.all([...obj].map((v) => resolveResult(v)))
        : EMPTY_CONTAINER_VALUES,
      Promise.all(
        objKeys.map(
          (key) => resolveResult((obj as Record<string, unknown>)[key]),
        ),
      ),
    ]);
    if (obj instanceof Map) {
      obj.clear();
      for (let i = 0; i < containerValues.length; i += 2) {
        obj.set(containerValues[i], containerValues[i + 1]);
      }
    } else if (obj instanceof Set) {
      obj.clear();
      for (const value of containerValues) {
        obj.add(value);
      }
    }
    for (let i = 0; i < objKeys.length; ++i) {
      (obj as Record<string, unknown>)[objKeys[i]] = objValues[i];
    }
  }
  return obj;
}

// deno-lint-ignore no-explicit-any
type AnyObject = Record<string, any>;
// deno-lint-ignore no-explicit-any
type AnyFunction = (...args: any[]) => any;
// deno-lint-ignore no-explicit-any
type AnyTuple = readonly [] | readonly [any, ...any[]];

type MapMember = keyof Map<unknown, unknown>;
type SetMember = keyof Set<unknown>;
type ArrayMember = keyof Array<unknown>;

type AwaitedDeep<T> = AwaitedDeepInner<Awaited<T>>;
type AwaitedDeepInner<T> = T extends AnyObject
  ? T extends Map<infer MapKey, infer MapValue> ? AwaitedContainer<
      Map<AwaitedDeep<MapKey>, AwaitedDeep<MapValue>>,
      Omit<T, MapMember>
    >
  : T extends Set<infer SetValue>
    ? AwaitedContainer<Set<AwaitedDeep<SetValue>>, Omit<T, SetMember>>
  : T extends AnyTuple
    ? AwaitedContainer<AwaitedTuple<T>, Omit<T, ArrayMember | `${number}`>>
  : T extends ReadonlyArray<infer ArrayValue>
    ? AwaitedContainer<Array<AwaitedDeep<ArrayValue>>, Omit<T, ArrayMember>>
  : T extends string ? AwaitedContainer<T, Omit<T, keyof string>>
  : T extends number ? AwaitedContainer<T, Omit<T, keyof number>>
  : T extends boolean ? AwaitedContainer<T, Omit<T, keyof boolean>>
  : T extends bigint ? AwaitedContainer<T, Omit<T, keyof bigint>>
  : AwaitedObject<T>
  : T;

type Unwrap<T, Extend extends AnyObject> = T extends Extend & infer U ? U : T;

type AwaitedContainer<T, Extend extends AnyObject> = Extend extends
  Record<string, never> ? T : Unwrap<T, Extend> & AwaitedObject<Extend>;

// deno-lint-ignore no-explicit-any
type AwaitedTuple<T extends readonly [...any[]]> = AwaitedTupleInner<
  Unwrap<T, Omit<T, ArrayMember | `${number}`>>
>;
type AwaitedTupleInner<T> = T extends readonly [infer A, ...infer R]
  ? [AwaitedDeep<A>, ...AwaitedTupleInner<R>]
  : [];

type AwaitedObject<T extends AnyObject> = Simplify<AwaitedObjectComp<T>>;
type AwaitedObjectComp<T extends AnyObject> = {
  [K in keyof T]: T[K] extends AnyFunction ? T[K] : AwaitedDeep<T[K]>;
};

// deno-lint-ignore ban-types
type Simplify<T> = { [K in keyof T]: T[K] } & {};

type Accumulate<T> = AwaitedDeep<T>;
