import { assertType, type IsExact } from "jsr:@std/testing/types";
import type { Denops } from "@denops/core";
import * as fn from "@denops/std/function";
import { withDenops } from "@denops/test";

import { collect } from "@denops/std/batch";
import { accumulate } from "./accumulate.ts";

const lines = Array
  .from({ length: 100 }, () => ["foo", " bar ", "++baz"])
  .flat();

async function setup(denops: Denops): Promise<void> {
  await fn.setline(denops, 1, lines);
}

type Result = {
  lnum: number;
  keyword: string;
  len: number;
};

const groups = ["vim", "nvim"] as const;
for (const group of groups) {
  Deno.bench("without batch", { group }, async (t) => {
    await withDenops(group, async (denops) => {
      await setup(denops);
      t.start();
      const lines = await fn.getline(denops, 1, "$");
      const results = await Promise.all(lines.map(async (line, index) => {
        const keyword = await fn.matchstr(denops, line, "\\k\\+");
        const len = await fn.len(denops, keyword);
        return {
          lnum: index + 1,
          keyword,
          len,
        };
      }));
      t.end();
      assertType<IsExact<typeof results, Result[]>>(true);
    });
  });

  Deno.bench("@denops/std/batch/collect", { group }, async (t) => {
    await withDenops(group, async (denops) => {
      await setup(denops);
      t.start();
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
      t.end();
      assertType<IsExact<typeof results, Result[]>>(true);
    });
  });

  Deno.bench(
    "@milly/denops-batch-accumulate",
    { baseline: true, group },
    async (t) => {
      await withDenops(group, async (denops) => {
        await setup(denops);
        t.start();
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
        t.end();
        assertType<IsExact<typeof results, Result[]>>(true);
      });
    },
  );
}
