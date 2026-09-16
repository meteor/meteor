function mockSub() {
  const calls = { added: [], changed: [] };
  return {
    added(collection, id, fields) {
      calls.added.push({ collection, id, fields });
    },
    changed(collection, id, fields) {
      calls.changed.push({ collection, id, fields });
    },
    calls,
  };
}

// -- resetServerFacts --

Tinytest.add("facts-base - resetServerFacts clears all facts", (test) => {
  Facts.resetServerFacts();
  Facts.incrementServerFact("pkg-a", "fact1", 10);
  Facts.incrementServerFact("pkg-b", "fact2", 20);

  Facts.resetServerFacts();

  test.equal(Facts._factsByPackage, {});
});

Tinytest.add("facts-base - resetServerFacts on already empty state is a no-op", (test) => {
  Facts.resetServerFacts();
  Facts.resetServerFacts();

  test.equal(Facts._factsByPackage, {});
});

// -- incrementServerFact: new package --

Tinytest.add("facts-base - incrementServerFact creates entry for new package", (test) => {
  Facts.resetServerFacts();

  Facts.incrementServerFact("new-pkg", "connections", 5);

  test.equal(Facts._factsByPackage["new-pkg"], { connections: 5 });
});

// -- incrementServerFact: existing package, new fact --

Tinytest.add("facts-base - incrementServerFact adds new fact to existing package", (test) => {
  Facts.resetServerFacts();
  Facts.incrementServerFact("my-pkg", "factA", 1);

  Facts.incrementServerFact("my-pkg", "factB", 7);

  test.equal(Facts._factsByPackage["my-pkg"], { factA: 1, factB: 7 });
});

// -- incrementServerFact: existing package, existing fact --

Tinytest.add("facts-base - incrementServerFact accumulates on existing fact", (test) => {
  Facts.resetServerFacts();
  Facts.incrementServerFact("pkg", "counter", 10);

  Facts.incrementServerFact("pkg", "counter", 3);

  test.equal(Facts._factsByPackage["pkg"].counter, 13);
});

// -- incrementServerFact: negative increment --

Tinytest.add("facts-base - incrementServerFact handles negative increment", (test) => {
  Facts.resetServerFacts();
  Facts.incrementServerFact("pkg", "counter", 10);

  Facts.incrementServerFact("pkg", "counter", -4);

  test.equal(Facts._factsByPackage["pkg"].counter, 6);
});

// -- incrementServerFact: multiple independent packages --

Tinytest.add("facts-base - incrementServerFact keeps packages independent", (test) => {
  Facts.resetServerFacts();

  Facts.incrementServerFact("alpha", "x", 1);
  Facts.incrementServerFact("beta", "x", 100);
  Facts.incrementServerFact("alpha", "x", 2);

  test.equal(Facts._factsByPackage["alpha"].x, 3);
  test.equal(Facts._factsByPackage["beta"].x, 100);
});

// -- subscription notifications: sub.added on new package --

Tinytest.add("facts-base - notifies subscriptions with added when package is new", (test) => {
  Facts.resetServerFacts();
  const sub = mockSub();
  Facts._setActiveSubscriptions([sub]);

  Facts.incrementServerFact("fresh-pkg", "sessions", 42);

  test.equal(sub.calls.added.length, 1);
  test.equal(sub.calls.added[0].collection, "meteor_Facts_server");
  test.equal(sub.calls.added[0].id, "fresh-pkg");
  test.equal(sub.calls.added[0].fields, { sessions: 42 });
  test.equal(sub.calls.changed.length, 0);

  Facts._setActiveSubscriptions([]);
});

// -- subscription notifications: sub.changed on existing package --

Tinytest.add("facts-base - notifies subscriptions with changed when fact is updated", (test) => {
  Facts.resetServerFacts();
  const sub = mockSub();
  Facts.incrementServerFact("pkg", "rps", 10);

  Facts._setActiveSubscriptions([sub]);
  Facts.incrementServerFact("pkg", "rps", 5);

  test.equal(sub.calls.changed.length, 1);
  test.equal(sub.calls.changed[0].collection, "meteor_Facts_server");
  test.equal(sub.calls.changed[0].id, "pkg");
  test.equal(sub.calls.changed[0].fields, { rps: 15 });
  test.equal(sub.calls.added.length, 0);

  Facts._setActiveSubscriptions([]);
});

