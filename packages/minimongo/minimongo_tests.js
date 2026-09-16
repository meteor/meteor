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

// ---- Collation support ----

Tinytest.add('minimongo - collation - _createCollator maps MongoDB options to Intl.Collator', test => {
  // strength 2 → case-insensitive (sensitivity 'accent')
  const collator = LocalCollection._createCollator({locale: 'en', strength: 2});
  test.equal(collator.compare('abc', 'ABC'), 0);
  test.equal(collator.compare('abc', 'abc'), 0);
  test.notEqual(collator.compare('abc', 'ábc'), 0); // accents differ at strength 2

  // strength 1 → base only (case + accents ignored)
  const base = LocalCollection._createCollator({locale: 'en', strength: 1});
  test.equal(base.compare('abc', 'ABC'), 0);
  test.equal(base.compare('abc', 'ábc'), 0); // accents ignored at strength 1

  // strength 3 (default) → case-sensitive
  const strict = LocalCollection._createCollator({locale: 'en', strength: 3});
  test.notEqual(strict.compare('abc', 'ABC'), 0);

  // numericOrdering
  const numeric = LocalCollection._createCollator({locale: 'en', numericOrdering: true});
  test.isTrue(numeric.compare('2', '10') < 0); // numeric: 2 < 10
  const lexical = LocalCollection._createCollator({locale: 'en'});
  test.isTrue(lexical.compare('2', '10') > 0); // lexical: '2' > '10'

  // caseFirst: 'upper' → uppercase sorts before lowercase
  const upperFirst = LocalCollection._createCollator({locale: 'en', caseFirst: 'upper', strength: 3});
  test.isTrue(upperFirst.compare('A', 'a') < 0);

  // caseLevel true at strength 1
  const caseLevel = LocalCollection._createCollator({locale: 'en', strength: 1, caseLevel: true});
  test.notEqual(caseLevel.compare('a', 'A'), 0); // case matters
  test.equal(caseLevel.compare('a', 'á'), 0);    // accents still ignored
});

Tinytest.add('minimongo - collation - Matcher equality (case-insensitive)', test => {
  const collation = {locale: 'en', strength: 2};

  const matchCI = (selector, doc) => {
    return new Minimongo.Matcher(selector, undefined, collation).documentMatches(doc).result;
  };

  // Plain value selector: {field: value}
  test.isTrue(matchCI({name: 'john'}, {name: 'John'}));
  test.isTrue(matchCI({name: 'john'}, {name: 'JOHN'}));
  test.isTrue(matchCI({name: 'John'}, {name: 'john'}));
  test.isTrue(matchCI({name: 'café'}, {name: 'café'}));
  test.isFalse(matchCI({name: 'cafe'}, {name: 'café'})); // accents differ at strength 2
  test.isFalse(matchCI({name: 'john'}, {name: 'jane'}));

  // $eq operator
  test.isTrue(matchCI({name: {$eq: 'john'}}, {name: 'JOHN'}));
  test.isFalse(matchCI({name: {$eq: 'john'}}, {name: 'jane'}));

  // $ne operator
  test.isFalse(matchCI({name: {$ne: 'john'}}, {name: 'JOHN'}));
  test.isTrue(matchCI({name: {$ne: 'john'}}, {name: 'jane'}));

  // $in operator
  test.isTrue(matchCI({name: {$in: ['john', 'jane']}}, {name: 'JOHN'}));
  test.isTrue(matchCI({name: {$in: ['john', 'jane']}}, {name: 'Jane'}));
  test.isFalse(matchCI({name: {$in: ['john', 'jane']}}, {name: 'bob'}));

  // $nin operator
  test.isFalse(matchCI({name: {$nin: ['john', 'jane']}}, {name: 'JOHN'}));
  test.isTrue(matchCI({name: {$nin: ['john', 'jane']}}, {name: 'bob'}));

  // Without collation, same selectors should be case-sensitive
  const matchCS = (selector, doc) => {
    return new Minimongo.Matcher(selector).documentMatches(doc).result;
  };
  test.isFalse(matchCS({name: 'john'}, {name: 'John'}));
  test.isFalse(matchCS({name: {$in: ['john']}}, {name: 'JOHN'}));
});

