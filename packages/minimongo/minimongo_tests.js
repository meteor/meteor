Tinytest.add('minimongo - modifiers only traverse own document fields', test => {
  const marker = 'meteorModifierPrototypeMarker';
  try {
    for (const prefix of ['__proto__', 'constructor.prototype', 'nested.__proto__', 'items.0.__proto__']) {
      const doc = {_id: 'safe', items: [{}]};
      LocalCollection._modify(doc, {$set: {[`${prefix}.${marker}`]: 7}});
      test.isFalse(Object.prototype.hasOwnProperty.call(Object.prototype, marker));
      test.equal(Object.getPrototypeOf(doc), Object.prototype);
      test.equal(prefix.split('.').reduce((value, key) => value[key], doc)[marker], 7);
    }

    // Non-creating operators must not read or mutate inherited fields.
    const doc = {_id: 'safe', kept: 1};
    Object.prototype[marker] = 3;
    LocalCollection._modify(doc, {$unset: {[`__proto__.${marker}`]: 1}});
    test.equal(Object.prototype[marker], 3);
    delete Object.prototype[marker];
    LocalCollection._modify(doc, {$rename: {constructor: 'copied'}});
    test.isFalse(Object.prototype.hasOwnProperty.call(doc, 'copied'));
    test.equal(typeof Object.prototype.toString, 'function');

    LocalCollection._modify(doc, {$rename: {kept: `__proto__.${marker}`}});
    test.equal(doc.__proto__[marker], 1);
    test.isFalse(Object.prototype.hasOwnProperty.call(Object.prototype, marker));
  } finally {
    delete Object.prototype[marker];
  }
});

Tinytest.add('minimongo - prototype names remain ordinary own fields', test => {
  for (const field of ['__proto__', 'constructor', 'toString']) {
    for (const [operator, argument, expected] of [
      ['$set', {safe: true}, {safe: true}],
      ['$inc', 2, 2], ['$mul', 2, 0], ['$min', 2, 2], ['$max', 2, 2],
      ['$push', 2, [2]], ['$pushAll', [2], [2]], ['$addToSet', 2, [2]],
    ]) {
      const doc = {_id: 'safe'};
      LocalCollection._modify(doc, {[operator]: {[field]: argument}});
      test.isTrue(Object.prototype.hasOwnProperty.call(doc, field));
      test.equal(doc[field], expected);
      test.equal(Object.getPrototypeOf(doc), Object.prototype);
    }
  }
  const replacement = JSON.parse('{"__proto__":{"safe":true},"_id":"safe"}');
  const doc = {_id: 'safe'};
  LocalCollection._modify(doc, replacement);
  test.isTrue(Object.prototype.hasOwnProperty.call(doc, '__proto__'));
  test.equal(Object.getPrototypeOf(doc), Object.prototype);
  LocalCollection._modify(doc, {$set: {'__proto__.safe': false}});
  test.equal(doc.__proto__.safe, false);
  LocalCollection._modify(doc, {$set: {items: [{n: 1}]}});
  LocalCollection._modify(doc, {$inc: {'items.$.n': 2}}, {arrayIndices: [0]});
  test.equal(doc.items, [{n: 3}]);
});

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

Tinytest.add('minimongo - bulk remove with $in operator removes all matching documents', function(test) {
  const coll = new LocalCollection();
  
  // Insert multiple documents
  const ids = ['id1', 'id2', 'id3', 'id4'];
  ids.forEach(id => {
    coll.insert({ _id: id, value: `item-${id}` });
  });
  
  // Verify we have 4 documents
  test.equal(coll.find().count(), 4);
  
  // Remove 2 documents using $in operator
  const removedCount = coll.remove({ _id: { $in: ['id1', 'id2'] } });
  
  // This should remove 2 documents, not just 1
  test.equal(removedCount, 2);
  
  // Verify only 2 documents remain
  test.equal(coll.find().count(), 2);
  
  // Verify the correct documents were removed
  test.isUndefined(coll.findOne('id1'));
  test.isUndefined(coll.findOne('id2'));
  
  // Verify the other documents still exist
  test.isNotUndefined(coll.findOne('id3'));
  test.isNotUndefined(coll.findOne('id4'));
});

if (Meteor.isClient) {
  Tinytest.add('minimongo - $geoIntersects should throw error', function(test) {
    const collection = new LocalCollection();
    collection.insert({ _id: 'a', loc: { type: 'Point', coordinates: [0, 0] } });

    const query = {
      loc: {
        $geoIntersects: {
          $geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0], [0, 1], [1, 1], [1, 0], [0, 0]
              ]
            ]
          }
        }
      }
    };

    test.throws(
      () => collection.findOne(query),
      /Unrecognized operator: \$geoIntersects/,
      'Should throw error for $geoIntersects in Minimongo'
    );
  });
}