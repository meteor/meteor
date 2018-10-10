Tinytest.add("binary-heap - simple max-heap tests", function (test) {
  var h = new MaxHeap(function (a, b) { return a-b; });
  h.set("a", 1);
  h.set("b", 233);
  h.set("c", -122);
  h.set("d", 0);
  h.set("e", 0);

  test.equal(h.size(), 5);
  test.equal(h.maxElementId(), "b");
  test.equal(h.get("b"), 233);

  h.remove("b");
  test.equal(h.size(), 4);
  test.equal(h.maxElementId(), "a");
  h.set("e", 44);
  test.equal(h.maxElementId(), "e");
  test.equal(h.get("b"), null);
  test.isTrue(h.has("a"));
  test.isFalse(h.has("dd"));

  h.clear();
  test.isFalse(h.has("a"));
  test.equal(h.size(), 0);
  test.equal(h.setDefault("a", 12345), 12345);
  test.equal(h.setDefault("a", 55555), 12345);
  test.equal(h.size(), 1);
  test.equal(h.maxElementId(), "a");
});

Tinytest.add("binary-heap - big test for max-heap", function (test) {
  var positiveNumbers = _.shuffle(_.range(1, 41));
  var negativeNumbers = _.shuffle(_.range(-1, -41, -1));
  var allNumbers = negativeNumbers.concat(positiveNumbers);

  var heap = new MaxHeap(function (a, b) { return a-b; });
  var output = [];

  _.each(allNumbers, function (n) { heap.set(n, n); });

  _.times(positiveNumbers.length + negativeNumbers.length, function () {
    var maxId = heap.maxElementId();
    output.push(heap.get(maxId));
    heap.remove(maxId);
  });

  allNumbers.sort(function (a, b) { return b-a; });

  test.equal(output, allNumbers);
});

Tinytest.add("binary-heap - min-max heap tests", function (test) {
  var h = new MinMaxHeap(function (a, b) { return a-b; });
  h.set("a", 1);
  h.set("b", 233);
  h.set("c", -122);
  h.set("d", 0);
  h.set("e", 0);

  test.equal(h.size(), 5);
  test.equal(h.maxElementId(), "b");
  test.equal(h.get("b"), 233);
  test.equal(h.minElementId(), "c");

  h.remove("b");
  test.equal(h.size(), 4);
  test.equal(h.minElementId(), "c");
  h.set("e", -123);
  test.equal(h.minElementId(), "e");
  test.equal(h.get("b"), null);
  test.isTrue(h.has("a"));
  test.isFalse(h.has("dd"));

  h.clear();
  test.isFalse(h.has("a"));
  test.equal(h.size(), 0);
  test.equal(h.setDefault("a", 12345), 12345);
  test.equal(h.setDefault("a", 55555), 12345);
  test.equal(h.size(), 1);
  test.equal(h.maxElementId(), "a");
  test.equal(h.minElementId(), "a");
});

Tinytest.add("binary-heap - big test for min-max-heap", function (test) {
  var N = 500;
  var positiveNumbers = _.shuffle(_.range(1, N + 1));
  var negativeNumbers = _.shuffle(_.range(-1, -N - 1, -1));
  var allNumbers = positiveNumbers.concat(negativeNumbers);

  var heap = new MinMaxHeap(function (a, b) { return a-b; });
  var output = [];

  var initialSets = _.clone(allNumbers);
  _.each(allNumbers, function (n) {
    heap.set(n, n);
    heap._selfCheck();
    heap._minHeap._selfCheck();
  });

  allNumbers = _.shuffle(allNumbers);
  var secondarySets = _.clone(allNumbers);

  _.each(allNumbers, function (n) {
    heap.set(-n, n);
    heap._selfCheck();
    heap._minHeap._selfCheck();
  });

  _.times(positiveNumbers.length + negativeNumbers.length, function () {
    var minId = heap.minElementId();
    output.push(heap.get(minId));
    heap.remove(minId);
    heap._selfCheck(); heap._minHeap._selfCheck();
  });

  test.equal(heap.size(), 0);

  allNumbers.sort(function (a, b) { return a-b; });

  var initialTestText = "initial sets: " + initialSets.toString() +
    "; secondary sets: " + secondarySets.toString();
  test.equal(output, allNumbers, initialTestText);

  _.each(initialSets, function (n) { heap.set(n, n); })
  _.each(secondarySets, function (n) { heap.set(-n, n); });

  allNumbers.sort(function (a, b) { return b-a; });
  output = [];
  _.times(positiveNumbers.length + negativeNumbers.length, function () {
    var maxId = heap.maxElementId();
    output.push(heap.get(maxId));
    heap.remove(maxId);
    heap._selfCheck(); heap._minHeap._selfCheck();
  });

  test.equal(output, allNumbers, initialTestText);
});

