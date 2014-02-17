Package.describe({
  summary: "Binary Heap datastructure implementation",
  internal: true
});

Package.on_use(function (api) {
  api.export('BinaryHeap');
  api.use(['underscore']);
  api.use(['minimongo'], { weak: true });
  api.add_files('binary-heap.js');
});

Package.on_test(function (api) {
  api.use('tinytest');
  api.add_files('binary-heap-tests.js');
});