Tinytest.add('minimongo - collation - Matcher inequality operators', test => {
  const collation = {locale: 'en', strength: 2};

  const matchCI = (selector, doc) => {
    return new Minimongo.Matcher(selector, undefined, collation).documentMatches(doc).result;
  };

  // $lt / $gt with collation — 'b' > 'a' regardless of case
  test.isTrue(matchCI({name: {$gt: 'a'}}, {name: 'B'}));
  test.isTrue(matchCI({name: {$gt: 'a'}}, {name: 'b'}));
  test.isFalse(matchCI({name: {$gt: 'b'}}, {name: 'A'}));

  test.isTrue(matchCI({name: {$lt: 'b'}}, {name: 'A'}));
  test.isTrue(matchCI({name: {$lt: 'b'}}, {name: 'a'}));
  test.isFalse(matchCI({name: {$lt: 'a'}}, {name: 'B'}));

  // $gte / $lte — equality is case-insensitive
  test.isTrue(matchCI({name: {$gte: 'john'}}, {name: 'JOHN'}));
  test.isTrue(matchCI({name: {$lte: 'john'}}, {name: 'JOHN'}));
  test.isTrue(matchCI({name: {$gte: 'john'}}, {name: 'zoe'}));
  test.isFalse(matchCI({name: {$gte: 'john'}}, {name: 'alice'}));
});

Tinytest.add('minimongo - collation - Matcher with non-string values is unaffected', test => {
  const collation = {locale: 'en', strength: 2};

  const matchCI = (selector, doc) => {
    return new Minimongo.Matcher(selector, undefined, collation).documentMatches(doc).result;
  };

  // Numbers, booleans, null — collation should not affect these
  test.isTrue(matchCI({age: 25}, {age: 25}));
  test.isFalse(matchCI({age: 25}, {age: 30}));
  test.isTrue(matchCI({active: true}, {active: true}));
  test.isFalse(matchCI({active: true}, {active: false}));
  test.isTrue(matchCI({val: null}, {val: null}));
  test.isTrue(matchCI({age: {$gt: 10}}, {age: 20}));
  test.isFalse(matchCI({age: {$gt: 30}}, {age: 20}));
});

Tinytest.add('minimongo - collation - Sorter', test => {
  const collation = {locale: 'en', strength: 2};
  const sorter = new Minimongo.Sorter({name: 1}, collation);
  const cmp = sorter.getComparator();

  // Case-insensitive: 'alice' and 'Alice' should be equal
  test.equal(cmp({name: 'alice'}, {name: 'Alice'}), 0);
  test.equal(cmp({name: 'BOB'}, {name: 'bob'}), 0);

  // Order: alice < bob regardless of case
  test.isTrue(cmp({name: 'alice'}, {name: 'Bob'}) < 0);
  test.isTrue(cmp({name: 'ALICE'}, {name: 'bob'}) < 0);
  test.isTrue(cmp({name: 'Bob'}, {name: 'alice'}) > 0);

  // Descending sort
  const descSorter = new Minimongo.Sorter({name: -1}, collation);
  const descCmp = descSorter.getComparator();
  test.isTrue(descCmp({name: 'alice'}, {name: 'Bob'}) > 0);
  test.isTrue(descCmp({name: 'Bob'}, {name: 'alice'}) < 0);

  // Without collation — case-sensitive (uppercase < lowercase in ASCII)
  const csSorter = new Minimongo.Sorter({name: 1});
  const csCmp = csSorter.getComparator();
  test.notEqual(csCmp({name: 'alice'}, {name: 'Alice'}), 0);
});

Tinytest.add('minimongo - collation - Sorter with numericOrdering', test => {
  const collation = {locale: 'en', numericOrdering: true};
  const sorter = new Minimongo.Sorter({val: 1}, collation);
  const cmp = sorter.getComparator();

  // Numeric ordering: '2' < '10' < '20'
  test.isTrue(cmp({val: '2'}, {val: '10'}) < 0);
  test.isTrue(cmp({val: '10'}, {val: '20'}) < 0);
  test.isTrue(cmp({val: '2'}, {val: '20'}) < 0);

  // Without numericOrdering, lexical: '10' < '2' < '20'
  const lexSorter = new Minimongo.Sorter({val: 1});
  const lexCmp = lexSorter.getComparator();
  test.isTrue(lexCmp({val: '10'}, {val: '2'}) < 0); // '1' < '2' lexically
});

