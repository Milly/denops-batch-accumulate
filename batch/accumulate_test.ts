import { delay } from "@std/async";
import { assertEquals, assertRejects, assertStrictEquals } from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import { assertSpyCalls, resolvesNext, spy, stub } from "@std/testing/mock";
import { DisposableStack } from "@nick/dispose";
import { BatchError, type Denops } from "@denops/core";
import { batch, collect } from "@denops/std/batch";
import { DenopsStub, test } from "@denops/test";

import { accumulate } from "./accumulate.ts";

Deno.test("accumulate() resolves", async (t) => {
  const mocked_denops = new DenopsStub();
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

  await t.step("undefined", async () => {
    using denops_batch = stubBatch(undefined);
    const actual = await accumulate(mocked_denops, (_helper) => {
      return undefined;
    });
    assertType<IsExact<typeof actual, undefined>>(true);
    assertEquals(actual, undefined);
    assertSpyCalls(denops_batch, 0);
  });
  await t.step("null", async () => {
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
  await t.step("number", async () => {
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
  await t.step("string", async () => {
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
  await t.step("boolean", async () => {
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
  await t.step("bigint", async () => {
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
  await t.step("Object", async () => {
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
  await t.step("Tuple", async () => {
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
  await t.step("Array", async () => {
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
  await t.step("Set", async () => {
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
  await t.step("Map values", async () => {
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
  await t.step("chained Promise", async () => {
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
  await t.step("delayed Promise", async () => {
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
  await t.step("0 delayed Promise", async () => {
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
  await t.step("nested 'accumulate()'", async () => {
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
  await t.step("nested 'batch()'", async () => {
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
  await t.step("nested 'collect()'", async () => {
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
    await denops.call("execute", [
      "let g:test_fn_call_args = []",
      "function! TestFn(...) abort",
      "  call add(g:test_fn_call_args, a:000->copy())",
      "endfunction",
    ]);

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
      let p: Promise<void> = Promise.resolve();

      await t.step("rejects an error", async () => {
        await assertRejects(
          () =>
            accumulate(denops, (helper) => {
              p = (async () => {
                await helper.call("strlen", "foo");
                await helper.call("strlen", "bar");
              })();
              throw new Error("test error");
            }),
          Error,
          "test error",
        );
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
    await t.step("if the executor rejects", async (t) => {
      using denops_batch = spy(denops, "batch");
      let p: Promise<void> = Promise.resolve();

      await t.step("rejects an error", async () => {
        await assertRejects(
          () =>
            accumulate(denops, (helper) => {
              p = (async () => {
                await helper.call("strlen", "foo");
                await helper.call("strlen", "bar");
              })();
              return Promise.reject(new Error("test error"));
            }),
          Error,
          "test error",
        );
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
    await t.step("AccumulateHelper", async (t) => {
      await t.step(".redraw()", async (t) => {
        await t.step("rejects an error", async () => {
          await accumulate(denops, async (helper) => {
            await assertRejects(
              () => helper.redraw(),
              Error,
              "method is not available",
            );
          });
        });
      });
      await t.step(".call()", async (t) => {
        await t.step("calls Vim function", async () => {
          await denops.call("execute", [
            "let g:test_fn_call_args = []",
          ]);
          await accumulate(denops, async (helper) => {
            await helper.call("TestFn", "foo", 1, true);
            await Promise.all([
              helper.call("TestFn", "a"),
              helper.call("TestFn", "b"),
              helper.call("TestFn", "c"),
            ]);
          });
          const actual = await denops.eval("g:test_fn_call_args");
          assertEquals(actual, [
            ["foo", 1, true],
            ["a"],
            ["b"],
            ["c"],
          ]);
        });
        await t.step("resolves a result of Vim function", async () => {
          let actual: unknown;
          await accumulate(denops, async (helper) => {
            actual = await helper.call("range", 2, 4);
          });
          assertEquals(actual, [2, 3, 4]);
        });
        await t.step("rejects an error when Vim throws", async () => {
          await accumulate(denops, async (helper) => {
            await assertRejects(
              () => helper.call("notexistsfn"),
              Error,
              "Unknown function: notexistsfn",
            );
          });
        });
      });
      await t.step(".cmd()", async (t) => {
        await t.step("executes Vim command", async () => {
          await denops.call("execute", [
            "let g:test_fn_call_args = []",
          ]);
          await accumulate(denops, async (helper) => {
            await helper.cmd("call TestFn('foo', 1, v:true)");
            await Promise.all([
              helper.cmd("call TestFn('a')"),
              helper.cmd("call TestFn(value)", { value: "b" }),
              helper.cmd("call TestFn(value)", { value: "c" }),
            ]);
          });
          const actual = await denops.eval("g:test_fn_call_args");
          assertEquals(actual, [
            ["foo", 1, true],
            ["a"],
            ["b"],
            ["c"],
          ]);
        });
        await t.step("rejects an error when Vim throws", async () => {
          await accumulate(denops, async (helper) => {
            await assertRejects(
              () => helper.cmd("call notexistsfn()"),
              Error,
              "Unknown function: notexistsfn",
            );
          });
        });
      });
      await t.step(".eval()", async (t) => {
        await t.step("evaluates Vim expression", async () => {
          await denops.call("execute", [
            "let g:test_fn_call_args = []",
          ]);
          await accumulate(denops, async (helper) => {
            await helper.eval("TestFn('foo', 1, v:true)");
            await Promise.all([
              helper.eval("TestFn('a')"),
              helper.eval("TestFn(value)", { value: "b" }),
              helper.eval("TestFn(value)", { value: "c" }),
            ]);
          });
          const actual = await denops.eval("g:test_fn_call_args");
          assertEquals(actual, [
            ["foo", 1, true],
            ["a"],
            ["b"],
            ["c"],
          ]);
        });
        await t.step("resolves a result of Vim expression", async () => {
          let actual: unknown;
          await accumulate(denops, async (helper) => {
            actual = await helper.eval("range(2, 4)");
          });
          assertEquals(actual, [2, 3, 4]);
        });
        await t.step("rejects an error when Vim throws", async () => {
          await accumulate(denops, async (helper) => {
            await assertRejects(
              () => helper.eval("notexistsfn()"),
              Error,
              "Unknown function: notexistsfn",
            );
          });
        });
      });
      await t.step(".batch()", async (t) => {
        await t.step("calls Vim functions", async () => {
          await denops.call("execute", [
            "let g:test_fn_call_args = []",
          ]);
          await accumulate(denops, async (helper) => {
            await helper.batch(
              ["TestFn", "foo", 1, true],
              ["TestFn", "a"],
              ["TestFn", "b"],
              ["TestFn", "c"],
            );
          });
          const actual = await denops.eval("g:test_fn_call_args");
          assertEquals(actual, [
            ["foo", 1, true],
            ["a"],
            ["b"],
            ["c"],
          ]);
        });
        await t.step("resolves results of Vim functions", async () => {
          let actual: unknown;
          await accumulate(denops, async (helper) => {
            actual = await helper.batch(
              ["range", 0, 2],
              ["range", 2, 4],
              ["matchstr", "hello", "el*"],
            );
          });
          assertEquals(actual, [
            [0, 1, 2],
            [2, 3, 4],
            "ell",
          ]);
        });
        await t.step("resolves an empty array if no arguments", async () => {
          using denops_batch = spy(denops, "batch");
          let actual: unknown;
          await accumulate(denops, async (helper) => {
            actual = await helper.batch();
          });
          assertEquals(actual, []);
          assertSpyCalls(denops_batch, 0);
        });
        await t.step("rejects a BatchError when Vim throws", async () => {
          await accumulate(denops, async (helper) => {
            const error = await assertRejects(
              () =>
                helper.batch(
                  ["range", 3],
                  ["range", 2, 4],
                  ["notexistsfn"],
                  ["range", 3],
                ),
              BatchError,
              "Unknown function: notexistsfn",
            );
            assertEquals(error.results, [[0, 1, 2], [2, 3, 4]]);
          });
        });
      });
      await t.step(".dispatch()", async (t) => {
        await t.step("dispatches the Plugin method", async () => {
          using denops_dispatch = stub(
            denops,
            "dispatch",
            resolvesNext(["one", "two", "three"]),
          );
          await accumulate(denops, async (helper) => {
            await helper.dispatch("pluginA", "foo", "bar", 42, false);
            await Promise.all([
              helper.dispatch("pluginA", "baz", 1),
              helper.dispatch("pluginB", "qux", 2),
            ]);
          });
          assertEquals(denops_dispatch.calls.map((c) => c.args), [
            ["pluginA", "foo", "bar", 42, false],
            ["pluginA", "baz", 1],
            ["pluginB", "qux", 2],
          ]);
        });
        await t.step("resolves a result of the Plugin method", async () => {
          using _denops_dispatch = stub(
            denops,
            "dispatch",
            resolvesNext(["one"]),
          );
          let actual: unknown;
          await accumulate(denops, async (helper) => {
            actual = await helper.dispatch("pluginA", "foo", "bar");
          });
          assertEquals(actual, "one");
        });
        await t.step(
          "rejects an error when the Plugin method rejects",
          async () => {
            using _denops_dispatch = stub(
              denops,
              "dispatch",
              resolvesNext([new Error("test plugin error")]),
            );
            await accumulate(denops, async (helper) => {
              await assertRejects(
                () => helper.dispatch("pluginA", "foo", "bar"),
                Error,
                "test plugin error",
              );
            });
          },
        );
      });
      await t.step(".name", async (t) => {
        await t.step("getter returns 'denops.name'", async () => {
          let actual: unknown;
          await accumulate(denops, (helper) => {
            actual = helper.name;
          });
          assertStrictEquals(actual, denops.name);
        });
      });
      await t.step(".meta", async (t) => {
        await t.step("getter returns 'denops.meta'", async () => {
          let actual: unknown;
          await accumulate(denops, (helper) => {
            actual = helper.meta;
          });
          assertStrictEquals(actual, denops.meta);
        });
      });
      await t.step(".interrupted", async (t) => {
        await t.step("getter returns 'denops.interrupted'", async () => {
          let actual: unknown;
          await accumulate(denops, (helper) => {
            actual = helper.interrupted;
          });
          assertStrictEquals(actual, denops.interrupted);
        });
      });
      await t.step(".context", async (t) => {
        await t.step("getter returns 'denops.context'", async () => {
          let actual: unknown;
          await accumulate(denops, (helper) => {
            actual = helper.context;
          });
          assertStrictEquals(actual, denops.context);
        });
      });
      await t.step(".dispatcher", async (t) => {
        const MY_DISPATCHER = {
          foo: () => {},
        };

        await t.step("setter sets to 'denops.dispatcher'", async () => {
          using stack = new DisposableStack();
          stack.adopt(denops.dispatcher, (saved) => {
            denops.dispatcher = saved;
          });
          await accumulate(denops, (helper) => {
            helper.dispatcher = MY_DISPATCHER;
          });
          assertStrictEquals(denops.dispatcher, MY_DISPATCHER);
        });
        await t.step("getter returns 'denops.dispatcher'", async () => {
          using stack = new DisposableStack();
          stack.adopt(denops.dispatcher, (saved) => {
            denops.dispatcher = saved;
          });
          denops.dispatcher = MY_DISPATCHER;
          let actual: unknown;
          await accumulate(denops, (helper) => {
            actual = helper.dispatcher;
          });
          assertStrictEquals(actual, MY_DISPATCHER);
        });
      });
      await t.step("if outside of the 'accumulate()' block", async (t) => {
        await t.step(".call()", async (t) => {
          using denops_batch = spy(denops, "batch");
          let helper_outside: Denops;
          await accumulate(denops, (helper) => {
            helper_outside = helper;
          });

          await t.step("rejects an error", async () => {
            await assertRejects(
              () => helper_outside.call("range", 0),
              Error,
              "not available outside",
            );
          });
          await t.step("does not call 'denops.batch()'", () => {
            assertSpyCalls(denops_batch, 0);
          });
        });
        await t.step(".cmd()", async (t) => {
          using denops_batch = spy(denops, "batch");
          let helper_outside: Denops;
          await accumulate(denops, (helper) => {
            helper_outside = helper;
          });

          await t.step("rejects an error", async () => {
            await assertRejects(
              () => helper_outside.cmd("echo 'hello'"),
              Error,
              "not available outside",
            );
          });
          await t.step("does not call 'denops.batch()'", () => {
            assertSpyCalls(denops_batch, 0);
          });
        });
        await t.step(".eval()", async (t) => {
          using denops_batch = spy(denops, "batch");
          let helper_outside: Denops;
          await accumulate(denops, (helper) => {
            helper_outside = helper;
          });

          await t.step("rejects an error", async () => {
            await assertRejects(
              () => helper_outside.eval("123"),
              Error,
              "not available outside",
            );
          });
          await t.step("does not call 'denops.batch()'", () => {
            assertSpyCalls(denops_batch, 0);
          });
        });
        await t.step(".batch()", async (t) => {
          using denops_batch = spy(denops, "batch");
          let helper_outside: Denops;
          await accumulate(denops, (helper) => {
            helper_outside = helper;
          });

          await t.step("rejects an error", async () => {
            await assertRejects(
              () => helper_outside.batch(["range", 0]),
              Error,
              "not available outside",
            );
          });
          await t.step("does not call 'denops.batch()'", () => {
            assertSpyCalls(denops_batch, 0);
          });
        });
      });
    });
  },
});
