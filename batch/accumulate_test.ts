import { delay } from "https://deno.land/std@0.224.0/async/mod.ts";
import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  assertType,
  IsExact,
} from "https://deno.land/std@0.224.0/testing/types.ts";
import {
  assertSpyCalls,
  resolvesNext,
  spy,
  stub,
} from "https://deno.land/std@0.224.0/testing/mock.ts";
import type { Denops } from "https://deno.land/x/denops_core@v6.1.0/mod.ts";
import {
  batch,
  collect,
} from "https://deno.land/x/denops_std@v6.5.1/batch/mod.ts";
import { test } from "https://deno.land/x/denops_test@v1.8.0/mod.ts";
import { accumulate } from "./accumulate.ts";

const mocked_denops = {
  batch() {},
  dispatch() {},
} as unknown as Denops;

const stubBatch = (...values: unknown[]) =>
  stub(
    mocked_denops,
    "batch",
    (...calls) => {
      if (calls.length > values.length) {
        return Promise.reject(new Error("Too few values"));
      }
      return Promise.resolve(values.splice(0, calls.length));
    },
  );

Deno.test("accumulate()", async (t) => {
  await t.step("resolves number", async () => {
    using denops_batch = stubBatch(42);
    const actual = await accumulate(mocked_denops, (helper) => {
      return helper.call("strlen", "foo") as Promise<number>;
    });
    assertType<IsExact<typeof actual, number>>(true);
    assertEquals(actual, 42);
    assertEquals(denops_batch.calls.map((c) => c.args), [
      [["strlen", "foo"]],
    ]);
  });
  await t.step("resolves number wrapper object", async () => {
    using denops_batch = stubBatch(42);
    const actual = await accumulate(mocked_denops, (helper) => {
      return Object.assign(39 as number, {
        bar: helper.call("strlen", "baz") as Promise<number>,
      });
    });
    assertType<IsExact<typeof actual, number & { bar: number }>>(true);
    assertEquals(actual, Object.assign(39, { bar: 42 }));
    assertEquals(denops_batch.calls.map((c) => c.args), [
      [["strlen", "baz"]],
    ]);
  });
  await t.step("resolves string", async () => {
    using denops_batch = stubBatch("foo");
    const actual = await accumulate(mocked_denops, (helper) => {
      return helper.call("matchstr", "foo", ".*") as Promise<string>;
    });
    assertType<IsExact<typeof actual, string>>(true);
    assertEquals(actual, "foo");
    assertEquals(denops_batch.calls.map((c) => c.args), [
      [["matchstr", "foo", ".*"]],
    ]);
  });
  await t.step("resolves string wrapper object", async () => {
    using denops_batch = stubBatch(42);
    const actual = await accumulate(mocked_denops, (helper) => {
      return Object.assign("foo" as string, {
        bar: helper.call("strlen", "baz") as Promise<number>,
      });
    });
    assertType<IsExact<typeof actual, string & { bar: number }>>(true);
    assertEquals(actual, Object.assign("foo", { bar: 42 }));
    assertEquals(denops_batch.calls.map((c) => c.args), [
      [["strlen", "baz"]],
    ]);
  });
  await t.step("resolves boolean", async () => {
    using denops_batch = stubBatch(true);
    const actual = await accumulate(mocked_denops, (helper) => {
      return helper.call("eval", "v:true") as Promise<boolean>;
    });
    assertType<IsExact<typeof actual, boolean>>(true);
    assertEquals(actual, true);
    assertEquals(denops_batch.calls.map((c) => c.args), [
      [["eval", "v:true"]],
    ]);
  });
  await t.step("resolves boolean wrapper object", async () => {
    using denops_batch = stubBatch(42);
    const actual = await accumulate(mocked_denops, (helper) => {
      return Object.assign(true as boolean, {
        bar: helper.call("strlen", "baz") as Promise<number>,
      });
    });
    assertType<IsExact<typeof actual, boolean & { bar: number }>>(true);
    assertEquals(actual, Object.assign(true, { bar: 42 }));
    assertEquals(denops_batch.calls.map((c) => c.args), [
      [["strlen", "baz"]],
    ]);
  });
  await t.step("resolves bigint", async () => {
    using denops_batch = stubBatch(42);
    const actual = await accumulate(mocked_denops, async (helper) => {
      return BigInt(await helper.call("strlen", "foo") as number);
    });
    assertType<IsExact<typeof actual, bigint>>(true);
    assertEquals(actual, 42n);
    assertEquals(denops_batch.calls.map((c) => c.args), [
      [["strlen", "foo"]],
    ]);
  });
  await t.step("resolves bigint wrapper object", async () => {
    using denops_batch = stubBatch(42);
    const actual = await accumulate(mocked_denops, (helper) => {
      return Object.assign(39n as bigint, {
        bar: helper.call("strlen", "baz") as Promise<number>,
      });
    });
    assertType<IsExact<typeof actual, bigint & { bar: number }>>(true);
    assertEquals(actual, Object.assign(39n, { bar: 42 }));
    assertEquals(denops_batch.calls.map((c) => c.args), [
      [["strlen", "baz"]],
    ]);
  });
  await t.step("resolves Object", async () => {
    using denops_batch = stubBatch(42, "a", true);
    const actual = await accumulate(mocked_denops, (helper) => {
      return {
        a: helper.call("strlen", "foo") as Promise<number>,
        b: helper.call("matchstr", "bar", "a") as Promise<string>,
        c: helper.call("eval", "v:true") as Promise<boolean>,
      };
    });
    assertType<
      IsExact<typeof actual, { a: number; b: string; c: boolean }>
    >(true);
    assertEquals(actual, { a: 42, b: "a", c: true });
    assertEquals(denops_batch.calls.map((c) => c.args), [
      [
        ["strlen", "foo"],
        ["matchstr", "bar", "a"],
        ["eval", "v:true"],
      ],
    ]);
  });
  await t.step("resolves Tuple", async () => {
    using denops_batch = stubBatch(42, "a", true);
    const actual = await accumulate(mocked_denops, (helper) => {
      return [
        helper.call("strlen", "foo") as Promise<number>,
        helper.call("matchstr", "bar", "a") as Promise<string>,
        helper.call("eval", "v:true") as Promise<boolean>,
      ] as const;
    });
    assertType<IsExact<typeof actual, [number, string, boolean]>>(true);
    assertEquals(actual, [42, "a", true]);
    assertEquals(denops_batch.calls.map((c) => c.args), [
      [
        ["strlen", "foo"],
        ["matchstr", "bar", "a"],
        ["eval", "v:true"],
      ],
    ]);
  });
  await t.step("resolves Tuple extended", async () => {
    using denops_batch = stubBatch(42, "a", true);
    const actual = await accumulate(mocked_denops, (helper) => {
      return Object.assign(
        [
          helper.call("strlen", "foo") as Promise<number>,
          helper.call("matchstr", "bar", "a") as Promise<string>,
        ] as const,
        {
          c: helper.call("eval", "v:true") as Promise<boolean>,
        },
      );
    });
    assertType<IsExact<typeof actual, [number, string] & { c: boolean }>>(true);
    assertEquals(actual, Object.assign([42, "a"], { c: true }));
    assertEquals(denops_batch.calls.map((c) => c.args), [
      [
        ["strlen", "foo"],
        ["matchstr", "bar", "a"],
        ["eval", "v:true"],
      ],
    ]);
  });
  await t.step("resolves Array", async () => {
    using denops_batch = stubBatch(42, "a", true);
    const actual = await accumulate(mocked_denops, (helper) => {
      return [
        helper.call("strlen", "foo") as Promise<number>,
        helper.call("matchstr", "bar", "a") as Promise<string>,
        helper.call("eval", "v:true") as Promise<boolean>,
      ];
    });
    assertType<IsExact<typeof actual, (number | string | boolean)[]>>(true);
    assertEquals(actual, [42, "a", true]);
    assertEquals(denops_batch.calls.map((c) => c.args), [
      [
        ["strlen", "foo"],
        ["matchstr", "bar", "a"],
        ["eval", "v:true"],
      ],
    ]);
  });
  await t.step("resolves Array extended", async () => {
    using denops_batch = stubBatch(42, "a", true);
    const actual = await accumulate(mocked_denops, (helper) => {
      return Object.assign([
        helper.call("strlen", "foo") as Promise<number>,
        helper.call("matchstr", "bar", "a") as Promise<string>,
      ], {
        c: helper.call("eval", "v:true") as Promise<boolean>,
      });
    });
    assertType<
      IsExact<typeof actual, (number | string)[] & { c: boolean }>
    >(true);
    assertEquals(actual, Object.assign([42, "a"], { c: true }));
    assertEquals(denops_batch.calls.map((c) => c.args), [
      [
        ["strlen", "foo"],
        ["matchstr", "bar", "a"],
        ["eval", "v:true"],
      ],
    ]);
  });
  await t.step("resolves Set", async () => {
    using denops_batch = stubBatch(42, 123, 39);
    const actual = await accumulate(mocked_denops, (helper) => {
      return new Set([
        helper.call("strlen", "foo") as Promise<number>,
        helper.call("matchstr", "bar", "a") as Promise<string>,
        helper.call("strlen", "baz") as Promise<number>,
      ]);
    });
    assertType<IsExact<typeof actual, Set<number | string>>>(true);
    assertEquals(actual, new Set([42, 123, 39]));
    assertEquals(denops_batch.calls.map((c) => c.args), [
      [
        ["strlen", "foo"],
        ["matchstr", "bar", "a"],
        ["strlen", "baz"],
      ],
    ]);
  });
  await t.step("resolves Set extended", async () => {
    using denops_batch = stubBatch(42, "a", true);
    const actual = await accumulate(mocked_denops, (helper) => {
      return Object.assign(
        new Set([
          helper.call("strlen", "foo") as Promise<number>,
          helper.call("matchstr", "bar", "a") as Promise<string>,
        ]),
        {
          c: helper.call("eval", "v:true") as Promise<boolean>,
        },
      );
    });
    assertType<
      IsExact<typeof actual, Set<number | string> & { c: boolean }>
    >(true);
    assertEquals(actual, Object.assign(new Set([42, "a"]), { c: true }));
    assertEquals(denops_batch.calls.map((c) => c.args), [
      [
        ["strlen", "foo"],
        ["matchstr", "bar", "a"],
        ["eval", "v:true"],
      ],
    ]);
  });
  await t.step("resolves Map values", async () => {
    using denops_batch = stubBatch(42, 39);
    const actual = await accumulate(mocked_denops, (helper) => {
      return new Map([
        ["a", helper.call("strlen", "foo") as Promise<number>],
        ["b", helper.call("strlen", "bar") as Promise<number>],
      ]);
    });
    assertType<IsExact<typeof actual, Map<string, number>>>(true);
    assertEquals(
      actual,
      new Map([
        ["a", 42],
        ["b", 39],
      ]),
    );
    assertEquals(denops_batch.calls.map((c) => c.args), [
      [
        ["strlen", "foo"],
        ["strlen", "bar"],
      ],
    ]);
  });
  await t.step("resolves Map keys", async () => {
    using denops_batch = stubBatch(42, 39);
    const actual = await accumulate(mocked_denops, (helper) => {
      return new Map([
        [helper.call("strlen", "foo") as Promise<number>, "a"],
        [helper.call("strlen", "bar") as Promise<number>, "b"],
      ]);
    });
    assertType<IsExact<typeof actual, Map<number, string>>>(true);
    assertEquals(
      actual,
      new Map([[42, "a"], [39, "b"]]),
    );
    assertEquals(denops_batch.calls.map((c) => c.args), [
      [
        ["strlen", "foo"],
        ["strlen", "bar"],
      ],
    ]);
  });
  await t.step("resolves Map extended", async () => {
    using denops_batch = stubBatch(42, "b", true);
    const actual = await accumulate(mocked_denops, (helper) => {
      return Object.assign(
        new Map<number | Promise<number>, string | Promise<string>>([
          [helper.call("strlen", "foo") as Promise<number>, "a"],
          [39, helper.call("matchstr", "bar", "b") as Promise<string>],
        ]),
        {
          c: helper.call("eval", "v:true") as Promise<boolean>,
        },
      );
    });
    assertType<
      IsExact<typeof actual, Map<number, string> & { c: boolean }>
    >(true);
    assertEquals(
      actual,
      Object.assign(new Map([[42, "a"], [39, "b"]]), { c: true }),
    );
    assertEquals(denops_batch.calls.map((c) => c.args), [
      [
        ["strlen", "foo"],
        ["matchstr", "bar", "b"],
        ["eval", "v:true"],
      ],
    ]);
  });
  await t.step("resolves nested Map, Set, Array, Object", async () => {
    using denops_batch = stubBatch(42, "a", 39, 244, 8);
    const actual = await accumulate(mocked_denops, (helper) => {
      return new Map([
        [
          helper.call("strlen", "foo") as Promise<number>,
          {
            a: new Set([
              helper.call("matchstr", "bar", "a") as Promise<string>,
            ]),
            b: ["baz", "qux", "quux"].map((s) => {
              return helper.call("strlen", s) as Promise<number>;
            }),
          },
        ],
      ]);
    });
    assertType<
      IsExact<typeof actual, Map<number, { a: Set<string>; b: number[] }>>
    >(true);
    assertEquals(
      actual,
      new Map([
        [
          42,
          {
            a: new Set(["a"]),
            b: [39, 244, 8],
          },
        ],
      ]),
    );
    assertEquals(denops_batch.calls.map((c) => c.args), [
      [
        ["strlen", "foo"],
        ["matchstr", "bar", "a"],
        ["strlen", "baz"],
        ["strlen", "qux"],
        ["strlen", "quux"],
      ],
    ]);
  });
  await t.step("resolves chained Promise", async () => {
    using denops_batch = stubBatch(42, 39, 123, 456);
    const actual = await accumulate(mocked_denops, async (helper) => {
      const [a, b] = await Promise.all([
        helper.call("strlen", "foo"),
        helper.call("strlen", "bar"),
      ]);
      return [
        helper.call("stridx", "bar", "a", a) as Promise<number>,
        helper.call("stridx", "baz", "b", b) as Promise<number>,
      ];
    });
    assertType<IsExact<typeof actual, number[]>>(true);
    assertEquals(actual, [123, 456]);
    assertEquals(denops_batch.calls.map((c) => c.args), [
      [
        ["strlen", "foo"],
        ["strlen", "bar"],
      ],
      [
        ["stridx", "bar", "a", 42],
        ["stridx", "baz", "b", 39],
      ],
    ]);
  });
  await t.step("resolves delayed Promise", async () => {
    using denops_batch = stubBatch(42, 39, 123, 456);
    const actual = await accumulate(mocked_denops, async (helper) => {
      const [a, b] = await Promise.all(
        [
          helper.call("strlen", "foo") as Promise<number>,
          (async () => {
            const res = helper.call("strlen", "bar") as Promise<number>;
            await delay(100);
            return res;
          })(),
        ] as const,
      );
      return [
        helper.call("stridx", "bar", "a", a) as Promise<number>,
        (async () => {
          await delay(100);
          return helper.call("stridx", "baz", "b", b) as Promise<number>;
        })(),
      ] as const;
    });
    assertType<IsExact<typeof actual, [number, number]>>(true);
    assertEquals(actual, [123, 456]);
    assertEquals(denops_batch.calls.map((c) => c.args), [
      [
        ["strlen", "foo"],
        ["strlen", "bar"],
      ],
      [["stridx", "bar", "a", 42]],
      [["stridx", "baz", "b", 39]],
    ]);
  });
  await t.step("resolves nested 'accumulate()'", async () => {
    using denops_batch = stubBatch(1, 2, 3, 4);
    const actual = await accumulate(mocked_denops, (helper) => {
      return {
        a: helper.call("strlen", "foo") as Promise<number>,
        b: accumulate(helper, (innerHelper) => {
          return [
            innerHelper.call("stridx", "bar", "a") as Promise<number>,
            innerHelper.call("stridx", "baz", "z") as Promise<number>,
          ];
        }),
        c: helper.call("strlen", "quux") as Promise<number>,
      };
    });
    assertEquals(actual, { a: 1, b: [3, 4], c: 2 });
    assertEquals(denops_batch.calls.map((c) => c.args), [
      [
        ["strlen", "foo"],
        ["strlen", "quux"],
        ["stridx", "bar", "a"],
        ["stridx", "baz", "z"],
      ],
    ]);
  });
  await t.step("resolves nested 'batch()'", async () => {
    using denops_batch = stubBatch(1, 2, 3, 4);
    const actual = await accumulate(mocked_denops, (helper) => {
      return {
        a: helper.call("strlen", "foo") as Promise<number>,
        b: batch(helper, async (batchHelper) => {
          await batchHelper.call("stridx", "bar", "a");
          await batchHelper.call("stridx", "baz", "z");
        }),
        c: helper.call("strlen", "quux") as Promise<number>,
      };
    });
    assertEquals(actual, { a: 1, b: undefined, c: 2 });
    assertEquals(denops_batch.calls.map((c) => c.args), [
      [
        ["strlen", "foo"],
        ["strlen", "quux"],
        ["stridx", "bar", "a"],
        ["stridx", "baz", "z"],
      ],
    ]);
  });
  await t.step("resolves nested 'collect()'", async () => {
    using denops_batch = stubBatch(1, 2, 3, 4);
    const actual = await accumulate(mocked_denops, (helper) => {
      return {
        a: helper.call("strlen", "foo") as Promise<number>,
        b: collect(helper, (collectHelper) => [
          collectHelper.call("stridx", "bar", "a") as Promise<number>,
          collectHelper.call("stridx", "baz", "z") as Promise<number>,
        ]),
        c: helper.call("strlen", "quux") as Promise<number>,
      };
    });
    assertEquals(actual, { a: 1, b: [3, 4], c: 2 });
    assertEquals(denops_batch.calls.map((c) => c.args), [
      [
        ["strlen", "foo"],
        ["strlen", "quux"],
        ["stridx", "bar", "a"],
        ["stridx", "baz", "z"],
      ],
    ]);
  });
  await t.step("rejects an error that thrown in the executor", async () => {
    using denops_batch = stubBatch();
    await assertRejects(
      async () => {
        await accumulate(mocked_denops, (_helper) => {
          throw new Error("test error");
        });
      },
      Error,
      "test error",
    );
    assertSpyCalls(denops_batch, 0);
  });
  await t.step("rejects an error that rejected in the executor", async () => {
    using denops_batch = stubBatch();
    await assertRejects(
      async () => {
        await accumulate(mocked_denops, (_helper) => {
          return Promise.reject(new Error("test error"));
        });
      },
      Error,
      "test error",
    );
    assertSpyCalls(denops_batch, 0);
  });
  await t.step(
    "rejects an error that thrown after 'helper.call()' calls",
    async () => {
      using denops_batch = stubBatch(42);
      await assertRejects(
        async () => {
          await accumulate(mocked_denops, (helper) => {
            helper.call("strlen", "foo");
            throw new Error("test error");
          });
        },
        Error,
        "test error",
      );
      assertSpyCalls(denops_batch, 1);
    },
  );
  await t.step(
    "rejects an error that rejects after 'helper.call()' calls",
    async () => {
      using denops_batch = stubBatch(42);
      await assertRejects(
        async () => {
          await accumulate(mocked_denops, async (helper) => {
            await helper.call("strlen", "foo");
            throw new Error("test error");
          });
        },
        Error,
        "test error",
      );
      assertSpyCalls(denops_batch, 1);
    },
  );
});

