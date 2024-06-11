Package.describe({
  summary: "Binary Heap datastructure implementation",
  version: '1.0.12-rc300.3',
});

Package.onUse(api => {
  api.export(['MaxHeap', 'MinHeap', 'MinMaxHeap']);
  api.use(['id-map', 'ecmascript']);
  api.mainModule('binary-heap.js');
});

Package.onTest(api => {
  api.use(['tinytest', 'binary-heap', 'ecmascript']);
  api.addFiles('binary-heap-tests.js');
});
