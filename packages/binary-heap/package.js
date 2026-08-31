Package.describe({
  summary: "Binary Heap datastructure implementation",
  version: "1.0.13",
});

Package.onUse((api) => {
  api.export(["MaxHeap", "MinHeap", "MinMaxHeap"]);
  api.use(["id-map", "ecmascript"]);
  api.mainModule("binary-heap.js");
  api.types("binary-heap.d.ts");
});

Package.onTest((api) => {
  api.use(["tinytest", "binary-heap", "ecmascript"]);
  api.addFiles("binary-heap-tests.js");
});
