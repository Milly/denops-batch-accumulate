# denops-batch-accumulate

[![license:MIT](https://img.shields.io/github/license/Milly/denops-batch-accumulate?style=flat-square)](LICENSE)
[![jsr](https://jsr.io/badges/@milly/denops-batch-accumulate)](https://jsr.io/@milly/denops-batch-accumulate)
[![codecov](https://codecov.io/gh/Milly/denops-batch-accumulate/graph/badge.svg?token=76N25YHGZO)](https://codecov.io/gh/Milly/denops-batch-accumulate)

denops-batch-accumulate is helper library for [Denops][].

`accumulate` aggregates all denops functions called during the current task's
execution and resolves them in a single RPC call.

Note that functions with side effects should be avoided, and if you do, the
order in which you call them should be carefully considered.

[Denops]: https://github.com/vim-denops/denops.vim

## Example

```typescript
import { assertType, IsExact } from "jsr:@std/testing/types";
import { Denops } from "jsr:@denops/core";
import * as fn from "jsr:@denops/std/function";
import { accumulate } from "jsr:@milly/denops-batch-accumulate";

export async function main(denops: Denops): Promise<void> {
  const results = await accumulate(denops, async (denops) => {
    const lines = await fn.getline(denops, 1, "$");
    return await Promise.all(lines.map(async (line, index) => {
      const keyword = await fn.matchstr(denops, line, "\\k\\+");
      const len = await fn.len(denops, keyword);
      return {
        lnum: index + 1,
        keyword,
        len,
      };
    }));
  });

  assertType<
    IsExact<
      typeof results,
      { lnum: number; keyword: string; len: number }[]
    >
  >(true);
}
```

In the case of the example, the following 3 RPCs are called.

1. RPC call to `getline`.
2. Multiple `matchstr` calls in one RPC.
3. Multiple `len` calls in one RPC.

## Why use `accumulate()` instead of `collect()` of `@denops/std/batch`?

The above example can be rewritten using `collect()`, but this is less intuitive
because you need to get intermediate results when you want to generate a complex
object as a result.

```typescript
import { assertType, IsExact } from "jsr:@std/testing/types";
import { Denops } from "jsr:@denops/core";
import * as fn from "jsr:@denops/std/function";
import { collect } from "jsr:@denops/std/batch";

export async function main(denops: Denops): Promise<void> {
  const lines = await fn.getline(denops, 1, "$");
  const keywords = await collect(
    denops,
    (denops) => lines.map((line) => fn.matchstr(denops, line, "\\k\\+")),
  );
  const lens = await collect(
    denops,
    (denops) => keywords.map((keyword) => fn.len(denops, keyword)),
  );
  const results = keywords.map((keyword, index) => ({
    lnum: index + 1,
    keyword,
    len: lens[index],
  }));

  assertType<
    IsExact<
      typeof results,
      { lnum: number; keyword: string; len: number }[]
    >
  >(true);
}
```

## Benchmark

It runs as fast as `collect()`.

```
> deno task bench
Task bench deno bench -A
cpu: 12th Gen Intel(R) Core(TM) i7-1260P
runtime: deno 1.45.0 (x86_64-pc-windows-msvc)

file:///D:/work/vim/denops-batch-accumulate/batch/accumulate_bench.ts
benchmark                           time (avg)        iter/s             (min … max)       p75       p99      p995
------------------------------------------------------------------------------------ -----------------------------

group vim
without batch                      118.61 ms/iter           8.4   (91.95 ms … 159.5 ms) 123.95 ms 159.5 ms 159.5 ms
@denops/std/batch/collect           15.49 ms/iter          64.6   (13.18 ms … 23.86 ms) 14.74 ms 23.86 ms 23.86 ms
@milly/denops-batch-accumulate      15.59 ms/iter          64.1   (14.49 ms … 17.79 ms) 15.96 ms 17.79 ms 17.79 ms

summary
  @milly/denops-batch-accumulate
   1.01x slower than @denops/std/batch/collect
   7.61x faster than without batch

group nvim
without batch                      128.08 ms/iter           7.8 (111.96 ms … 198.39 ms) 128.63 ms 198.39 ms 198.39 ms
@denops/std/batch/collect           14.87 ms/iter          67.3    (11.7 ms … 19.47 ms) 16.27 ms 19.47 ms 19.47 ms
@milly/denops-batch-accumulate      14.02 ms/iter          71.3    (11.91 ms … 19.8 ms) 14.82 ms 19.8 ms 19.8 ms

summary
  @milly/denops-batch-accumulate
   1.06x faster than @denops/std/batch/collect
   9.14x faster than without batch
```
