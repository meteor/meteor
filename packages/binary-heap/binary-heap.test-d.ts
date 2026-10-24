import { expectTypeOf } from "expect-type";
import { MaxHeap, MinHeap, MinMaxHeap } from "./binary-heap";

expectTypeOf<MaxHeap<number>>().toBeObject();
expectTypeOf<MinHeap<number>>().toBeObject();
expectTypeOf<MinMaxHeap<number>>().toBeObject();

const heap = new MaxHeap<number>((a, b) => a - b);
expectTypeOf(heap.get).parameters.toEqualTypeOf<[string]>();
expectTypeOf(heap.get).returns.toEqualTypeOf<number | null>();
expectTypeOf(heap.set).parameters.toEqualTypeOf<[string, number]>();
expectTypeOf(heap.has).returns.toBeBoolean();
expectTypeOf(heap.size).returns.toBeNumber();
expectTypeOf(heap.clone).returns.toEqualTypeOf<MaxHeap<number>>();
expectTypeOf(heap.maxElementId).returns.toEqualTypeOf<string | null>();

expectTypeOf(new MinHeap<number>((a, b) => a - b).minElementId).returns.toEqualTypeOf<
  string | null
>();
expectTypeOf(new MinMaxHeap<number>((a, b) => a - b).minElementId).returns.toEqualTypeOf<
  string | null
>();
