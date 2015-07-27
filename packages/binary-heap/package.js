Package.describe({
  summary: "Binary Heap datastructure implementation",
  version: '1.0.4-plugins.0'
});

Package.onUse(function (api) {
  api.export('MaxHeap');
  api.export('MinHeap');
  api.export('MinMaxHeap');
  api.use(['underscore', 'id-map']);
  api.addFiles(['max-heap.js', 'min-heap.js', 'min-max-heap.js']);
});

Package.onTest(function (api) {
  api.use('tinytest');
  api.use('binary-heap');
  api.addFiles('binary-heap-tests.js');
});
