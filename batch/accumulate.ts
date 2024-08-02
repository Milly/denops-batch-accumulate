import type { Context, Denops, Dispatcher, Meta } from "@denops/core";
import { BatchError } from "@denops/core";

const MICROTASK_DELAY = 5;

const resolvedPromise = Promise.resolve();
const errorProp = Symbol("AccumulateErrorResult");

type Call = [string, ...unknown[]];

type ErrorResult = {
  [errorProp]: Error;
};

class AccumulateHelper implements Denops {
  readonly #denops: Denops;
  readonly #calls: Call[] = [];
  readonly #results: unknown[] = [];
  #closed = false;
  #resolvedWaiter = Promise.withResolvers<void>();

  constructor(denops: Denops) {
    this.#denops = denops;
  }

  static async close(helper: AccumulateHelper): Promise<void> {
    helper.#closed = true;
    if (helper.#calls.length > helper.#results.length) {
      await helper.#resolvedWaiter.promise;
    }
  }

  get name(): string {
    return this.#denops.name;
  }

  get meta(): Meta {
    return this.#denops.meta;
  }

  get interrupted(): AbortSignal | undefined {
    return this.#denops.interrupted;
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
    await this.#waitResolved();
    const result = this.#results[callIndex];
    if (isErrorResult(result)) {
      throw new Error(result[errorProp].message);
    }
    return result;
  }

  async batch(...calls: Call[]): Promise<unknown[]> {
    this.#ensureAvailable();
    const callIndex = this.#calls.length;
    this.#calls.push(...calls);
    await this.#waitResolved();
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

  async eval(expr: string, ctx: Context = {}): Promise<unknown> {
    return await this.call("denops#api#eval", expr, ctx);
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

  #waitResolved(): Promise<void> {
    const callCount = this.#calls.length;
    if (callCount === this.#results.length) {
      return resolvedPromise;
    }
    (async () => {
      let delay = MICROTASK_DELAY;
      do {
        await resolvedPromise;
        if (callCount !== this.#calls.length) return;
        --delay;
      } while (delay > 0);
      await this.#resolvePendingCalls();
    })();
    return this.#resolvedWaiter.promise;
  }

  async #resolvePendingCalls(): Promise<void> {
    const resultIndex = this.#results.length;
    const calls = this.#calls.slice(resultIndex);
    this.#results.length = this.#calls.length;
    const resolvedWaiter = this.#resolvedWaiter;
    this.#resolvedWaiter = Promise.withResolvers();
    const results = await this.#resolveCalls(calls);
    this.#results.splice(resultIndex, results.length, ...results);
    resolvedWaiter.resolve();
  }

  async #resolveCalls(calls: Call[]): Promise<unknown[]> {
    try {
      return await this.#denops.batch(...calls);
    } catch (error) {
      const errorResult: ErrorResult = { [errorProp]: error };
      const results = isBatchError(error) ? [...error.results] : [];
      while (results.length < calls.length) {
        results.push(errorResult);
      }
      return results;
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
  try {
    return await executor(helper);
  } finally {
    await AccumulateHelper.close(helper);
  }
}
