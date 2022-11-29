import { delay } from "https://deno.land/std@0.166.0/async/mod.ts";
import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.166.0/testing/asserts.ts";
import {
  assertSpyCallArgs,
  assertSpyCalls,
  stub,
} from "https://deno.land/std@0.166.0/testing/mock.ts";
import type { Denops } from "https://deno.land/x/denops_core@v3.2.0/mod.ts";
import {
  stridx,
  strlen,
} from "https://deno.land/x/denops_std@v3.9.1/function/_generated.ts";
import { _internal, defer, DeferHelper } from "./defer.ts";

Deno.test("[defer]", async (t) => {
  const denops_mock = {
    batch() {},
    dispatch() {},
  } as unknown as Denops;

  const stubBatch = (...values: unknown[]) =>
    stub(
      denops_mock,
      "batch",
      (...calls) =>
        Promise.resolve(values.splice(0, calls.length) as unknown[]),
    );

  await t.step("defer", async (t) => {
    {
      const denops_batch_stub = stubBatch(42);

      await t.step("returns one", async () => {
        const actual = await defer(denops_mock, (helper) => {
          return strlen(helper, "foo");
        });
        assertEquals(actual, 42);
        assertSpyCalls(denops_batch_stub, 1);
        assertSpyCallArgs(denops_batch_stub, 0, [["strlen", "foo"]]);
      });

      denops_batch_stub.restore();
    }

    {
      const denops_batch_stub = stubBatch(42, 123, 39);

      await t.step("returns Object", async () => {
        const actual = await defer(denops_mock, (helper) => {
          return {
            a: strlen(helper, "foo"),
            b: stridx(helper, "bar", "a"),
            c: strlen(helper, "baz"),
          };
        });
        assertEquals(actual, { a: 42, b: 123, c: 39 });
        assertSpyCalls(denops_batch_stub, 1);
        assertSpyCallArgs(denops_batch_stub, 0, [
          ["strlen", "foo"],
          ["stridx", "bar", "a"],
          ["strlen", "baz"],
        ]);
      });

      denops_batch_stub.restore();
    }

    {
      const denops_batch_stub = stubBatch(42, 123, 39);

      await t.step("returns Array", async () => {
        const actual = await defer(denops_mock, (helper) => {
          return [
            strlen(helper, "foo"),
            stridx(helper, "bar", "a"),
            strlen(helper, "baz"),
          ];
        });
        assertEquals(actual, [42, 123, 39]);
        assertSpyCalls(denops_batch_stub, 1);
        assertSpyCallArgs(denops_batch_stub, 0, [
          ["strlen", "foo"],
          ["stridx", "bar", "a"],
          ["strlen", "baz"],
        ]);
      });

      denops_batch_stub.restore();
    }

    {
      const denops_batch_stub = stubBatch(42, 123, 39);

      await t.step("returns Set", async () => {
        const actual = await defer(denops_mock, (helper) => {
          return new Set([
            strlen(helper, "foo"),
            stridx(helper, "bar", "a"),
            strlen(helper, "baz"),
          ]);
        });
        assertEquals(actual, new Set([42, 123, 39]));
        assertSpyCalls(denops_batch_stub, 1);
        assertSpyCallArgs(denops_batch_stub, 0, [
          ["strlen", "foo"],
          ["stridx", "bar", "a"],
          ["strlen", "baz"],
        ]);
      });

      denops_batch_stub.restore();
    }

    {
      const denops_batch_stub = stubBatch(42, 123, 39);

      await t.step("returns Map", async () => {
        const actual = await defer(denops_mock, (helper) => {
          return new Map<unknown, unknown>([
            [strlen(helper, "foo"), 55.5],
            [2, stridx(helper, "bar", "a")],
            [3, strlen(helper, "baz")],
          ]);
        });
        assertEquals(
          actual,
          new Map([
            [42, 55.5],
            [2, 123],
            [3, 39],
          ]),
        );
        assertSpyCalls(denops_batch_stub, 1);
        assertSpyCallArgs(denops_batch_stub, 0, [
          ["strlen", "foo"],
          ["stridx", "bar", "a"],
          ["strlen", "baz"],
        ]);
      });

      denops_batch_stub.restore();
    }

    {
      const denops_batch_stub = stubBatch(42, 123, 39, 244, 8);

      await t.step("returns nested", async () => {
        const actual = await defer(denops_mock, (helper) => {
          return new Map<unknown, unknown>([
            [
              strlen(helper, "foo"),
              {
                a: new Set([
                  stridx(helper, "bar", "a"),
                ]),
                b: ["baz", "qux", "quux"].map((s) => {
                  return strlen(helper, s);
                }),
              },
            ],
          ]);
        });
        assertEquals(
          actual,
          new Map([
            [
              42,
              {
                a: new Set([123]),
                b: [39, 244, 8],
              },
            ],
          ]),
        );
        assertSpyCalls(denops_batch_stub, 1);
        assertSpyCallArgs(denops_batch_stub, 0, [
          ["strlen", "foo"],
          ["stridx", "bar", "a"],
          ["strlen", "baz"],
          ["strlen", "qux"],
          ["strlen", "quux"],
        ]);
      });

      denops_batch_stub.restore();
    }

    {
      const denops_batch_stub = stubBatch(42, 123, 39);

      await t.step("returns chained", async () => {
        const actual = await defer(denops_mock, (helper) => {
          return (strlen(helper, "foo") as Promise<number>).then((value) => {
            return [
              stridx(helper, "bar", "a", value) as Promise<number>,
              strlen(helper, "baz") as Promise<number>,
            ];
          });
        });
        assertEquals(actual, [123, 39]);
        assertSpyCalls(denops_batch_stub, 2);
        assertSpyCallArgs(denops_batch_stub, 0, [["strlen", "foo"]]);
        assertSpyCallArgs(denops_batch_stub, 1, [
          ["stridx", "bar", "a", 42],
          ["strlen", "baz"],
        ]);
      });

      denops_batch_stub.restore();
    }

    {
      const denops_batch_stub = stubBatch(42, 123, 39);

      await t.step("returns mixed Promise", async () => {
        const actual = await defer(denops_mock, (helper) => {
          const result = Promise.all([
            strlen(helper, "foo") as Promise<number>,
            delay(100),
          ]).then(([value]) => {
            return [
              stridx(helper, "bar", "a", value) as Promise<number>,
              delay(100).then(() => {
                return strlen(helper, "baz") as Promise<number>;
              }),
            ];
          });
          return result;
        });
        assertEquals(actual, [123, 39]);
        assertSpyCalls(denops_batch_stub, 3);
        assertSpyCallArgs(denops_batch_stub, 0, [["strlen", "foo"]]);
        assertSpyCallArgs(denops_batch_stub, 1, [["stridx", "bar", "a", 42]]);
        assertSpyCallArgs(denops_batch_stub, 2, [["strlen", "baz"]]);
      });

      denops_batch_stub.restore();
    }
  });

  await t.step("resolveResult", async (t) => {
    const resolve = <T = unknown>(value: T) => Promise.resolve(value);

    await t.step("Primitive", async () => {
      assertEquals(
        await _internal.resolveResult(resolve(42)),
        42,
      );
    });

    await t.step("Primitive wrapper object", async () => {
      assertEquals(
        await _internal.resolveResult(
          Object.assign(123, { foo: resolve("bar") }),
        ),
        Object.assign(123, { foo: "bar" }),
      );
    });

    await t.step("Object", async () => {
      assertEquals(
        await _internal.resolveResult({ foo: resolve("bar"), qux: 123 }),
        { foo: "bar", qux: 123 },
      );
    });

    await t.step("Array", async () => {
      assertEquals(
        await _internal.resolveResult([42, resolve("foo")]),
        [42, "foo"],
      );
    });

    await t.step("Array extended", async () => {
      assertEquals(
        await _internal.resolveResult(Object.assign(
          [42, resolve("foo")],
          { bar: resolve(123) },
        )),
        Object.assign(
          [42, "foo"],
          { bar: 123 },
        ),
      );
    });

    await t.step("Set", async () => {
      assertEquals(
        await _internal.resolveResult(new Set([42, resolve(123)])),
        new Set([42, 123]),
      );
    });

    await t.step("Set extended", async () => {
      assertEquals(
        await _internal.resolveResult(Object.assign(
          new Set([42, resolve(123)]),
          { foo: resolve("bar") },
        )),
        Object.assign(
          new Set([42, 123]),
          { foo: "bar" },
        ),
      );
    });

    await t.step("Map values", async () => {
      assertEquals(
        await _internal.resolveResult(new Map([["foo", resolve(42)]])),
        new Map([["foo", 42]]),
      );
    });

    await t.step("Map keys", async () => {
      assertEquals(
        await _internal.resolveResult(new Map([[resolve("foo"), 42]])),
        new Map([["foo", 42]]),
      );
    });

    await t.step("Map extended", async () => {
      assertEquals(
        await _internal.resolveResult(Object.assign(
          new Map([["foo", resolve(42)]]),
          { foo: resolve("bar") },
        )),
        Object.assign(
          new Map([["foo", 42]]),
          { foo: "bar" },
        ),
      );
    });

    await t.step("nested", async () => {
      assertEquals(
        await _internal.resolveResult([
          {
            foo: new Set([
              new Map([
                [["foo", resolve("bar")], resolve(42)],
              ]),
            ]),
            bar: resolve(["qux", 123]),
          },
        ]),
        [
          {
            foo: new Set([
              new Map([
                [["foo", "bar"], 42],
              ]),
            ]),
            bar: ["qux", 123],
          },
        ],
      );
    });
  });

  await t.step("DeferHelper", async (t) => {
    await t.step("call", async () => {
      let helper_saved = null as unknown as DeferHelper;
      await defer(denops_mock, (helper) => {
        helper_saved = helper;
      });
      await assertRejects(
        async () => {
          await helper_saved.call("strlen", "foo");
        },
        Error,
        "DeferHelper instance is not available outside of 'defer' block",
      );
    });

    await t.step("cmd", async () => {
      let helper_saved = null as unknown as DeferHelper;
      await defer(denops_mock, (helper) => {
        helper_saved = helper;
      });
      await assertRejects(
        async () => {
          await helper_saved.cmd("echomsg 'foo'");
        },
        Error,
        "DeferHelper instance is not available outside of 'defer' block",
      );
    });

    await t.step("eval", async () => {
      let helper_saved = null as unknown as DeferHelper;
      await defer(denops_mock, (helper) => {
        helper_saved = helper;
      });
      await assertRejects(
        async () => {
          await helper_saved.eval("42 + 123");
        },
        Error,
        "DeferHelper instance is not available outside of 'defer' block",
      );
    });

    await t.step("redraw", async () => {
      await assertRejects(
        async () => {
          await defer(denops_mock, async (helper) => {
            await helper.redraw();
          });
        },
        Error,
        "The 'redraw' method is not available on DeferHelper.",
      );
    });

    await t.step("batch", async () => {
      await assertRejects(
        async () => {
          await defer(denops_mock, async (helper) => {
            await helper.batch(["strlen", "foo"]);
          });
        },
        Error,
        "The 'batch' method is not available on DeferHelper.",
      );
    });

    {
      const denops_dispatch_stub = stub(
        denops_mock,
        "dispatch",
        () => Promise.resolve(),
      );

      await t.step("dispatch", async () => {
        await defer(denops_mock, async (helper) => {
          await helper.dispatch("plug", "method", "foo");
        });
        assertSpyCalls(denops_dispatch_stub, 1);
        assertSpyCallArgs(denops_dispatch_stub, 0, ["plug", "method", "foo"]);
      });

      denops_dispatch_stub.restore();
    }
  });
});
