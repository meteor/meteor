Tinytest.add("minimongo - wrapTransform", function (test) {
  var wrap = LocalCollection.wrapTransform;

  // Transforming no function gives falsey.
  test.isFalse(wrap(undefined));
  test.isFalse(wrap(null));

  // It's OK if you don't change the ID.
  var validTransform = function (doc) {
    delete doc.x;
    doc.y = 42;
    doc.z = function () { return 43; };
    return doc;
  };
  var transformed = wrap(validTransform)({_id: "asdf", x: 54});
  test.equal(_.keys(transformed), ['_id', 'y', 'z']);
  test.equal(transformed.y, 42);
  test.equal(transformed.z(), 43);

  // Ensure that ObjectIDs work (even if the _ids in question are not ===-equal)
  var oid1 = new LocalCollection._ObjectID();
  var oid2 = new LocalCollection._ObjectID(oid1.toHexString());
  test.equal(wrap(function () {return {_id: oid2};})({_id: oid1}),
             {_id: oid2});

  // transform functions must return objects
  var invalidObjects = [
    "asdf", new LocalCollection._ObjectID(), false, null, true,
    27, [123], /adsf/, new Date, function () {}, undefined
  ];
  _.each(invalidObjects, function (invalidObject) {
    var wrapped = wrap(function () { return invalidObject; });
    test.throws(function () {
      wrapped({_id: "asdf"});
    });
  }, /transform must return object/);

  // transform functions may not change _ids
  var wrapped = wrap(function (doc) { doc._id = 'x'; return doc; });
  test.throws(function () {
    wrapped({_id: 'y'});
  }, /can't have different _id/);

  // transform functions may remove _ids
  test.equal({_id: 'a', x: 2},
             wrap(function (d) {delete d._id; return d;})({_id: 'a', x: 2}));

  // test that wrapped transform functions are nonreactive
  var unwrapped = function (doc) {
    test.isFalse(Deps.active);
    return doc;
  };
  var handle = Deps.autorun(function () {
    test.isTrue(Deps.active);
    wrap(unwrapped)({_id: "xxx"});
  });
  handle.stop();
});
