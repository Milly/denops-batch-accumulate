import { deferred, delay } from "https://deno.land/std@0.166.0/async/mod.ts";
import type {
  Context,
  Denops,
  Dispatcher,
  Meta,
} from "https://deno.land/x/denops_core@v3.2.0/mod.ts";

class DeferHelper implements Denops {
  #denops: Denops;
  #calls: [string, ...unknown[]][] = [];
  #results: unknown[] = [];
  #closed = false;
  #resolved = deferred();

  constructor(denops: Denops) {
    this.#denops = denops;
  }

  static getCalls(helper: DeferHelper): [string, ...unknown[]][] {
    return helper.#calls.slice(helper.#results.length);
  }

  static addResults(helper: DeferHelper, results: unknown[]): void {
    helper.#results.splice(Infinity, 0, ...results);
    const lastResolved = helper.#resolved;
    helper.#resolved = deferred();
    lastResolved.resolve();
  }

  static close(helper: DeferHelper): void {
    helper.#closed = true;
    if (helper.#calls.length > helper.#results.length) {
      helper.#resolved.reject(new Error("DeferHelper closed"));
    }
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
    await this.#resolved;
    return this.#results![callIndex];
  }

  batch(..._calls: [string, ...unknown[]][]): Promise<unknown[]> {
    throw new Error("The 'batch' method is not available on DeferHelper.");
  }

  async cmd(cmd: string, ctx: Context = {}): Promise<void> {
    this.#ensureAvaiable();
    await this.call("denops#api#cmd", cmd, ctx);
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
  const EXECUTOR_WAIT = 50;
  const TIMEOUT = { timeout: null };
  const abortController = new AbortController();
  const { signal } = abortController;
  const helper = new DeferHelper(denops);
  const resolveCalls = async (obj: unknown) => {
    for (;;) {
      const calls = DeferHelper.getCalls(helper);
      if (calls.length > 0) {
        const results = await denops.batch(...calls);
        DeferHelper.addResults(helper, results);
      }
      const resultOrTimeout = await Promise.race([
        obj,
        delay(EXECUTOR_WAIT, { signal }).then(() => TIMEOUT),
      ]);
      if (resultOrTimeout !== TIMEOUT) {
        return resultOrTimeout;
      }
    }
  };
  try {
    const result = await resolveCalls(executor(helper));
    await resolveCalls(resolveResult(result));
    return result as AwaitedDeep<ReturnType<Executor>>;
  } finally {
    abortController.abort();
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
