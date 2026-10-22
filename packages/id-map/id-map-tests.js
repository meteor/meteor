import { IdMap } from "./id-map.js";

const collectForEach = (map) => {
  const entries = [];
  map.forEach((value, id) => {
    entries.push([id, value]);
  });
  return entries;
};

Tinytest.add("idmap - starts empty", (test) => {
  const map = new IdMap();
  test.isTrue(map.empty(), "new IdMap should be empty");
  test.equal(map.size(), 0);
  test.equal(map.get("anything"), undefined);
  test.isFalse(map.has("anything"));
});

Tinytest.add("idmap - set/get/has with string keys", (test) => {
  const map = new IdMap();
  map.set("a", 1);
  map.set("b", 2);
  map.set("c", 3);

  test.equal(map.size(), 3);
  test.isFalse(map.empty());
  test.equal(map.get("a"), 1);
  test.equal(map.get("b"), 2);
  test.equal(map.get("c"), 3);
  test.isTrue(map.has("a"));
  test.isTrue(map.has("b"));
  test.isTrue(map.has("c"));
  test.isFalse(map.has("d"));
});

Tinytest.add("idmap - set/get/has with object keys", (test) => {
  const map = new IdMap();
  map.set({ id: 1 }, "first");
  map.set({ id: 2 }, "second");

  test.equal(map.size(), 2);
  test.equal(map.get({ id: 1 }), "first");
  test.equal(map.get({ id: 2 }), "second");
  test.isTrue(map.has({ id: 1 }));
  test.isFalse(map.has({ id: 3 }));

  // Structurally-equal objects collide onto the same slot.
  map.set({ id: 1 }, "overwritten");
  test.equal(map.size(), 2);
  test.equal(map.get({ id: 1 }), "overwritten");
});

Tinytest.add("idmap - set overwrites existing value", (test) => {
  const map = new IdMap();
  map.set("k", 1);
  map.set("k", 2);
  test.equal(map.get("k"), 2);
  test.equal(map.size(), 1);
});

Tinytest.add("idmap - remove deletes and is idempotent", (test) => {
  const map = new IdMap();
  map.set("a", 1);
  map.set("b", 2);

  map.remove("a");
  test.isFalse(map.has("a"));
  test.equal(map.get("a"), undefined);
  test.equal(map.size(), 1);

  // Removing an absent key is a silent no-op.
  map.remove("nonexistent");
  test.equal(map.size(), 1);
  test.isTrue(map.has("b"));
});

Tinytest.add("idmap - clear empties everything", (test) => {
  const map = new IdMap();
  map.set("a", 1);
  map.set("b", 2);
  map.set("c", 3);

  map.clear();

  test.isTrue(map.empty());
  test.equal(map.size(), 0);
  test.equal(map.get("a"), undefined);
  test.isFalse(map.has("a"));
});

Tinytest.add("idmap - setDefault inserts when missing, returns existing when present", (test) => {
  const map = new IdMap();

  // Missing key: writes default, returns it.
  const v1 = map.setDefault("k", 42);
  test.equal(v1, 42);
  test.equal(map.get("k"), 42);
  test.equal(map.size(), 1);

  // Present key: returns existing, does not overwrite.
  const v2 = map.setDefault("k", 999);
  test.equal(v2, 42);
  test.equal(map.get("k"), 42);
  test.equal(map.size(), 1);
});

Tinytest.add("idmap - forEach iterates all entries", (test) => {
  const map = new IdMap();
  map.set("a", 1);
  map.set("b", 2);
  map.set("c", 3);

  const entries = collectForEach(map);
  test.equal(entries.length, 3);

  // Order is not guaranteed — check membership.
  const byKey = Object.create(null);
  entries.forEach(([k, v]) => {
    byKey[k] = v;
  });
  test.equal(byKey.a, 1);
  test.equal(byKey.b, 2);
  test.equal(byKey.c, 3);
});

Tinytest.add("idmap - forEach stops when iterator returns false", (test) => {
  const map = new IdMap();
  for (let i = 0; i < 5; i++) {
    map.set(`k${i}`, i);
  }

  let visited = 0;
  map.forEach((_value, _id) => {
    visited++;
    if (visited === 2) {
      return false;
    }
  });

  test.equal(visited, 2, "forEach should break after iterator returns false");
});

Tinytest.addAsync("idmap - forEachAsync iterates and supports break", async (test) => {
  const map = new IdMap();
  map.set("a", 1);
  map.set("b", 2);
  map.set("c", 3);

  const collected = [];
  await map.forEachAsync(async (value, id) => {
    await Promise.resolve();
    collected.push([id, value]);
  });
  test.equal(collected.length, 3);

  // Break path.
  let visited = 0;
  await map.forEachAsync(async () => {
    await Promise.resolve();
    visited++;
    if (visited === 1) {
      return false;
    }
  });
  test.equal(visited, 1);
});

Tinytest.add("idmap - clone produces independent copy", (test) => {
  const map = new IdMap();
  map.set("a", { n: 1 });
  map.set("b", { n: 2 });

  const clone = map.clone();
  test.equal(clone.size(), 2);
  test.equal(clone.get("a"), { n: 1 });
  test.equal(clone.get("b"), { n: 2 });

  // Mutating the clone does not affect the original.
  clone.set("a", { n: 99 });
  clone.set("c", { n: 3 });

  test.equal(map.get("a"), { n: 1 }, "original.a should be unchanged");
  test.isFalse(map.has("c"), "original should not see the new key");
  test.equal(map.size(), 2);
  test.equal(clone.size(), 3);
});

Tinytest.add("idmap - custom stringify/parse round-trip", (test) => {
  const map = new IdMap(
    (n) => String(n),
    (s) => Number(s),
  );
  map.set(1, "one");
  map.set(2, "two");
  map.set(10, "ten");

  test.equal(map.get(1), "one");
  test.equal(map.get(10), "ten");

  // forEach should deliver parsed (numeric) ids.
  const ids = [];
  map.forEach((value, id) => {
    ids.push(id);
    test.equal(typeof id, "number", "custom parse should return a number");
  });
  ids.sort((a, b) => a - b);
  test.equal(ids, [1, 2, 10]);
});
