# denops-batch-accumulate

[![license:MIT](https://img.shields.io/github/license/Milly/denops-batch-accumulate?style=flat-square)](LICENSE)
[![jsr](https://jsr.io/badges/@milly/denops-batch-accumulate)](https://jsr.io/@milly/denops-batch-accumulate)
[![codecov](https://codecov.io/gh/Milly/denops-batch-accumulate/graph/badge.svg?token=76N25YHGZO)](https://codecov.io/gh/Milly/denops-batch-accumulate)

denops-batch-accumulate is helper library for [Denops][].

`accumulate` calls multiple denops functions together whenever possible to
reduce RPC overhead.

`accumulate` preserves the structure of the complex object returned by the
`executor` and resolves Promise it contains.

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
    return lines.map(async (line, index) => {
      const keyword = await fn.matchstr(denops, line, "\\k\\+");
      return {
        lnum: index + 1,
        keyword,
        len: fn.len(denops, keyword),
      };
    });
  });
  assertType<
    IsExact<
      typeof results,
      { lnum: number; keyword: string; len: number; }[]
    >
  >(true);
}
```

In the case of the example, the following 3 RPCs are called.

1. RPC call to `getline`.
2. Multiple `matchstr` calls in one RPC.
3. Multiple `len` calls in one RPC.
