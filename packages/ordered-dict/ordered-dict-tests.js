import { OrderedDict } from "./ordered_dict.js";

const keysInOrder = (dict) => {
  const keys = [];
  dict.forEach((value, key) => {
    keys.push(key);
  });
  return keys;
};

Tinytest.add("ordered-dict - starts empty", (test) => {
  const dict = new OrderedDict();
  test.isTrue(dict.empty());
  test.equal(dict.size(), 0);
  test.equal(dict.first(), undefined);
  test.equal(dict.firstValue(), undefined);
  test.equal(dict.last(), undefined);
  test.equal(dict.lastValue(), undefined);
  test.isFalse(dict.has("anything"));
  test.equal(dict.get("anything"), undefined);
});

Tinytest.add("ordered-dict - append maintains insertion order", (test) => {
  const dict = new OrderedDict();
  dict.append("A", 1);
  dict.append("B", 2);
  dict.append("C", 3);

  test.equal(dict.size(), 3);
  test.equal(keysInOrder(dict), ["A", "B", "C"]);
  test.equal(dict.first(), "A");
  test.equal(dict.firstValue(), 1);
  test.equal(dict.last(), "C");
  test.equal(dict.lastValue(), 3);

  // prev/next on the middle node.
  test.equal(dict.prev("B"), "A");
  test.equal(dict.next("B"), "C");
  test.equal(dict.prev("A"), null);
  test.equal(dict.next("C"), null);
});

Tinytest.add("ordered-dict - putBefore inserts before target", (test) => {
  const dict = new OrderedDict();
  dict.append("A", 1);
  dict.append("B", 2);
  dict.putBefore("X", 99, "B");

  test.equal(keysInOrder(dict), ["A", "X", "B"]);
  test.equal(dict.prev("X"), "A");
  test.equal(dict.next("X"), "B");
  test.equal(dict.size(), 3);
});

Tinytest.add("ordered-dict - putBefore(null) appends to end", (test) => {
  const dict = new OrderedDict();
  dict.append("A", 1);
  dict.putBefore("B", 2, null);
  test.equal(keysInOrder(dict), ["A", "B"]);
  test.equal(dict.last(), "B");
});

Tinytest.add("ordered-dict - putBefore throws on duplicate key", (test) => {
  const dict = new OrderedDict();
  dict.append("A", 1);
  test.throws(() => dict.putBefore("A", 2, null), /already present/);
});

Tinytest.add("ordered-dict - putBefore throws when 'before' key is missing", (test) => {
  const dict = new OrderedDict();
  dict.append("A", 1);
  test.throws(
    () => dict.putBefore("X", 99, "nonexistent"),
    /could not find item to put this one before/,
  );
});

Tinytest.add("ordered-dict - remove unlinks and returns value", (test) => {
  // Remove from the middle.
  let dict = new OrderedDict();
  dict.append("A", 1);
  dict.append("B", 2);
  dict.append("C", 3);
  const removed = dict.remove("B");
  test.equal(removed, 2);
  test.equal(keysInOrder(dict), ["A", "C"]);
  test.equal(dict.next("A"), "C");
  test.equal(dict.prev("C"), "A");
  test.equal(dict.size(), 2);
  test.isFalse(dict.has("B"));

  // Remove from the head.
  dict = new OrderedDict();
  dict.append("A", 1);
  dict.append("B", 2);
  dict.append("C", 3);
  dict.remove("A");
  test.equal(keysInOrder(dict), ["B", "C"]);
  test.equal(dict.first(), "B");
  test.equal(dict.prev("B"), null);

  // Remove from the tail.
  dict = new OrderedDict();
  dict.append("A", 1);
  dict.append("B", 2);
  dict.append("C", 3);
  dict.remove("C");
  test.equal(keysInOrder(dict), ["A", "B"]);
  test.equal(dict.last(), "B");
  test.equal(dict.next("B"), null);
});

Tinytest.add("ordered-dict - remove throws when key missing", (test) => {
  const dict = new OrderedDict();
  dict.append("A", 1);
  test.throws(() => dict.remove("missing"), /not present/);
});

Tinytest.add("ordered-dict - moveBefore reorders items", (test) => {
  const dict = new OrderedDict();
  dict.append("A", 1);
  dict.append("B", 2);
  dict.append("C", 3);

  dict.moveBefore("C", "A");

  test.equal(keysInOrder(dict), ["C", "A", "B"]);
  test.equal(dict.first(), "C");
  test.equal(dict.last(), "B");
  test.equal(dict.prev("C"), null);
  test.equal(dict.next("C"), "A");
  test.equal(dict.prev("A"), "C");
  test.equal(dict.next("A"), "B");
  test.equal(dict.prev("B"), "A");
  test.equal(dict.next("B"), null);
});