// -- subscription notifications: multiple subscriptions --

Tinytest.add("facts-base - notifies all active subscriptions on increment", (test) => {
  Facts.resetServerFacts();
  const sub1 = mockSub();
  const sub2 = mockSub();
  Facts._setActiveSubscriptions([sub1, sub2]);

  Facts.incrementServerFact("pkg", "hits", 1);

  test.equal(sub1.calls.added.length, 1);
  test.equal(sub2.calls.added.length, 1);

  Facts.incrementServerFact("pkg", "hits", 1);

  test.equal(sub1.calls.changed.length, 1);
  test.equal(sub2.calls.changed.length, 1);

  Facts._setActiveSubscriptions([]);
});

// -- subscription notifications: no subscriptions --

Tinytest.add("facts-base - incrementServerFact works with no active subscriptions", (test) => {
  Facts.resetServerFacts();
  Facts._setActiveSubscriptions([]);

  Facts.incrementServerFact("lonely-pkg", "value", 99);

  test.equal(Facts._factsByPackage["lonely-pkg"], { value: 99 });
});

// -- setUserIdFilter --

Tinytest.add("facts-base - setUserIdFilter replaces the filter", (test) => {
  let filterCalled = false;
  Facts.setUserIdFilter(function (userId) {
    filterCalled = true;
    return userId === "admin";
  });

  test.isFalse(filterCalled);

  // Restore default to not affect other tests
  Facts.setUserIdFilter(function () {
    return !!Package.autopublish;
  });
});

// -- resetServerFacts with active subscriptions --

Tinytest.add("facts-base - resetServerFacts does not notify subscriptions", (test) => {
  Facts.resetServerFacts();
  const sub = mockSub();
  Facts._setActiveSubscriptions([sub]);

  Facts.incrementServerFact("pkg", "val", 5);
  Facts.resetServerFacts();

  // added was called once for the increment, but reset should not trigger notifications
  test.equal(sub.calls.added.length, 1);
  test.equal(sub.calls.changed.length, 0);
  test.equal(Facts._factsByPackage, {});

  Facts._setActiveSubscriptions([]);
});

// -- incrementServerFact: zero increment --

Tinytest.add("facts-base - incrementServerFact with zero increment", (test) => {
  Facts.resetServerFacts();
  Facts.incrementServerFact("pkg", "counter", 0);

  test.equal(Facts._factsByPackage["pkg"].counter, 0);
});

// -- incrementServerFact: multiple facts same package --

Tinytest.add("facts-base - incrementServerFact supports many facts per package", (test) => {
  Facts.resetServerFacts();

  Facts.incrementServerFact("multi", "a", 1);
  Facts.incrementServerFact("multi", "b", 2);
  Facts.incrementServerFact("multi", "c", 3);

  test.equal(Facts._factsByPackage["multi"], { a: 1, b: 2, c: 3 });
});

// -- subscription: changed sends only the changed field --

Tinytest.add("facts-base - changed notification only includes the updated field", (test) => {
  Facts.resetServerFacts();
  const sub = mockSub();

  Facts.incrementServerFact("pkg", "a", 1);
  Facts.incrementServerFact("pkg", "b", 2);
  Facts._setActiveSubscriptions([sub]);

  Facts.incrementServerFact("pkg", "a", 10);

  test.equal(sub.calls.changed.length, 1);
  test.equal(sub.calls.changed[0].fields, { a: 11 });

  Facts._setActiveSubscriptions([]);
});

// -- subscription added uses correct collection name --

Tinytest.add("facts-base - subscription added uses 'meteor_Facts_server' collection", (test) => {
  Facts.resetServerFacts();
  const sub = mockSub();
  Facts._setActiveSubscriptions([sub]);

  Facts.incrementServerFact("test-pkg", "val", 1);

  test.equal(sub.calls.added[0].collection, "meteor_Facts_server");

  Facts._setActiveSubscriptions([]);
});