test({
  mode: "all",
  name: "accumulate()",
  fn: async (denops, t) => {
    await t.step("resolves 'helper.call()' sequentially", async () => {
      const results = await accumulate(denops, (helper) => [
        helper.call("range", 0),
        helper.call("range", 1),
        helper.call("range", 2),
      ]);
      assertEquals(results, [[], [0], [0, 1]]);
    });
    await t.step("resolves 'helper.cmd()' sequentially", async () => {
      await denops.cmd("let g:denops_accumulate_test = []");
      const results = await accumulate(denops, async (helper) => {
        await helper.cmd("call add(g:denops_accumulate_test, 1)");
        await helper.cmd("call add(g:denops_accumulate_test, 2)");
        await helper.cmd("call add(g:denops_accumulate_test, 3)");
      });
      assertEquals(results, undefined);
      assertEquals(await denops.eval("g:denops_accumulate_test"), [1, 2, 3]);
    });
    await t.step("resolves 'helper.eval()' sequentially", async () => {
      await denops.cmd("let g:denops_accumulate_test = 10");
      const results = await accumulate(denops, (helper) => [
        helper.eval("g:denops_accumulate_test + 1"),
        helper.eval("g:denops_accumulate_test - 1"),
        helper.eval("g:denops_accumulate_test * 10"),
      ]);
      assertEquals(results, [11, 9, 100]);
    });
    await t.step("resolves 'helper.batch()' sequentially", async () => {
      await denops.cmd("let g:denops_accumulate_test = 20");
      const results = await accumulate(denops, (helper) => [
        helper.batch(
          ["eval", "g:denops_accumulate_test + 1"],
          ["eval", "g:denops_accumulate_test - 1"],
        ),
        helper.batch(
          ["eval", "g:denops_accumulate_test * 10"],
        ),
      ]);
      assertEquals(results, [[21, 19], [200]]);
    });
    await t.step("resolves 'helper.batch()' with empty", async () => {
      await denops.cmd("let g:denops_accumulate_test = 20");
      const results = await accumulate(denops, (helper) => [
        helper.batch(),
      ]);
      assertEquals(results, [[]]);
    });
    await t.step("resolves 'helper.dispatch()' sequentially", async () => {
      using denops_dispatch = stub(
        denops,
        "dispatch",
        resolvesNext(["one", "two"]),
      );
      await denops.cmd("let g:denops_accumulate_test = 20");
      const results = await accumulate(denops, (helper) => [
        helper.dispatch("someplugin", "foomethod", "bararg", 42, false),
        helper.dispatch("otherplugin", "barmethod", true, "quxarg", 0),
      ]);
      assertEquals(results, ["one", "two"]);
      assertEquals(denops_dispatch.calls.map((c) => c.args), [
        ["someplugin", "foomethod", "bararg", 42, false],
        ["otherplugin", "barmethod", true, "quxarg", 0],
      ]);
    });
    await t.step("rejects an error when 'helper.redraw()' calls", async () => {
      await assertRejects(
        async () => {
          await accumulate(denops, (helper) => [
            helper.redraw(),
          ]);
        },
        Error,
        "method is not available",
      );
    });
    await t.step("rejects an error when 'helper.call()' rejects", async () => {
      await assertRejects(
        async () => {
          await accumulate(denops, (helper) => [
            helper.call("notexistsfn"),
          ]);
        },
        Error,
        "Unknown function: notexistsfn",
      );
    });
    await t.step("rejects an error when 'helper.cmd()' rejects", async () => {
      await assertRejects(
        async () => {
          await accumulate(denops, (helper) => [
            helper.cmd("call notexistsfn()"),
          ]);
        },
        Error,
        "Unknown function: notexistsfn",
      );
    });
    await t.step("rejects an error when 'helper.eval()' rejects", async () => {
      await assertRejects(
        async () => {
          await accumulate(denops, (helper) => [
            helper.eval("notexistsfn()"),
          ]);
        },
        Error,
        "Unknown function: notexistsfn",
      );
    });
    await t.step("rejects an error when 'helper.batch()' rejects", async () => {
      await assertRejects(
        async () => {
          await accumulate(denops, (helper) => [
            helper.batch(
              ["range", 0],
              ["notexistsfn"],
            ),
          ]);
        },
        Error,
        "Unknown function: notexistsfn",
      );
    });
    await t.step("if outside of the 'accumulate' block", async (t) => {
      await t.step("helper.call()", async (t) => {
        using denops_batch = spy(denops, "batch");
        let helper_outside: Denops;
        await accumulate(denops, (helper) => {
          helper_outside = helper;
        });

        await t.step("rejects an error", async () => {
          await assertRejects(
            async () => {
              await helper_outside.call("range", 0);
            },
            "not available outside",
          );
        });
        await t.step("does not call 'denops.batch()'", () => {
          assertSpyCalls(denops_batch, 0);
        });
      });
      await t.step("helper.cmd()", async (t) => {
        using denops_batch = spy(denops, "batch");
        let helper_outside: Denops;
        await accumulate(denops, (helper) => {
          helper_outside = helper;
        });

        await t.step("rejects an error", async () => {
          await assertRejects(
            async () => {
              await helper_outside.cmd("echo 'hello'");
            },
            "not available outside",
          );
        });
        await t.step("does not call 'denops.batch()'", () => {
          assertSpyCalls(denops_batch, 0);
        });
      });
      await t.step("helper.eval()", async (t) => {
        using denops_batch = spy(denops, "batch");
        let helper_outside: Denops;
        await accumulate(denops, (helper) => {
          helper_outside = helper;
        });

        await t.step("rejects an error", async () => {
          await assertRejects(
            async () => {
              await helper_outside.eval("123");
            },
            "not available outside",
          );
        });
        await t.step("does not call 'denops.batch()'", () => {
          assertSpyCalls(denops_batch, 0);
        });
      });
      await t.step("helper.batch()", async (t) => {
        using denops_batch = spy(denops, "batch");
        let helper_outside: Denops;
        await accumulate(denops, (helper) => {
          helper_outside = helper;
        });

        await t.step("rejects an error", async () => {
          await assertRejects(
            async () => {
              await helper_outside.batch(["range", 0]);
            },
            "not available outside",
          );
        });
        await t.step("does not call 'denops.batch()'", () => {
          assertSpyCalls(denops_batch, 0);
        });
      });
    });
  },
});
