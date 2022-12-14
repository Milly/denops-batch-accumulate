import { delay } from "https://deno.land/std@0.167.0/async/mod.ts";
import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.167.0/testing/asserts.ts";
import {
  assertSpyCallArgs,
  assertSpyCalls,
  stub,
} from "https://deno.land/std@0.167.0/testing/mock.ts";
import type { Denops } from "https://deno.land/x/denops_core@v3.3.0/mod.ts";
import { batch, gather } from "https://deno.land/x/denops_std@v3.12.0/batch/mod.ts";
import {
  stridx,
  strlen,
} from "https://deno.land/x/denops_std@v3.12.0/function/_generated.ts";
import { globals } from "https://deno.land/x/denops_std@v3.12.0/variable/mod.ts";
import { defer, DeferHelper } from "./defer.ts";

const denops_mock = {
  batch() {},
  dispatch() {},
} as unknown as Denops;

const stubBatch = (...values: unknown[]) =>
  stub(
    denops_mock,
    "batch",
    (...calls) => Promise.resolve(values.splice(0, calls.length) as unknown[]),
  );

const resolve = <T = unknown>(value: T) => Promise.resolve(value);

Deno.test("[defer] defer", async (t) => {
  let denops_batch_stub: ReturnType<typeof stub<Denops, "batch">> | undefined;

  const afterEach = () => {
    denops_batch_stub?.restore();
    denops_batch_stub = undefined;
  };

  const steps = {
    "returns one": async () => {
      denops_batch_stub = stubBatch(42);
      const actual = await defer(denops_mock, (helper) => {
        return strlen(helper, "foo");
      });
      assertEquals(actual, 42);
      assertSpyCalls(denops_batch_stub, 1);
      assertSpyCallArgs(denops_batch_stub, 0, [["strlen", "foo"]]);
    },
    "returns Object": async () => {
      denops_batch_stub = stubBatch(42, 123, 39);
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
    },
    "returns Array": async () => {
      denops_batch_stub = stubBatch(42, 123, 39);
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
    },
    "returns Set": async () => {
      denops_batch_stub = stubBatch(42, 123, 39);
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
    },
    "returns Map": async () => {
      denops_batch_stub = stubBatch(42, 123, 39);
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
    },
    "returns nested Map, Set, Array, Object": async () => {
      denops_batch_stub = stubBatch(42, 123, 39, 244, 8);
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
    },
    "returns chained Promise": async () => {
      denops_batch_stub = stubBatch(42, 123, 39);
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
    },
    "returns mixed Promise": async () => {
      denops_batch_stub = stubBatch(42, 123, 39);
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
    },
    "returns result dependent on cmd": async () => {
      denops_batch_stub = stubBatch(0, 42);
      const actual = await defer(denops_mock, async (helper) => {
        await helper.cmd("let g:foo = l:val", { val: 42 });
        const result = await globals.get(helper, "foo");
        return result;
      });
      assertEquals(actual, 42);
      assertSpyCalls(denops_batch_stub, 1);
      assertSpyCallArgs(denops_batch_stub, 0, [
        ["denops#api#cmd", "let g:foo = l:val", { val: 42 }],
        ["denops#api#eval", "exists(n) ? g:foo : v", { n: "g:foo", v: null }],
      ]);
    },
    "returns result dependent on previous Promise": async () => {
      denops_batch_stub = stubBatch(0, 42, 42);
      const actual = await defer(denops_mock, (helper) => {
        return [
          (async () => {
            await helper.cmd("let g:foo = l:val", { val: 42 });
            const result = await globals.get(helper, "foo");
            return result;
          })(),
          helper.eval("g:foo"),
        ];
      });
      assertEquals(actual, [42, 42]);
      assertSpyCalls(denops_batch_stub, 1);
      assertSpyCallArgs(denops_batch_stub, 0, [
        ["denops#api#cmd", "let g:foo = l:val", { val: 42 }],
        ["denops#api#eval", "g:foo", {}],
        ["denops#api#eval", "exists(n) ? g:foo : v", { n: "g:foo", v: null }],
      ]);
    },
    "returns nested defer": async () => {
      denops_batch_stub = stubBatch(3, 4, 1, 2);
      const actual = await defer(denops_mock, (helper) => {
        return {
          a: strlen(helper, "foo") as Promise<number>,
          b: defer(helper, (secondHelper) => {
            return [
              stridx(secondHelper, "bar", "a") as Promise<number>,
              stridx(secondHelper, "baz", "z") as Promise<number>,
            ];
          }),
          c: strlen(helper, "quux") as Promise<number>,
        };
      });
      assertEquals(actual, {a: 3, b: [1, 2], c: 4});
      assertSpyCalls(denops_batch_stub, 1);
      assertSpyCallArgs(denops_batch_stub, 0, [
        ["strlen", "foo"],
        ["strlen", "quux"],
        ["stridx", "bar", "a"],
        ["stridx", "baz", "z"],
      ]);
    },
    "returns nested gather": async () => {
      denops_batch_stub = stubBatch(3, 4, 1, 2);
      const actual = await defer(denops_mock, (helper) => {
        return {
          a: strlen(helper, "foo") as Promise<number>,
          b: gather(helper, async (gatherHelper) => {
            await stridx(gatherHelper, "bar", "a");
            await stridx(gatherHelper, "baz", "z");
          }) as Promise<number[]>,
          c: strlen(helper, "quux") as Promise<number>,
        };
      });
      assertEquals(actual, {a: 3, b: [1, 2], c: 4});
      assertSpyCalls(denops_batch_stub, 1);
      assertSpyCallArgs(denops_batch_stub, 0, [
        ["strlen", "foo"],
        ["strlen", "quux"],
        ["stridx", "bar", "a"],
        ["stridx", "baz", "z"],
      ]);
    },
    "returns nested batch": async () => {
      denops_batch_stub = stubBatch(3, 4, 1, 2);
      const actual = await defer(denops_mock, (helper) => {
        return {
          a: strlen(helper, "foo") as Promise<number>,
          b: batch(helper, async (gatherHelper) => {
            await stridx(gatherHelper, "bar", "a");
            await stridx(gatherHelper, "baz", "z");
          }),
          c: strlen(helper, "quux") as Promise<number>,
        };
      });
      assertEquals(actual, {a: 3, b: undefined, c: 4});
      assertSpyCalls(denops_batch_stub, 1);
      assertSpyCallArgs(denops_batch_stub, 0, [
        ["strlen", "foo"],
        ["strlen", "quux"],
        ["stridx", "bar", "a"],
        ["stridx", "baz", "z"],
      ]);
    },
    "throws error of call": async () => {
      denops_batch_stub = stub(
        denops_mock,
        "batch",
        () => Promise.reject(new Error("foobar error")),
      );
      await assertRejects(
        async () => {
          await defer(denops_mock, async (helper) => {
            await helper.call("strlen", "foo");
          });
        },
        Error,
        "foobar error",
      );
    },
    "throws error of cmd": async () => {
      denops_batch_stub = stub(
        denops_mock,
        "batch",
        () => Promise.reject(new Error("foobar error")),
      );
      await assertRejects(
        async () => {
          await defer(denops_mock, async (helper) => {
            await helper.cmd("foo");
          });
        },
        Error,
        "foobar error",
      );
    },
    "throws error after resolved": async () => {
      denops_batch_stub = stubBatch(3);
      await assertRejects(
        async () => {
          await defer(denops_mock, async (helper) => {
            await strlen(helper, "foo");
            throw new Error("foobar error");
          });
        },
        Error,
        "foobar error",
      );
    },
  };

  for (const [name, proc] of Object.entries(steps)) {
    await t.step(name, proc);
    afterEach();
  }
});

