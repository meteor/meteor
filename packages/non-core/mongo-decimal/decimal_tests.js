// -- EJSON integration --

Tinytest.add("mongo-decimal - typeName returns 'Decimal'", (test) => {
  const d = Decimal("1.5");
  test.equal(d.typeName(), "Decimal");
});

Tinytest.add("mongo-decimal - toJSONValue returns string representation", (test) => {
  const d = Decimal("3.141592653589793");
  const json = d.toJSONValue();
  test.equal(typeof json, "string");
  test.equal(json, "3.141592653589793");
});

Tinytest.add("mongo-decimal - clone produces equal but independent copy", (test) => {
  const original = Decimal("99.99");
  const copy = original.clone();

  test.equal(copy.toString(), original.toString());
  // They must be different object instances
  test.isFalse(copy === original);
});

Tinytest.add("mongo-decimal - EJSON.stringify and EJSON.parse round-trip", (test) => {
  const d = Decimal("2.718281828459045");
  const str = EJSON.stringify({ value: d });
  const parsed = EJSON.parse(str);

  test.equal(parsed.value.toString(), d.toString());
  test.instanceOf(parsed.value, Decimal);
});

Tinytest.add("mongo-decimal - EJSON.clone preserves Decimal", (test) => {
  const d = Decimal("42");
  const cloned = EJSON.clone(d);

  test.equal(cloned.toString(), "42");
  test.isFalse(cloned === d);
  test.instanceOf(cloned, Decimal);
});

Tinytest.add("mongo-decimal - Decimal handles zero correctly", (test) => {
  const d = Decimal("0");
  test.equal(d.toString(), "0");
  test.equal(d.toJSONValue(), "0");
  test.equal(d.typeName(), "Decimal");
});

Tinytest.add("mongo-decimal - Decimal handles negative numbers", (test) => {
  const d = Decimal("-123.456");
  test.equal(d.toString(), "-123.456");

  const json = EJSON.stringify({ n: d });
  const parsed = EJSON.parse(json);
  test.equal(parsed.n.toString(), "-123.456");
});

Tinytest.add("mongo-decimal - Decimal handles very large numbers", (test) => {
  const big = "9999999999999999999999999999999999.9999";
  const d = Decimal(big);
  // Verify round-trip through EJSON preserves value
  const str = EJSON.stringify({ v: d });
  const parsed = EJSON.parse(str);
  test.equal(parsed.v.toString(), d.toString());
});

// -- MongoDB insert/find (server only) --

Tinytest.addAsync("mongo-decimal - insert/find Decimal", async (test) => {
  // TODO [fibers]: this should work on the client as well.
  if (Meteor.isClient) return;

  const coll = new Mongo.Collection("mongo-decimal");
  const pi = Decimal("3.141592653589793");

  await coll.insertAsync({ pi });
  const found = await coll.findOneAsync({ pi });

  test.equal(found.pi, pi);
});