Tinytest.add('minimongo - collation - LocalCollection.find with collation', test => {
  const c = new LocalCollection();
  c.insert({_id: '1', name: 'Alice'});
  c.insert({_id: '2', name: 'bob'});
  c.insert({_id: '3', name: 'CHARLIE'});
  c.insert({_id: '4', name: 'alice'});

  const collation = {locale: 'en', strength: 2};

  // find with equality — should match case-insensitively
  const results = c.find({name: 'alice'}, {collation}).fetch();
  test.length(results, 2);
  const ids = results.map(d => d._id).sort();
  test.equal(ids, ['1', '4']);

  // find with $in
  const inResults = c.find({name: {$in: ['bob', 'charlie']}}, {collation}).fetch();
  test.length(inResults, 2);
  const inIds = inResults.map(d => d._id).sort();
  test.equal(inIds, ['2', '3']);

  // find with sort — case-insensitive ordering
  const sorted = c.find({}, {collation, sort: {name: 1}}).fetch();
  // alice, Alice, bob, CHARLIE (alice/Alice equal under collation, order stable)
  test.equal(sorted[0].name.toLowerCase(), 'alice');
  test.equal(sorted[1].name.toLowerCase(), 'alice');
  test.equal(sorted[2].name, 'bob');
  test.equal(sorted[3].name, 'CHARLIE');

  // findOne with collation
  const one = c.findOne({name: 'BOB'}, {collation});
  test.equal(one._id, '2');

  // Without collation — case-sensitive, no match
  const noMatch = c.find({name: 'alice'}).fetch();
  test.length(noMatch, 1);
  test.equal(noMatch[0]._id, '4');
});

Tinytest.add('minimongo - collation - strength 1 ignores accents and case', test => {
  const collation = {locale: 'en', strength: 1};

  const matchBase = (selector, doc) => {
    return new Minimongo.Matcher(selector, undefined, collation).documentMatches(doc).result;
  };

  test.isTrue(matchBase({name: 'cafe'}, {name: 'café'}));
  test.isTrue(matchBase({name: 'cafe'}, {name: 'CAFÉ'}));
  test.isTrue(matchBase({name: 'resume'}, {name: 'résumé'}));
});

Tinytest.add('minimongo - collation - Matcher and Sorter accept pre-built Intl.Collator', test => {
  // Verify that passing an Intl.Collator instance directly works the same
  // as passing a collation spec (this is the path used by Cursor).
  const collator = LocalCollection._createCollator({locale: 'en', strength: 2});

  // Matcher with pre-built collator
  const matcher = new Minimongo.Matcher({name: 'alice'}, undefined, collator);
  test.isTrue(matcher.documentMatches({name: 'Alice'}).result);
  test.isTrue(matcher.documentMatches({name: 'ALICE'}).result);
  test.isFalse(matcher.documentMatches({name: 'Bob'}).result);

  // Sorter with pre-built collator
  const sorter = new Minimongo.Sorter({name: 1}, collator);
  const cmp = sorter.getComparator();
  test.equal(cmp({name: 'alice'}, {name: 'Alice'}), 0);
  test.isTrue(cmp({name: 'alice'}, {name: 'Bob'}) < 0);
});

Tinytest.add('minimongo - collation - _createCollator validates in development', test => {
  // Missing locale
  test.throws(() => {
    LocalCollection._createCollator({strength: 2});
  }, /collation\.locale must be a non-empty string/);

  // Empty locale
  test.throws(() => {
    LocalCollection._createCollator({locale: ''});
  }, /collation\.locale must be a non-empty string/);

  // Falsy input returns null (no error).
  test.equal(LocalCollection._createCollator(null), null);
  test.equal(LocalCollection._createCollator(undefined), null);

  // A pre-built Intl.Collator is returned as-is.
  const existing = new Intl.Collator('en');
  test.equal(LocalCollection._createCollator(existing), existing);

  // Non-object spec
  test.throws(() => {
    LocalCollection._createCollator('en');
  }, /collation must be an object/);

  // Invalid strength
  test.throws(() => {
    LocalCollection._createCollator({locale: 'en', strength: 0});
  }, /collation\.strength must be an integer between 1 and 5/);

  test.throws(() => {
    LocalCollection._createCollator({locale: 'en', strength: 6});
  }, /collation\.strength must be an integer between 1 and 5/);
});

Tinytest.add('minimongo - collation - _id matching with collation', test => {
  const collation = {locale: 'en', strength: 2};
  const c = new LocalCollection();
  c.insert({_id: 'ABC', val: 1});

  // Scalar _id selector uses collation when specified
  const result = c.findOne('abc', {collation});
  test.isNotUndefined(result);
  test.equal(result._id, 'ABC');

  // Document selector {_id: 'abc'} also uses collation
  const result2 = c.findOne({_id: 'abc'}, {collation});
  test.isNotUndefined(result2);
  test.equal(result2._id, 'ABC');

  // Without collation, case-sensitive — no match
  const result3 = c.findOne('abc');
  test.isUndefined(result3);
  const result4 = c.findOne({_id: 'abc'});
  test.isUndefined(result4);
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