import { expectTypeOf } from "expect-type";
import { DiffSequence } from "./diff-sequence";

interface Doc {
  _id?: string;
  name: string;
  value: number;
}

expectTypeOf(DiffSequence).toBeObject();

// DiffObserver shape
expectTypeOf<DiffSequence.DiffObserver<Doc>>().toEqualTypeOf<{
  added?: (id: string, fields: Partial<Doc>) => void;
  addedBefore?: (id: string, fields: Partial<Doc>, before: string | null) => void;
  changed?: (id: string, fields: Partial<Doc>) => void;
  movedBefore?: (id: string, before: string | null) => void;
  removed?: (id: string) => void;
}>();

// DiffOptions
expectTypeOf<DiffSequence.DiffOptions<Doc>>().toEqualTypeOf<{
  projectionFn?: (doc: Doc) => Partial<Doc>;
}>();

// ObjectDiffCallbacks
expectTypeOf<DiffSequence.ObjectDiffCallbacks<number>>().toEqualTypeOf<{
  leftOnly?: (key: string, leftValue: number) => void;
  rightOnly?: (key: string, rightValue: number) => void;
  both?: (key: string, leftValue: number, rightValue: number) => void;
}>();

// MapDiffCallbacks with custom key type
expectTypeOf<DiffSequence.MapDiffCallbacks<symbol, Doc>>().toEqualTypeOf<{
  leftOnly?: (key: symbol, leftValue: Doc) => void;
  rightOnly?: (key: symbol, rightValue: Doc) => void;
  both?: (key: symbol, leftValue: Doc, rightValue: Doc) => void;
}>();

// Function references (generic signatures)
expectTypeOf(DiffSequence.diffQueryChanges).toBeFunction();
expectTypeOf(DiffSequence.diffQueryUnorderedChanges).toBeFunction();
expectTypeOf(DiffSequence.diffQueryOrderedChanges).toBeFunction();
expectTypeOf(DiffSequence.diffObjects).toBeFunction();
expectTypeOf(DiffSequence.diffMaps).toBeFunction();
expectTypeOf(DiffSequence.makeChangedFields).toBeFunction();
expectTypeOf(DiffSequence.applyChanges).toBeFunction();

// Usage checks — exercise argument inference
const observer: DiffSequence.DiffObserver<Doc> = {
  added: (id, fields) => {
    expectTypeOf(id).toBeString();
    expectTypeOf(fields).toEqualTypeOf<Partial<Doc>>();
  },
  addedBefore: (id, fields, before) => {
    expectTypeOf(before).toEqualTypeOf<string | null>();
    expectTypeOf(fields).toEqualTypeOf<Partial<Doc>>();
  },
  removed: (id) => expectTypeOf(id).toBeString(),
};

expectTypeOf(
  DiffSequence.diffQueryChanges<Doc>(true, [], new Map(), observer, {
    projectionFn: (d) => ({ name: d.name }),
  }),
).toBeVoid();

expectTypeOf(
  DiffSequence.diffQueryUnorderedChanges<Doc>(new Map(), new Map(), observer),
).toBeVoid();

expectTypeOf(DiffSequence.diffQueryOrderedChanges<Doc>([], [], observer)).toBeVoid();

expectTypeOf(
  DiffSequence.diffObjects<number>(
    { a: 1 },
    { a: 2 },
    {
      both: (key, l, r) => {
        expectTypeOf(key).toBeString();
        expectTypeOf(l).toBeNumber();
        expectTypeOf(r).toBeNumber();
      },
    },
  ),
).toBeVoid();

expectTypeOf(
  DiffSequence.diffMaps<string, Doc>(new Map(), new Map(), {
    rightOnly: (k, v) => {
      expectTypeOf(k).toBeString();
      expectTypeOf(v).toEqualTypeOf<Doc>();
    },
  }),
).toBeVoid();

type BagDoc = Record<string, unknown>;
expectTypeOf(DiffSequence.makeChangedFields<BagDoc>({ a: 1 }, { b: 2 })).toEqualTypeOf<
  Partial<BagDoc>
>();

expectTypeOf(DiffSequence.applyChanges<BagDoc>({ a: 1 }, { a: undefined, b: 3 })).toBeVoid();
