Package.describe({
  summary: "Binary Heap datastructure implementation",
  internal: true
});

Package.on_use(function (api) {
  api.export('MaxHeap');
  api.export('MinMaxHeap');
  api.use(['underscore', 'id-map']);
  api.add_files(['max-heap.js', 'min-max-heap.js']);
});

Package.on_test(function (api) {
  api.use('tinytest');
  api.use('binary-heap');
  api.add_files('binary-heap-tests.js');
});

