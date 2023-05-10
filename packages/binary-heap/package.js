Package.describe({
  summary: "Binary Heap datastructure implementation",
  version: '2.0.0-alpha300.5',
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
