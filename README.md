# deno-denops-accumulate

[![license:MIT](https://img.shields.io/github/license/Milly/deno-denops-accumulate?style=flat-square)](LICENSE)
[![deno land](http://img.shields.io/badge/available%20on-deno.land/x/denops__accumulate-lightgrey.svg?logo=deno)](https://deno.land/x/denops_accumulate)

`accumulate` resolves combined multiple denops calls like [`gather`][`gather`].

`accumulate` preserves the structure of the complex object returned by the
`executor` and resolves Promise it contains.

[`gather`]: https://deno.land/x/denops_std/batch/gather.ts?s=gather

## Example

To get `expected` from the following `input`:

```typescript
const input = [
  { word: "foo" },
  { word: "hello" },
  { word: "🚀☄" },
];

const expected = [
  { word: "foo", bytes: 3 },
  { word: "hello", bytes: 5 },
  { word: "🚀☄", bytes: 7 },
];
```

Using `accumulate`:

```typescript
const output = await accumulate(denops, (helper) =>
  input.map((item) => ({
    ...item,
    bytes: strlen(helper, item.word) as Promise<number>,
  })));
```

Using `gather` (requires intermediate variable):

```typescript
const intermediate = await gather(denops, async (helper) => {
  for (const item of input) {
    await strlen(helper, item.word);
  }
}) as Promise<number[]>;
const output = input.map((item, index) => ({
  ...item,
  bytes: intermediate[index],
}));
```
