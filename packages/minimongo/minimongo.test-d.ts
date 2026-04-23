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

expectTypeOf(Cursor).toBeFunction();
expectTypeOf(LocalCollection).toBeFunction();
expectTypeOf(Matcher).toBeFunction();
expectTypeOf(Sorter).toBeFunction();
expectTypeOf(Minimongo).toBeObject();
