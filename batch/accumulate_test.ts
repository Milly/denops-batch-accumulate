import { delay } from "@std/async";
import { assertEquals, assertRejects, assertStrictEquals } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import { assertSpyCalls, resolvesNext, spy, stub } from "@std/testing/mock";
import type { Denops } from "@denops/core";
import { batch, collect } from "@denops/std/batch";
import { test } from "@denops/test";

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
  await t.step("resolves undefined", async () => {
    using denops_batch = stubBatch(undefined);
    const actual = await accumulate(mocked_denops, (_helper) => {
      return undefined;
    });
    assertType<IsExact<typeof actual, undefined>>(true);
    assertEquals(actual, undefined);
    assertSpyCalls(denops_batch, 0);
  });
  await t.step("resolves null", async () => {
    using denops_batch = stubBatch(null);
    const actual = await accumulate(mocked_denops, (helper) => {
      return helper.call("eval", "v:none") as Promise<null>;
    });
    assertType<IsExact<typeof actual, null>>(true);
    assertEquals(actual, null);
    assertEquals(denops_batch.calls.map((c) => c.args), [
      [["eval", "v:none"]],
    ]);
  });
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
  await t.step("resolves Object", async () => {
    using denops_batch = stubBatch(42, "a", true);
    const actual = await accumulate(mocked_denops, async (helper) => {
      const [a, b, c] = await Promise.all([
        helper.call("strlen", "foo") as Promise<number>,
        helper.call("matchstr", "bar", "a") as Promise<string>,
        helper.call("eval", "v:true") as Promise<boolean>,
      ]);
      return { a, b, c };
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
      return Promise.all([
        helper.call("strlen", "foo") as Promise<number>,
        helper.call("matchstr", "bar", "a") as Promise<string>,
        helper.call("eval", "v:true") as Promise<boolean>,
      ]);
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
  await t.step("resolves Array", async () => {
    using denops_batch = stubBatch(42, 123, 39);
    const actual = await accumulate(mocked_denops, (helper) => {
      const items = ["foo", "bar", "baz"];
      return Promise.all(items.map(
        (item) => helper.call("strlen", item) as Promise<number>,
      ));
    });
    assertType<IsExact<typeof actual, (number)[]>>(true);
    assertEquals(actual, [42, 123, 39]);
    assertEquals(denops_batch.calls.map((c) => c.args), [
      [
        ["strlen", "foo"],
        ["strlen", "bar"],
        ["strlen", "baz"],
      ],
    ]);
  });
  await t.step("resolves Set", async () => {
    using denops_batch = stubBatch(42, 123, 39);
    const actual = await accumulate(mocked_denops, async (helper) => {
      return new Set(
        await Promise.all([
          helper.call("strlen", "foo") as Promise<number>,
          helper.call("matchstr", "bar", "a") as Promise<string>,
          helper.call("strlen", "baz") as Promise<number>,
        ]),
      );
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
  await t.step("resolves Map values", async () => {
    using denops_batch = stubBatch(42, 123, 39);
    const actual = await accumulate(mocked_denops, async (helper) => {
      const items = ["foo", "bar", "baz"];
      return new Map(
        await Promise.all(
          items.map(async (item) =>
            [item, await helper.call("strlen", item) as number] as const
          ),
        ),
      );
    });
    assertType<IsExact<typeof actual, Map<string, number>>>(true);
    assertEquals(
      actual,
      new Map([
        ["foo", 42],
        ["bar", 123],
        ["baz", 39],
      ]),
    );
    assertEquals(denops_batch.calls.map((c) => c.args), [
      [
        ["strlen", "foo"],
        ["strlen", "bar"],
        ["strlen", "baz"],
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
      return await Promise.all([
        helper.call("stridx", "bar", "a", a) as Promise<number>,
        helper.call("stridx", "baz", "b", b) as Promise<number>,
      ]);
    });
    assertType<IsExact<typeof actual, [number, number]>>(true);
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
    const values = [42, 123, 39];
    using denops_batch = stub(
      mocked_denops,
      "batch",
      async (...calls) => {
        if (calls.length > values.length) {
          return Promise.reject(new Error("Too few values"));
        }
        const results = values.splice(0, calls.length);
        await delay(50);
        return results;
      },
    );
    const actual = await accumulate(mocked_denops, async (helper) => {
      return await Promise.all(
        [
          helper.call("strlen", "foo") as Promise<number>,
          (async () => {
            const b = helper.call("strlen", "bar") as Promise<number>;
            await delay(100);
            const c = helper.call("strlen", "baz") as Promise<number>;
            return Promise.all([b, c]);
          })(),
        ] as const,
      );
    });
    assertType<
      IsExact<typeof actual, [number, [number, number]]>
    >(true);
    assertEquals(actual, [42, [123, 39]]);
    assertEquals(denops_batch.calls.map((c) => c.args), [
      [
        ["strlen", "foo"],
        ["strlen", "bar"],
      ],
      [["strlen", "baz"]],
    ]);
  });
  await t.step("resolves 0 delayed Promise", async () => {
    const values = [42, 123, 39];
    using denops_batch = stub(
      mocked_denops,
      "batch",
      async (...calls) => {
        if (calls.length > values.length) {
          return Promise.reject(new Error("Too few values"));
        }
        const results = values.splice(0, calls.length);
        await delay(50);
        return results;
      },
    );
    const actual = await accumulate(mocked_denops, async (helper) => {
      return await Promise.all(
        [
          helper.call("strlen", "foo") as Promise<number>,
          (async () => {
            const b = helper.call("strlen", "bar") as Promise<number>;
            await delay(0);
            const c = helper.call("strlen", "baz") as Promise<number>;
            return Promise.all([b, c]);
          })(),
        ] as const,
      );
    });
    assertType<
      IsExact<typeof actual, [number, [number, number]]>
    >(true);
    assertEquals(actual, [42, [123, 39]]);
    assertEquals(denops_batch.calls.map((c) => c.args), [
      [
        ["strlen", "foo"],
        ["strlen", "bar"],
      ],
      [["strlen", "baz"]],
    ]);
  });
  await t.step("resolves nested 'accumulate()'", async () => {
    using denops_batch = stubBatch(1, 2, 3, 4);
    const actual = await accumulate(mocked_denops, (helper) => {
      return Promise.all([
        helper.call("strlen", "foo") as Promise<number>,
        accumulate(helper, (innerHelper) => {
          return Promise.all([
            innerHelper.call("stridx", "bar", "a") as Promise<number>,
            innerHelper.call("stridx", "baz", "z") as Promise<number>,
          ]);
        }),
        helper.call("strlen", "quux") as Promise<number>,
      ]);
    });
    assertType<
      IsExact<typeof actual, [number, [number, number], number]>
    >(true);
    assertEquals(actual, [1, [3, 4], 2]);
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
      return Promise.all([
        helper.call("strlen", "foo") as Promise<number>,
        batch(helper, async (batchHelper) => {
          await batchHelper.call("stridx", "bar", "a");
          await batchHelper.call("stridx", "baz", "z");
        }),
        helper.call("strlen", "quux") as Promise<number>,
      ]);
    });
    assertType<IsExact<typeof actual, [number, void, number]>>(true);
    assertEquals(actual, [1, undefined, 2]);
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
      return Promise.all([
        helper.call("strlen", "foo") as Promise<number>,
        collect(helper, (collectHelper) => [
          collectHelper.call("stridx", "bar", "a") as Promise<number>,
          collectHelper.call("stridx", "baz", "z") as Promise<number>,
        ]),
        helper.call("strlen", "quux") as Promise<number>,
      ]);
    });
    assertType<
      IsExact<typeof actual, [number, [number, number], number]>
    >(true);
    assertEquals(actual, [1, [3, 4], 2]);
    assertEquals(denops_batch.calls.map((c) => c.args), [
      [
        ["strlen", "foo"],
        ["strlen", "quux"],
        ["stridx", "bar", "a"],
        ["stridx", "baz", "z"],
      ],
    ]);
  });
});

test({
  mode: "all",
  name: "accumulate()",
  fn: async (denops, t) => {
    await t.step("resolves 'helper.call()' sequentially", async () => {
      const results = await accumulate(denops, (helper) =>
        Promise.all([
          helper.call("range", 0),
          helper.call("range", 1),
          helper.call("range", 2),
        ]));
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
      const results = await accumulate(denops, (helper) =>
        Promise.all([
          helper.eval("g:denops_accumulate_test + 1"),
          helper.eval("g:denops_accumulate_test - 1"),
          helper.eval("g:denops_accumulate_test * 10"),
        ]));
      assertEquals(results, [11, 9, 100]);
    });
    await t.step("resolves 'helper.batch()' sequentially", async () => {
      await denops.cmd("let g:denops_accumulate_test = 20");
      const results = await accumulate(denops, (helper) =>
        Promise.all([
          helper.batch(
            ["eval", "g:denops_accumulate_test + 1"],
            ["eval", "g:denops_accumulate_test - 1"],
          ),
          helper.batch(
            ["eval", "g:denops_accumulate_test * 10"],
          ),
        ]));
      assertEquals(results, [[21, 19], [200]]);
    });
    await t.step("resolves 'helper.batch()' with empty", async () => {
      await denops.cmd("let g:denops_accumulate_test = 20");
      const results = await accumulate(denops, (helper) => helper.batch());
      assertEquals(results, []);
    });
    await t.step("resolves 'helper.dispatch()' sequentially", async () => {
      using denops_dispatch = stub(
        denops,
        "dispatch",
        resolvesNext(["one", "two"]),
      );
      await denops.cmd("let g:denops_accumulate_test = 20");
      const results = await accumulate(denops, (helper) =>
        Promise.all([
          helper.dispatch("someplugin", "foomethod", "bararg", 42, false),
          helper.dispatch("otherplugin", "barmethod", true, "quxarg", 0),
        ]));
      assertEquals(results, ["one", "two"]);
      assertEquals(denops_dispatch.calls.map((c) => c.args), [
        ["someplugin", "foomethod", "bararg", 42, false],
        ["otherplugin", "barmethod", true, "quxarg", 0],
      ]);
    });
    await t.step("if the executor resolves", async (t) => {
      using denops_batch = spy(denops, "batch");
      let p: Promise<void> = Promise.resolve();
      await accumulate(denops, (helper) => {
        p = (async () => {
          await helper.call("strlen", "foo");
          await helper.call("strlen", "bar");
        })();
      });
      await t.step("calls pending batch 'calls'", () => {
        assertEquals(denops_batch.calls.map((c) => c.args), [
          [["strlen", "foo"]],
        ]);
      });
      await t.step("rejects subsequent batch 'calls'", async () => {
        await assertRejects(() => p, Error, "not available outside");
      });
    });
    await t.step("if the executor throws", async (t) => {
      using denops_batch = spy(denops, "batch");
      await t.step("rejects an error", async () => {
        await assertRejects(
          async () => {
            await accumulate(denops, (helper) => {
              helper.call("strlen", "foo");
              throw new Error("test error");
            });
          },
          Error,
          "test error",
        );
      });
      await t.step("does not calls pending batch 'calls'", () => {
        assertSpyCalls(denops_batch, 0);
      });
    });
    await t.step("if the executor rejects", async (t) => {
      await t.step("rejects an error", async () => {
        await assertRejects(
          async () => {
            await accumulate(denops, async (helper) => {
              await helper.call("strlen", "foo");
              throw new Error("test error");
            });
          },
          Error,
          "test error",
        );
      });
    });
    await t.step("rejects an error when 'helper.redraw()' calls", async () => {
      await assertRejects(
        async () => {
          await accumulate(denops, async (helper) => {
            await helper.redraw();
          });
        },
        Error,
        "method is not available",
      );
    });
    await t.step("rejects an error when 'helper.call()' rejects", async () => {
      await assertRejects(
        async () => {
          await accumulate(denops, async (helper) => {
            await helper.call("notexistsfn");
          });
        },
        Error,
        "Unknown function: notexistsfn",
      );
    });
    await t.step("rejects an error when 'helper.cmd()' rejects", async () => {
      await assertRejects(
        async () => {
          await accumulate(denops, async (helper) => {
            await helper.cmd("call notexistsfn()");
          });
        },
        Error,
        "Unknown function: notexistsfn",
      );
    });
    await t.step("rejects an error when 'helper.eval()' rejects", async () => {
      await assertRejects(
        async () => {
          await accumulate(denops, async (helper) => {
            await helper.eval("notexistsfn()");
          });
        },
        Error,
        "Unknown function: notexistsfn",
      );
    });
    await t.step("rejects an error when 'helper.batch()' rejects", async () => {
      await assertRejects(
        async () => {
          await accumulate(denops, async (helper) => {
            await helper.batch(
              ["range", 0],
              ["notexistsfn"],
            );
          });
        },
        Error,
        "Unknown function: notexistsfn",
      );
    });
    await t.step("helper.name", async (t) => {
      await t.step("getter returns 'denops.name'", async () => {
        let actual: unknown;
        await accumulate(denops, (helper) => {
          actual = helper.name;
        });
        assertStrictEquals(actual, denops.name);
      });
    });
    await t.step("helper.meta", async (t) => {
      await t.step("getter returns 'denops.meta'", async () => {
        let actual: unknown;
        await accumulate(denops, (helper) => {
          actual = helper.meta;
        });
        assertStrictEquals(actual, denops.meta);
      });
    });
    await t.step("helper.context", async (t) => {
      await t.step("getter returns 'denops.context'", async () => {
        let actual: unknown;
        await accumulate(denops, (helper) => {
          actual = helper.context;
        });
        assertStrictEquals(actual, denops.context);
      });
    });
    await t.step("helper.dispatcher", async (t) => {
      const MY_DISPATCHER = {
        foo: () => {},
      };

      await t.step("setter sets to 'denops.dispatcher'", async () => {
        await accumulate(denops, (helper) => {
          helper.dispatcher = MY_DISPATCHER;
        });
        assertStrictEquals(denops.dispatcher, MY_DISPATCHER);
      });
      await t.step("getter returns 'denops.dispatcher'", async () => {
        let actual: unknown;
        await accumulate(denops, (helper) => {
          actual = helper.dispatcher;
        });
        assertStrictEquals(actual, MY_DISPATCHER);
      });
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
            Error,
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
            Error,
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
            Error,
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
            Error,
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
