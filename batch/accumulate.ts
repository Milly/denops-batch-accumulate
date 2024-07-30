import type { Context, Denops, Dispatcher, Meta } from "@denops/core";
import { BatchError } from "@denops/core";

type Call = [string, ...unknown[]];

const errorProp = Symbol("AccumulateErrorResult");

type ErrorResult = {
  [errorProp]: Error;
};

class AccumulateHelper implements Denops {
  readonly #denops: Denops;
  readonly #calls: Call[] = [];
  readonly #results: unknown[] = [];
  #closed = false;
  readonly #closedWaiter = Promise.withResolvers<void>();
  #resolvedWaiter = Promise.withResolvers<void>();
  #calledWaiter = Promise.withResolvers<void>();

  constructor(denops: Denops) {
    this.#denops = denops;
  }

  static startCallsResolver(helper: AccumulateHelper): Promise<void> {
    return helper.#resolveCalls();
  }

  static close(helper: AccumulateHelper): void {
    helper.#closed = true;
    helper.#closedWaiter.resolve();
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
    return Promise.reject(
      new Error(
        "The 'redraw' method is not available on AccumulateHelper.",
      ),
    );
  }

  async call(fn: string, ...args: unknown[]): Promise<unknown> {
    this.#ensureAvailable();
    const callIndex = this.#calls.length;
    this.#calls.push([fn, ...args]);
    this.#onCalled();
    await this.#resolvedWaiter.promise;
    const result = this.#results[callIndex];
    if (isErrorResult(result)) {
      throw new Error(result[errorProp].message);
    }
    return result;
  }

  async batch(...calls: Call[]): Promise<unknown[]> {
    this.#ensureAvailable();
    if (calls.length === 0) {
      return [];
    }
    const callIndex = this.#calls.length;
    this.#calls.push(...calls);
    this.#onCalled();
    await this.#resolvedWaiter.promise;
    const results = this.#results.slice(callIndex, callIndex + calls.length);
    const errorIndex = results.findIndex(isErrorResult);
    if (errorIndex >= 0) {
      const error = (results[errorIndex] as ErrorResult)[errorProp];
      throw new BatchError(error.message, results.slice(0, errorIndex));
    }
    return results;
  }

  async cmd(cmd: string, ctx: Context = {}): Promise<void> {
    await this.call("denops#api#cmd", cmd, ctx);
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
        this.#calledWaiter.resolve();
      }
    });
  }

  async #resolveCalls(): Promise<void> {
    for (;;) {
      await Promise.race([
        this.#closedWaiter.promise,
        this.#calledWaiter.promise,
      ]);
      const calls = this.#calls.slice(this.#results.length);
      if (calls.length === 0) break;
      const lastResolved = this.#resolvedWaiter;
      this.#resolvedWaiter = Promise.withResolvers();
      this.#calledWaiter = Promise.withResolvers();
      let results: unknown[];
      try {
        results = await this.#denops.batch(...calls);
      } catch (error) {
        const errorResult: ErrorResult = { [errorProp]: error };
        results = isBatchError(error) ? [...error.results] : [];
        while (results.length < calls.length) {
          results.push(errorResult);
        }
      }
      this.#results.push(...results);
      lastResolved.resolve();
    }
  }
}

function isBatchError(obj: unknown): obj is BatchError {
  return obj instanceof Error && obj.name === "BatchError";
}

function isErrorResult(obj: unknown): obj is ErrorResult {
  return obj != null && Object.hasOwn(obj, errorProp);
}

/**
 * Aggregates all denops functions called during the current task's execution
 * and resolves them in a single RPC call.
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
  const resolver = AccumulateHelper.startCallsResolver(helper);
  const run = async () => {
    try {
      return await executor(helper);
    } finally {
      AccumulateHelper.close(helper);
    }
  };
  const [result] = await Promise.all([run(), resolver]);
  return result;
}
