import { expectTypeOf } from "expect-type";
import {
  Cursor,
  LocalCollection,
  Matcher,
  Sorter,
  Minimongo,
} from "./minimongo";
import type {
  MinimongoObserveCallbacks,
  MinimongoObserveChangesCallbacks,
  MinimongoObserveHandle,
  MinimongoFindOptions,
} from "./minimongo";

expectTypeOf<MinimongoObserveCallbacks>().toBeObject();
expectTypeOf<MinimongoObserveChangesCallbacks>().toBeObject();
expectTypeOf<MinimongoObserveHandle>().toBeObject();
expectTypeOf<MinimongoFindOptions>().toBeObject();

expectTypeOf(Cursor).toBeObject();
expectTypeOf(LocalCollection).toBeObject();
expectTypeOf(Matcher).toBeObject();
expectTypeOf(Sorter).toBeObject();
expectTypeOf(Minimongo).toBeObject();
