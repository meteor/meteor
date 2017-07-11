Tinytest.add('minimongo - wrapTransform', test => {
  const wrap = LocalCollection.wrapTransform;

  // Transforming no function gives falsey.
  test.isFalse(wrap(undefined));
  test.isFalse(wrap(null));

  // It's OK if you don't change the ID.
  const validTransform = doc => {
    delete doc.x;
    doc.y = 42;
    doc.z = () => 43;
    return doc;
  };
  const transformed = wrap(validTransform)({_id: 'asdf', x: 54});
  test.equal(Object.keys(transformed), ['_id', 'y', 'z']);
  test.equal(transformed.y, 42);
  test.equal(transformed.z(), 43);

  // Ensure that ObjectIDs work (even if the _ids in question are not ===-equal)
  const oid1 = new MongoID.ObjectID();
  const oid2 = new MongoID.ObjectID(oid1.toHexString());
  test.equal(wrap(() => ({
    _id: oid2,
  }))({_id: oid1}),
  {_id: oid2});

  // transform functions must return objects
  const invalidObjects = [
    'asdf', new MongoID.ObjectID(), false, null, true,
    27, [123], /adsf/, new Date, () => {}, undefined,
  ];
  invalidObjects.forEach(invalidObject => {
    const wrapped = wrap(() => invalidObject);
    test.throws(() => {
      wrapped({_id: 'asdf'});
    });
  }, /transform must return object/);

  // transform functions may not change _ids
  const wrapped = wrap(doc => { doc._id = 'x'; return doc; });
  test.throws(() => {
    wrapped({_id: 'y'});
  }, /can't have different _id/);

  // transform functions may remove _ids
  test.equal({_id: 'a', x: 2},
    wrap(d => {delete d._id; return d;})({_id: 'a', x: 2}));

  // test that wrapped transform functions are nonreactive
  const unwrapped = doc => {
    test.isFalse(Tracker.active);
    return doc;
  };
  const handle = Tracker.autorun(() => {
    test.isTrue(Tracker.active);
    wrap(unwrapped)({_id: 'xxx'});
  });
  handle.stop();
});
