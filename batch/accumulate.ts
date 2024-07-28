import type { Context, Denops, Dispatcher, Meta } from "@denops/core";

type Call = [string, ...unknown[]];

declare const WillStop: unique symbol;
const WILL_STOP = {} as typeof WillStop;

class AccumulateHelper implements Denops {
  #denops: Denops;
  #calls: Call[] = [];
  #results: unknown[] = [];
  #closed = false;
  #resolved = Promise.withResolvers<void>();
  #called = Promise.withResolvers<void>();

  constructor(denops: Denops) {
    this.#denops = denops;
  }

  static getCallsResolver(helper: AccumulateHelper) {
    const willStop = Promise.withResolvers<typeof WILL_STOP>();
    return {
      promise: helper.#resolveCalls(willStop.promise),
      stop: () => willStop.resolve(WILL_STOP),
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
    if (calls.length === 0) {
      return [];
    }
    const callIndex = this.#calls.length;
    this.#calls.push(...calls);
    this.#onCalled();
    await this.#resolved.promise;
    return this.#results.slice(callIndex, callIndex + calls.length);
  }

  cmd(cmd: string, ctx: Context = {}): Promise<void> {
    this.#ensureAvailable();
    this.call("denops#api#cmd", cmd, ctx);
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

  #onCalled(): void {
    const callCount = this.#calls.length;
    queueMicrotask(() => {
      if (callCount === this.#calls.length) {
        this.#called.resolve();
      }
    });
  }

  #dequeueCalls(): Call[] {
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

  async #resolveCalls(willStop: Promise<typeof WILL_STOP>): Promise<void> {
    for (;;) {
      const state = await Promise.race([willStop, this.#called.promise]);
      if (state === WILL_STOP) break;
      const calls = this.#dequeueCalls();
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
 * import { assertType, IsExact } from "jsr:@std/testing/types";
 * import { Denops } from "jsr:@denops/core";
 * import * as fn from "jsr:@denops/std/function";
 * import { accumulate } from "jsr:@milly/denops-batch-accumulate";
 *
 * export async function main(denops: Denops): Promise<void> {
 *   const results = await accumulate(denops, async (denops) => {
 *     const lines = await fn.getline(denops, 1, "$");
 *     return await Promise.all(lines.map(async (line, index) => {
 *       const keyword = await fn.matchstr(denops, line, "\\k\\+");
 *       const len = await fn.len(denops, keyword);
 *       return {
 *         lnum: index + 1,
 *         keyword,
 *         len,
 *       };
 *     }));
 *   });
 *
 *   assertType<
 *     IsExact<
 *       typeof results,
 *       { lnum: number; keyword: string; len: number; }[]
 *     >
 *   >(true);
 * }
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
): Promise<Awaited<T>> {
  const helper = new AccumulateHelper(denops);
  try {
    const resolver = AccumulateHelper.getCallsResolver(helper);
    const run = async () => {
      try {
        return await executor(helper);
      } finally {
        resolver.stop();
      }
    };
    const [result] = await Promise.all([run(), resolver.promise]);
    return result;
  } finally {
    AccumulateHelper.close(helper);
  }
}
