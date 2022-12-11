import { debounce, deferred } from "https://deno.land/std@0.166.0/async/mod.ts";
import type {
  Context,
  Denops,
  Dispatcher,
  Meta,
} from "https://deno.land/x/denops_core@v3.2.0/mod.ts";

type Call = [string, ...unknown[]];

class DeferHelper implements Denops {
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

  static waitCalled(helper: DeferHelper): Promise<void> {
    return helper.#called;
  }

  static getCalls(helper: DeferHelper): Call[] {
    return helper.#calls.slice(helper.#results.length);
  }

  static addResults(helper: DeferHelper, results: unknown[]): void {
    helper.#results.splice(Infinity, 0, ...results);
    if (helper.#results.length === helper.#calls.length) {
      const lastResolved = helper.#resolved;
      helper.#resolved = deferred();
      helper.#called = deferred();
      lastResolved.resolve();
    }
  }

  static getErrors(helper: DeferHelper): unknown[] {
    return helper.#errors;
  }

  static close(helper: DeferHelper): void {
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
    throw new Error("The 'redraw' method is not available on DeferHelper.");
  }

  async call(fn: string, ...args: unknown[]): Promise<unknown> {
    this.#ensureAvaiable();
    const callIndex = this.#calls.length;
    this.#calls.push([fn, ...args]);
    this.#onCalled();
    await this.#resolved;
    return this.#results![callIndex];
  }

  batch(..._calls: [string, ...unknown[]][]): Promise<unknown[]> {
    throw new Error("The 'batch' method is not available on DeferHelper.");
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
        "DeferHelper instance is not available outside of 'defer' block",
      );
    }
  }
}

/**
 * Perform defer call
 */
export async function defer<Executor extends (helper: DeferHelper) => unknown>(
  denops: Denops,
  executor: Executor,
): Promise<AwaitedDeep<ReturnType<Executor>>> {
  const aborter = deferred<void>();
  const helper = new DeferHelper(denops);
  const resolveCalls = async () => {
    for (;;) {
      await Promise.race([DeferHelper.waitCalled(helper), aborter]);
      const errors = DeferHelper.getErrors(helper);
      if (errors.length > 0) throw errors[0];
      const calls = DeferHelper.getCalls(helper);
      if (calls.length === 0) break;
      const results = await denops.batch(...calls);
      DeferHelper.addResults(helper, results);
    }
  };
  try {
    const resolver = resolveCalls();
    const result = await Promise.race([resolver, executor(helper)]);
    await Promise.race([resolver, resolveResult(result)]);
    aborter.resolve();
    await resolver;
    return result as AwaitedDeep<ReturnType<Executor>>;
  } finally {
    aborter.resolve();
    DeferHelper.close(helper);
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

type NonMethodKeys<T extends AnyObject> = NonNullable<
  {
    [K in keyof T]: T[K] extends AnyFunction ? never : K;
  }[keyof T]
>;

type AwaitedDeep<T> = T extends AnyPromise ? AwaitedDeep<Awaited<T>>
  : T extends Map<infer MapKey, infer MapValue> ? 
      & AwaitedObject<Omit<T, keyof Map<MapKey, MapValue>>>
      & Map<AwaitedDeep<MapKey>, AwaitedDeep<MapValue>>
  : T extends Set<infer SetValue> ? 
      & AwaitedObject<Omit<T, keyof Set<SetValue>>>
      & Set<AwaitedDeep<SetValue>>
  : T extends Array<infer ArrayValue> ? 
      & AwaitedObject<Omit<T, keyof Array<ArrayValue>>>
      & Array<AwaitedDeep<ArrayValue>>
  : T extends AnyObject ? AwaitedObject<T>
  : T;

type AwaitedObject<T extends AnyObject> =
  & {
    [K in NonMethodKeys<T>]: AwaitedDeep<T[K]>;
  }
  & Omit<T, NonMethodKeys<T>>;

export type { DeferHelper };
export const _internal = {
  DeferHelper,
  resolveResult,
};
