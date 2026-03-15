import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('minimongo - shared', () => {
  it('wrapTransform', () => {
    const wrap = LocalCollection.wrapTransform;

    // Transforming no function gives falsey.
    assert.ok(!wrap(undefined));
    assert.ok(!wrap(null));

    // It's OK if you don't change the ID.
    const validTransform = doc => {
      delete doc.x;
      doc.y = 42;
      doc.z = () => 43;
      return doc;
    };
    const transformed = wrap(validTransform)({_id: 'asdf', x: 54});
    assert.deepStrictEqual(Object.keys(transformed), ['_id', 'y', 'z']);
    assert.strictEqual(transformed.y, 42);
    assert.strictEqual(transformed.z(), 43);

    // Ensure that ObjectIDs work (even if the _ids in question are not ===-equal)
    const oid1 = new MongoID.ObjectID();
    const oid2 = new MongoID.ObjectID(oid1.toHexString());
    assert.ok(EJSON.equals(wrap(() => ({
      _id: oid2,
    }))({_id: oid1}),
    {_id: oid2}));

    // transform functions must return objects
    const invalidObjects = [
      'asdf', new MongoID.ObjectID(), false, null, true,
      27, [123], /adsf/, new Date, () => {}, undefined,
    ];
    invalidObjects.forEach(invalidObject => {
      const wrapped = wrap(() => invalidObject);
      assert.throws(() => {
        wrapped({_id: 'asdf'});
      });
    }, /transform must return object/);

    // transform functions may not change _ids
    const wrapped = wrap(doc => { doc._id = 'x'; return doc; });
    assert.throws(() => {
      wrapped({_id: 'y'});
    }, /can't have different _id/);

    // transform functions may remove _ids
    assert.ok(EJSON.equals({_id: 'a', x: 2},
      wrap(d => {delete d._id; return d;})({_id: 'a', x: 2})));

    // test that wrapped transform functions are nonreactive
    const unwrapped = doc => {
      assert.ok(!Tracker.active);
      return doc;
    };
    const handle = Tracker.autorun(() => {
      assert.ok(Tracker.active);
      wrap(unwrapped)({_id: 'xxx'});
    });
    handle.stop();
  });

  it('bulk remove with $in operator removes all matching documents', () => {
    const coll = new LocalCollection();

    // Insert multiple documents
    const ids = ['id1', 'id2', 'id3', 'id4'];
    ids.forEach(id => {
      coll.insert({ _id: id, value: `item-${id}` });
    });

    // Verify we have 4 documents
    assert.strictEqual(coll.find().count(), 4);

    // Remove 2 documents using $in operator
    const removedCount = coll.remove({ _id: { $in: ['id1', 'id2'] } });

    // This should remove 2 documents, not just 1
    assert.strictEqual(removedCount, 2);

    // Verify only 2 documents remain
    assert.strictEqual(coll.find().count(), 2);

    // Verify the correct documents were removed
    assert.strictEqual(coll.findOne('id1'), undefined);
    assert.strictEqual(coll.findOne('id2'), undefined);

    // Verify the other documents still exist
    assert.notStrictEqual(coll.findOne('id3'), undefined);
    assert.notStrictEqual(coll.findOne('id4'), undefined);
  });

  it('$geoIntersects should throw error', () => {
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

    assert.throws(
      () => collection.findOne(query),
      /Unrecognized operator: \$geoIntersects/,
      'Should throw error for $geoIntersects in Minimongo'
    );
  });
});