Deno.test("[defer] defer resolves", async (t) => {
  await t.step("Primitive", async () => {
    assertEquals(
      await defer(denops_mock, () => resolve(42)),
      42,
    );
  });

  await t.step("Primitive wrapper object", async () => {
    assertEquals(
      await defer(
        denops_mock,
        () => Object.assign(123, { foo: resolve("bar") }),
      ),
      Object.assign(123, { foo: "bar" }),
    );
  });

  await t.step("Object", async () => {
    assertEquals(
      await defer(denops_mock, () => ({ foo: resolve("bar"), qux: 123 })),
      { foo: "bar", qux: 123 },
    );
  });

  await t.step("Array", async () => {
    assertEquals(
      await defer(denops_mock, () => [42, resolve("foo")]),
      [42, "foo"],
    );
  });

  await t.step("Array extended", async () => {
    assertEquals(
      await defer(denops_mock, () =>
        Object.assign(
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
      await defer(denops_mock, () => new Set([42, resolve(123)])),
      new Set([42, 123]),
    );
  });

  await t.step("Set extended", async () => {
    assertEquals(
      await defer(denops_mock, () =>
        Object.assign(
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
      await defer(denops_mock, () => new Map([["foo", resolve(42)]])),
      new Map([["foo", 42]]),
    );
  });

  await t.step("Map keys", async () => {
    assertEquals(
      await defer(denops_mock, () => new Map([[resolve("foo"), 42]])),
      new Map([["foo", 42]]),
    );
  });

  await t.step("Map extended", async () => {
    assertEquals(
      await defer(denops_mock, () =>
        Object.assign(
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
      await defer(denops_mock, () => [
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

Deno.test("[defer] DeferHelper", async (t) => {
  await t.step("call", async (t) => {
    await t.step("throws error if called outside of 'defer'", async () => {
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
  });

  await t.step("cmd", async (t) => {
    await t.step("throws error if called outside of 'defer'", async () => {
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
  });

  await t.step("eval", async (t) => {
    await t.step("throws error if called outside of 'defer'", async () => {
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
  });

  await t.step("redraw", async (t) => {
    await t.step("throws error", async () => {
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
  });

  await t.step("batch", async (t) => {
    await t.step("throws error if called outside of 'defer'", async () => {
      let helper_saved = null as unknown as DeferHelper;
      await defer(denops_mock, (helper) => {
        helper_saved = helper;
      });
      await assertRejects(
        async () => {
          await helper_saved.batch(["strlen", "foo"]);
        },
        Error,
        "DeferHelper instance is not available outside of 'defer' block",
      );
    });
  });

  await t.step("dispatch", async (t) => {
    const denops_dispatch_stub = stub(
      denops_mock,
      "dispatch",
      () => Promise.resolve(),
    );

    await t.step("calls 'denops.dispatch'", async () => {
      await defer(denops_mock, async (helper) => {
        await helper.dispatch("plug", "method", "foo");
      });
      assertSpyCalls(denops_dispatch_stub, 1);
      assertSpyCallArgs(denops_dispatch_stub, 0, ["plug", "method", "foo"]);
    });

    denops_dispatch_stub.restore();
  });
});
