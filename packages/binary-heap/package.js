Package.describe({
  summary: "Binary Heap datastructure implementation",
  version: '1.0.9',
  git: 'https://github.com/meteor/meteor/tree/master/packages/binary-heap'
});

Package.onUse(function (api) {
  api.export('MaxHeap');
  api.export('MinHeap');
  api.export('MinMaxHeap');
  api.use(['underscore', 'id-map']);
  api.addFiles(['max-heap.js', 'min-heap.js', 'min-max-heap.js']);
});

Package.onTest(function (api) {
  api.use([
    'tinytest',
    'underscore',
    'binary-heap'
  ]);

  api.addFiles('binary-heap-tests.js');
});
