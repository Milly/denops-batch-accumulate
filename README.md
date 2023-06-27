# deno-denops-accumulate

[![license:MIT](https://img.shields.io/github/license/Milly/deno-denops-accumulate?style=flat-square)](LICENSE)
[![deno land](http://img.shields.io/badge/available%20on-deno.land/x/denops__accumulate-lightgrey.svg?logo=deno)](https://deno.land/x/denops_accumulate)

`accumulate` executes multiple denops functions together whenever possible to
reduce RPC overhead.

`accumulate` preserves the structure of the complex object returned by the
`executor` and resolves Promise it contains.

## Example

```typescript
import { Denops } from "https://deno.land/x/denops_core@v5.0.0/mod.ts";
import * as fn from "https://deno.land/x/denops_std@v5.0.1/function/mod.ts";
import { accumulate } from "https://deno.land/x/denops_accumulate/batch/accumulate.ts";

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
}
```

And the type of `results` are:

```typescript
const results: {
  lnum: number;
  keyword: string;
  len: number;
}[];
```

In the case of the example, the following 3 RPCs are called.

1. RPC call to `getline`.
2. Multiple `matchstr` calls in one RPC.
3. Multiple `len` calls in one RPC.
