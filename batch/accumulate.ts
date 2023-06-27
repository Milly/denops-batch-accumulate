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
    this.#ensureAvaiable();
    const callIndex = this.#calls.length;
    this.#calls.push([fn, ...args]);
    this.#onCalled();
    await this.#resolved;
    return this.#results[callIndex];
  }

  async batch(...calls: Call[]): Promise<unknown[]> {
    this.#ensureAvaiable();
    const callIndex = this.#calls.length;
    this.#calls.push(...calls);
    this.#onCalled();
    await this.#resolved;
    return this.#results.slice(callIndex, callIndex + calls.length);
  }

  cmd(cmd: string, ctx: Context = {}): Promise<void> {
    this.#ensureAvaiable();
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

  #ensureAvaiable(): void {
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
 * Perform accumulate call
 */
export async function accumulate<
  Executor extends (helper: AccumulateHelper) => unknown,
>(
  denops: Denops,
  executor: Executor,
): Promise<AwaitedDeep<ReturnType<Executor>>> {
  const helper = new AccumulateHelper(denops);
  try {
    const resolver = AccumulateHelper.getCallsResolver(helper);
    const [result] = await Promise.all([
      (async () => {
        try {
          const obj = await executor(helper);
          return await resolveResult(obj);
        } finally {
          resolver.stop();
        }
      })(),
      resolver,
    ]);
    return result as AwaitedDeep<ReturnType<Executor>>;
  } finally {
    AccumulateHelper.close(helper);
  }
}

async function resolveResult(obj: unknown): Promise<unknown> {
  obj = await obj;
  if (obj != null) {
    if (obj instanceof Map) {
      const keyValues = Array.from(obj);
      obj.clear();
      for (const [key, value] of keyValues) {
        obj.set(await resolveResult(key), await resolveResult(value));
      }
    } else if (obj instanceof Set) {
      const values = Array.from(obj);
      obj.clear();
      for (const value of values) {
        obj.add(await resolveResult(value));
      }
    }
    if (typeof obj === "object" || typeof obj === "function") {
      for (const [key, value] of Object.entries(obj)) {
        const resolved = await resolveResult(value);
        if (value !== resolved) {
          // deno-lint-ignore no-explicit-any
          (obj as any)[key] = resolved;
        }
      }
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

type NonMethodKeys<T extends AnyObject> = NonNullable<
  {
    [K in keyof T]: T[K] extends AnyFunction ? never : K;
  }[keyof T]
>;

type AwaitedDeep<T> = T extends AnyPromise ? AwaitedDeep<Awaited<T>>
  : T extends Map<infer MapKey, infer MapValue> ?
      & Map<AwaitedDeep<MapKey>, AwaitedDeep<MapValue>>
      & AwaitedObject<Omit<T, MapMember>>
  : T extends Set<infer SetValue> ?
      & Set<AwaitedDeep<SetValue>>
      & AwaitedObject<Omit<T, SetMember>>
  : T extends AnyTuple ?
      & AwaitedTuple<T>
      & AwaitedObject<Omit<T, ArrayMember | `${number}`>>
  : T extends ReadonlyArray<infer ArrayValue> ?
      & Array<AwaitedDeep<ArrayValue>>
      & AwaitedObject<Omit<T, ArrayMember>>
  : T extends AnyObject ? AwaitedObject<T>
  : T;

// deno-lint-ignore no-explicit-any
type AwaitedTuple<T extends readonly any[]> = [...T] extends
  [infer A, ...infer R] ? [AwaitedDeep<A>, ...AwaitedTuple<R>] : [];

type AwaitedObject<T extends AnyObject> = {
  [K in keyof T]: K extends NonMethodKeys<T> ? AwaitedDeep<T[K]> : T[K];
};

export type { AccumulateHelper };