Tinytest.add("ordered-dict - moveBefore(null) moves to end", (test) => {
  const dict = new OrderedDict();
  dict.append("A", 1);
  dict.append("B", 2);
  dict.append("C", 3);

  dict.moveBefore("A", null);

  test.equal(keysInOrder(dict), ["B", "C", "A"]);
  test.equal(dict.last(), "A");
  test.equal(dict.first(), "B");
});

Tinytest.add("ordered-dict - moveBefore is a no-op when already in place", (test) => {
  const dict = new OrderedDict();
  dict.append("A", 1);
  dict.append("B", 2);
  dict.append("C", 3);

  // Moving A before B means A stays where it is (A.next === B already).
  dict.moveBefore("A", "B");
  test.equal(keysInOrder(dict), ["A", "B", "C"]);

  // Same but for middle.
  dict.moveBefore("B", "C");
  test.equal(keysInOrder(dict), ["A", "B", "C"]);
});

Tinytest.add("ordered-dict - moveBefore throws on missing keys", (test) => {
  const dict = new OrderedDict();
  dict.append("A", 1);
  test.throws(() => dict.moveBefore("missing", null), /Item to move is not present/);
  test.throws(
    () => dict.moveBefore("A", "nonexistent"),
    /Could not find element to move this one before/,
  );
});

Tinytest.add("ordered-dict - indexOf returns position or null", (test) => {
  const dict = new OrderedDict();
  dict.append("A", 1);
  dict.append("B", 2);
  dict.append("C", 3);

  test.equal(dict.indexOf("A"), 0);
  test.equal(dict.indexOf("B"), 1);
  test.equal(dict.indexOf("C"), 2);
  test.equal(dict.indexOf("missing"), null);
});

Tinytest.add("ordered-dict - forEach receives (value, key, index)", (test) => {
  const dict = new OrderedDict();
  dict.append("A", "valA");
  dict.append("B", "valB");
  dict.append("C", "valC");

  const calls = [];
  dict.forEach((value, key, index) => {
    calls.push({ value, key, index });
  });

  test.equal(calls, [
    { value: "valA", key: "A", index: 0 },
    { value: "valB", key: "B", index: 1 },
    { value: "valC", key: "C", index: 2 },
  ]);
});

Tinytest.add("ordered-dict - forEach breaks on OrderedDict.BREAK", (test) => {
  const dict = new OrderedDict();
  dict.append("A", 1);
  dict.append("B", 2);
  dict.append("C", 3);
  dict.append("D", 4);

  let visited = 0;
  dict.forEach((_value, _key) => {
    visited++;
    if (visited === 2) {
      return OrderedDict.BREAK;
    }
  });
  test.equal(visited, 2);
});

Tinytest.addAsync("ordered-dict - forEachAsync iterates and supports break", async (test) => {
  const dict = new OrderedDict();
  dict.append("A", 1);
  dict.append("B", 2);
  dict.append("C", 3);

  const collected = [];
  await dict.forEachAsync(async (value, key, index) => {
    await Promise.resolve();
    collected.push([key, value, index]);
  });
  test.equal(collected, [
    ["A", 1, 0],
    ["B", 2, 1],
    ["C", 3, 2],
  ]);

  // Break path.
  let visited = 0;
  await dict.forEachAsync(async () => {
    await Promise.resolve();
    visited++;
    if (visited === 1) {
      return OrderedDict.BREAK;
    }
  });
  test.equal(visited, 1);
});

Tinytest.add("ordered-dict - constructor accepts initial pairs", (test) => {
  const dict = new OrderedDict(["a", 1], ["b", 2], ["c", 3]);
  test.equal(keysInOrder(dict), ["a", "b", "c"]);
  test.equal(dict.get("a"), 1);
  test.equal(dict.get("b"), 2);
  test.equal(dict.get("c"), 3);
  test.equal(dict.size(), 3);
});

Tinytest.add("ordered-dict - constructor accepts stringify + initial pairs", (test) => {
  const dict = new OrderedDict((k) => String(k), [1, "a"], [2, "b"], [3, "c"]);
  test.equal(dict.size(), 3);
  test.equal(dict.get(1), "a");
  test.equal(dict.get(2), "b");
  test.equal(dict.get(3), "c");
  test.equal(keysInOrder(dict), [1, 2, 3]);
});
