import has from 'lodash.has';

if (Meteor.isServer) {
  // Set up allow/deny rules for test collections

  var allowCollections = {};

  // We create the collections in the publisher (instead of using a method or
  // something) because if we made them with a method, we'd need to follow the
  // method with some subscribes, and it's possible that the method call would
  // be delayed by a wait method and the subscribe messages would be sent before
  // it and fail due to the collection not yet existing. So we are very hacky
  // and use a publish.
  Meteor.publish("allowTests", function (nonce, idGeneration) {
    check(nonce, String);
    check(idGeneration, String);
    var cursors = [];
    var needToConfigure;

    // helper for defining a collection. we are careful to create just one
    // Mongo.Collection even if the sub body is rerun, by caching them.
    var defineCollection = function(name, insecure, transform) {
      var fullName = name + idGeneration + nonce;

      var collection;
      if (has(allowCollections, fullName)) {
        collection = allowCollections[fullName];
        if (needToConfigure === true)
          throw new Error("collections inconsistently exist");
        needToConfigure = false;
      } else {
        collection = new Mongo.Collection(
          fullName, {idGeneration: idGeneration, transform: transform});
        allowCollections[fullName] = collection;
        if (needToConfigure === false)
          throw new Error("collections inconsistently don't exist");
        needToConfigure = true;
        collection._insecure = insecure;
        var m = {};
        m["clear-collection-" + fullName] = async function() {
          await collection.removeAsync({}, { returnServerResultPromise: true });
        };
        Meteor.methods(m);
      }

      cursors.push(collection.find());
      return collection;
    };

    var insecureCollection = defineCollection(
      "collection-insecure", true /*insecure*/);
    // totally locked down collection
    var lockedDownCollection = defineCollection(
      "collection-locked-down", false /*insecure*/);
    // restricted collection with same allowed modifications, both with and
    // without the `insecure` package
    var restrictedCollectionDefaultSecure = defineCollection(
      "collection-restrictedDefaultSecure", false /*insecure*/);
    var restrictedCollectionDefaultInsecure = defineCollection(
      "collection-restrictedDefaultInsecure", true /*insecure*/);
    var restrictedCollectionForUpdateOptionsTest = defineCollection(
      "collection-restrictedForUpdateOptionsTest", true /*insecure*/);
    var restrictedCollectionForPartialAllowTest = defineCollection(
      "collection-restrictedForPartialAllowTest", true /*insecure*/);
    var restrictedCollectionForPartialDenyTest = defineCollection(
      "collection-restrictedForPartialDenyTest", true /*insecure*/);
    var restrictedCollectionForFetchTest = defineCollection(
      "collection-restrictedForFetchTest", true /*insecure*/);
    var restrictedCollectionForFetchAllTest = defineCollection(
      "collection-restrictedForFetchAllTest", true /*insecure*/);
    var restrictedCollectionWithTransform = defineCollection(
      "withTransform", false, function (doc) {
        return doc.a;
      });
    var restrictedCollectionForInvalidTransformTest = defineCollection(
      "collection-restrictedForInvalidTransform", false /*insecure*/);
    var restrictedCollectionForClientIdTest = defineCollection(
      "collection-restrictedForClientIdTest", false /*insecure*/);

    if (needToConfigure) {
      restrictedCollectionWithTransform.allow({
        insertAsync: function (userId, doc) {
          return doc.foo === "foo";
        },
        updateAsync: function (userId, doc) {
          return doc.foo === "foo";
        },
        removeAsync: function (userId, doc) {
          return doc.bar === "bar";
        }
      });
      restrictedCollectionWithTransform.allow({
        // transform: null means that doc here is the top level, not the 'a'
        // element.
        transform: null,
        insertAsync: function (userId, doc) {
          return !!doc.topLevelField;
        },
        updateAsync: function (userId, doc) {
          return !!doc.topLevelField;
        }
      });
      restrictedCollectionForInvalidTransformTest.allow({
        // transform must return an object which is not a mongo id
        transform: function (doc) { return doc._id; },
        insert: function () { return true; }
      });
      restrictedCollectionForClientIdTest.allow({
        // This test just requires the collection to trigger the restricted
        // case.
        insert: function () { return true; },
        insertAsync: function () { return true; }
      });

      // two calls to allow to verify that either validator is sufficient.
      var allows = [{
        insertAsync: function(userId, doc) {
          return doc.canInsert;
        },
        updateAsync: function(userId, doc) {
          return doc.canUpdate;
        },
        removeAsync: function (userId, doc) {
          return doc.canRemove;
        }
      }, {
        insertAsync: function(userId, doc) {
          return doc.canInsert2;
        },
        updateAsync: function(userId, doc, fields, modifier) {
          return -1 !== fields.indexOf('canUpdate2');
        },
        removeAsync: function(userId, doc) {
          return doc.canRemove2;
        }
      }];

      // two calls to deny to verify that either one blocks the change.
      var denies = [{
        insertAsync: function(userId, doc) {
          return doc.cantInsert;
        },
        removeAsync: function (userId, doc) {
          return doc.cantRemove;
        }
      }, {
        insertAsync: function(userId, doc) {
          // Don't allow explicit ID to be set by the client.
          return has(doc, '_id');
        },
        updateAsync: function(userId, doc, fields, modifier) {
          return -1 !== fields.indexOf('verySecret');
        }
      }];

      [
        restrictedCollectionDefaultSecure,
        restrictedCollectionDefaultInsecure,
        restrictedCollectionForUpdateOptionsTest
      ].forEach(function (collection) {
        allows.forEach(function (allow) {
          collection.allow(allow);
        });
        denies.forEach(function (deny) {
          collection.deny(deny);
        });
      });

      // just restrict one operation so that we can verify that others
      // fail
      restrictedCollectionForPartialAllowTest.allow({
        insert: function() {}
      });
      restrictedCollectionForPartialDenyTest.deny({
        insert: function() {}
      });

      // verify that we only fetch the fields specified - we should
      // be fetching just field1, field2, and field3.
      restrictedCollectionForFetchTest.allow({
        insertAsync: function() { return true; },
        updateAsync: function(userId, doc) {
          // throw fields in doc so that we can inspect them in test
          throw new Meteor.Error(
            999, "Test: Fields in doc: " + Object.keys(doc).sort().join(','));
        },
        removeAsync: function(userId, doc) {
          // throw fields in doc so that we can inspect them in test
          throw new Meteor.Error(
            999, "Test: Fields in doc: " + Object.keys(doc).sort().join(','));
        },
        fetch: ['field1']
      });
      restrictedCollectionForFetchTest.allow({
        fetch: ['field2']
      });
      restrictedCollectionForFetchTest.deny({
        fetch: ['field3']
      });

      // verify that not passing fetch to one of the calls to allow
      // causes all fields to be fetched
      restrictedCollectionForFetchAllTest.allow({
        insertAsync: function() { return true; },
        updateAsync: function(userId, doc) {
          // throw fields in doc so that we can inspect them in test
          throw new Meteor.Error(
            999, "Test: Fields in doc: " + Object.keys(doc).sort().join(','));
        },
        removeAsync: function(userId, doc) {
          // throw fields in doc so that we can inspect them in test
          throw new Meteor.Error(
            999, "Test: Fields in doc: " + Object.keys(doc).sort().join(','));
        },
        fetch: ['field1']
      });
      restrictedCollectionForFetchAllTest.allow({
        updateAsync: function() { return true; }
      });
    }

    return cursors;
  });
}

if (Meteor.isClient) {
  ['STRING', 'MONGO'].forEach(function (idGeneration) {
    // Set up a bunch of test collections... on the client! They match the ones
    // created by setUpAllowTestsCollections.

    var nonce = Random.id();
    // Tell the server to make, configure, and publish a set of collections unique
    // to our test run. Since the method does not unblock, this will complete
    // running on the server before anything else happens.
    Meteor.subscribe('allowTests', nonce, idGeneration);

    // helper for defining a collection, subscribing to it, and defining
    // a method to clear it
    var defineCollection = function(name, transform) {
      var fullName = name + idGeneration + nonce;
      var collection = new Mongo.Collection(
        fullName, {idGeneration: idGeneration, transform: transform});

      collection.callClearMethod = async function () {
        await Meteor.callAsync('clear-collection-' + fullName);
      };
      collection.unnoncedName = name + idGeneration;
      return collection;
    };

    // totally insecure collection
    var insecureCollection = defineCollection("collection-insecure");

    // totally locked down collection
    var lockedDownCollection = defineCollection("collection-locked-down");

    // restricted collection with same allowed modifications, both with and
    // without the `insecure` package
    var restrictedCollectionDefaultSecure = defineCollection(
      "collection-restrictedDefaultSecure");
    var restrictedCollectionDefaultInsecure = defineCollection(
      "collection-restrictedDefaultInsecure");
    var restrictedCollectionForUpdateOptionsTest = defineCollection(
      "collection-restrictedForUpdateOptionsTest");
    var restrictedCollectionForPartialAllowTest = defineCollection(
      "collection-restrictedForPartialAllowTest");
    var restrictedCollectionForPartialDenyTest = defineCollection(
      "collection-restrictedForPartialDenyTest");
    var restrictedCollectionForFetchTest = defineCollection(
      "collection-restrictedForFetchTest");
    var restrictedCollectionForFetchAllTest = defineCollection(
      "collection-restrictedForFetchAllTest");
    var restrictedCollectionWithTransform = defineCollection(
      "withTransform", function (doc) {
        return doc.a;
      });
    var restrictedCollectionForInvalidTransformTest = defineCollection(
      "collection-restrictedForInvalidTransform");
    var restrictedCollectionForClientIdTest = defineCollection(
      "collection-restrictedForClientIdTest");

    // test that if allow is called once then the collection is
    // restricted, and that other mutations aren't allowed
    testAsyncMulti('collection - partial allow, ' + idGeneration, [
      async function(test, expect) {
        try {
          await restrictedCollectionForPartialAllowTest.updateAsync(
            'foo',
            { $set: { updated: true } },
            {
              returnServerResultPromise: true,
            }
          );
        } catch (err) {
          test.equal(err.error, 403);
        }
      },
    ]);

    // test that if deny is called once then the collection is
    // restricted, and that other mutations aren't allowed
    testAsyncMulti('collection - partial deny, ' + idGeneration, [
      async function(test, expect) {
        try {
          await restrictedCollectionForPartialDenyTest.updateAsync(
            'foo',
            {
              $set: { updated: true },
            },
            {
              returnServerResultPromise: true,
            }
          );
        } catch (err) {
          test.equal(err.error, 403);
        }
      },
    ]);


    // test that we only fetch the fields specified
    testAsyncMulti('collection - fetch, ' + idGeneration, [
      async function(test, expect) {
        var fetchId = await restrictedCollectionForFetchTest.insertAsync({
          field1: 1,
          field2: 1,
          field3: 1,
          field4: 1,
        },{
          returnServerResultPromise: true,
        });
        var fetchAllId = await restrictedCollectionForFetchAllTest.insertAsync({
          field1: 1,
          field2: 1,
          field3: 1,
          field4: 1,
        },{
          returnServerResultPromise: true,
        });
       await restrictedCollectionForFetchTest
         .updateAsync(
           fetchId,
           { $set: { updated: true } },
           {
             returnServerResultPromise: true,
           }
         )
         .catch(
           expect(function(err) {
             test.equal(
               err.reason,
               'Test: Fields in doc: _id,field1,field2,field3'
             );
           })
         );

        await restrictedCollectionForFetchTest
          .removeAsync(fetchId, {
            returnServerResultPromise: true,
          })
          .catch(
            expect(function(err) {
              test.equal(
                err.reason,
                'Test: Fields in doc: _id,field1,field2,field3'
              );
            })
          );

        await restrictedCollectionForFetchAllTest
          .updateAsync(
            fetchAllId,
            { $set: { updated: true } },
            {
              returnServerResultPromise: true,
            }
          )
          .catch(
            expect(function(err) {
              test.equal(
                err.reason,
                'Test: Fields in doc: _id,field1,field2,field3,field4'
              );
            })
          );
        await restrictedCollectionForFetchAllTest
          .removeAsync(fetchAllId, {
            returnServerResultPromise: true,
          })
          .catch(
            expect(function(err) {
              test.equal(
                err.reason,
                'Test: Fields in doc: _id,field1,field2,field3,field4'
              );
            })
          );
      },
    ]);

    (function() {
      testAsyncMulti('collection - restricted factories ' + idGeneration, [
        async function(test, expect) {
          await restrictedCollectionWithTransform.callClearMethod();
          test.equal(
            await restrictedCollectionWithTransform.find().countAsync(),
            0
          );
        },
        async function(test, expect) {
          var self = this;
          await restrictedCollectionWithTransform
            .insertAsync(
              {
                a: { foo: 'foo', bar: 'bar', baz: 'baz' },
              },
              {
                returnServerResultPromise: true,
              }
            )
            .then(
              expect(function(res) {
                test.isTrue(res);
                self.item1 = res;
              })
            );
          await restrictedCollectionWithTransform
            .insertAsync(
              {
                a: { foo: 'foo', bar: 'quux', baz: 'quux' },
                b: 'potato',
              },
              {
                returnServerResultPromise: true,
              }
            )
            .then(
              expect(function(res) {
                test.isTrue(res);
                self.item2 = res;
              })
            );
          await restrictedCollectionWithTransform
            .insertAsync(
              {
                a: { foo: 'adsfadf', bar: 'quux', baz: 'quux' },
                b: 'potato',
              },
              {
                returnServerResultPromise: true,
              }
            )
            .catch(
              expect(function(e, res) {
                test.isTrue(e);
              })
            );
          await restrictedCollectionWithTransform
            .insertAsync(
              {
                a: { foo: 'bar' },
                topLevelField: true,
              },
              {
                returnServerResultPromise: true,
              }
            )
            .then(
              expect(function(res) {
                test.isTrue(res);
                self.item3 = res;
              })
            );
        },
        async function(test, expect) {
          var self = this;
          // This should work, because there is an update allow for things with
          // topLevelField.
          await restrictedCollectionWithTransform
            .updateAsync(
              self.item3,
              { $set: { xxx: true } },
              {
                returnServerResultPromise: true,
              }
            )
            .then(
              expect(function(res) {
                test.equal(1, res);
              })
            );
        },
        async function(test, expect) {
          var self = this;
          test.equal(
            await restrictedCollectionWithTransform.findOneAsync(self.item1),
            {
              _id: self.item1,
              foo: 'foo',
              bar: 'bar',
              baz: 'baz',
            }
          );
          await restrictedCollectionWithTransform
            .removeAsync(self.item1, {
              returnServerResultPromise: true,
            })
            .then(
              expect(function(res) {
                test.isTrue(res);
              })
            );
          await restrictedCollectionWithTransform
            .removeAsync(self.item2, {
              returnServerResultPromise: true,
            })
            .catch(
              expect(function(e) {
                test.isTrue(e);
              })
            );
        },
      ]);
    })();

    testAsyncMulti('collection - insecure, ' + idGeneration, [
      async function(test, expect) {
        await insecureCollection.callClearMethod();
        test.equal(await insecureCollection.find().countAsync(), 0);
      },
      async function(test, expect) {
        let idThen;
        var id = await insecureCollection
          .insertAsync(
            { foo: 'bar' },
            {
              returnServerResultPromise: true,
            }
          )
          .then(async function(res) {
            idThen = res;
            test.equal(await insecureCollection.find(res).countAsync(), 1);
            test.equal((await insecureCollection.findOneAsync(res)).foo, 'bar');
            return res;
          });
        test.equal(idThen, id);
        test.equal(await insecureCollection.find(id).countAsync(), 1);
        test.equal((await insecureCollection.findOneAsync(id)).foo, 'bar');
      },
    ]);

    testAsyncMulti('collection - locked down, ' + idGeneration, [
      async function(test, expect) {
        await lockedDownCollection.callClearMethod();
        test.equal(await lockedDownCollection.find().countAsync(), 0);
      },
      async function(test, expect) {
        await lockedDownCollection
          .insertAsync(
            { foo: 'bar' },
            {
              returnServerResultPromise: true,
            }
          )
          .catch(async function(err, res) {
            test.equal(err.error, 403);
            test.equal(await lockedDownCollection.find().countAsync(), 0);
          });
      },
    ]);

    (function() {
      var collection = restrictedCollectionForUpdateOptionsTest;
      var id1, id2;
      testAsyncMulti('collection - update options, ' + idGeneration, [
        // init
        async function(test, expect) {
          await collection.callClearMethod().then(async function() {
            test.equal(await collection.find().countAsync(), 0);
          });
        },
        // put a few objects
        async function(test, expect) {
          var doc = { canInsert: true, canUpdate: true };
          id1 = await collection.insertAsync(doc);
          id2 = await collection.insertAsync(doc);
          await collection.insertAsync(doc);
          await collection
            .insertAsync(doc, { returnServerResultPromise: true })
            .then(async function(res) {
              test.equal(await collection.find().countAsync(), 4);
            });
        },
        // update by id
        async function(test, expect) {
          await collection
            .updateAsync(
              id1,
              { $set: { updated: true } },
              { returnServerResultPromise: true }
            )
            .then(async function(res) {
              test.equal(res, 1);
              test.equal(
                await collection.find({ updated: true }).countAsync(),
                1
              );
            });
        },
        // update by id in an object
        async function(test, expect) {
          await collection
            .updateAsync(
              { _id: id2 },
              { $set: { updated: true } },
              { returnServerResultPromise: true }
            )
            .then(async function(res) {
              test.equal(res, 1);
              test.equal(
                await collection.find({ updated: true }).countAsync(),
                2
              );
            });
        },
        // update with replacement operator not allowed, and has nice error.
        async function(test, expect) {
          await collection
            .updateAsync(
              { _id: id2 },
              { _id: id2, updated: true },
              { returnServerResultPromise: true }
            )
            .catch(async function(err) {
              test.equal(err.error, 403);
              test.matches(err.reason, /In a restricted/);
              // unchanged
              test.equal(
                await collection.find({ updated: true }).countAsync(),
                2
              );
            });
        },
        // upsert not allowed, and has nice error.
        async function(test, expect) {
          await collection
            .updateAsync(
              { _id: id2 },
              { $set: { upserted: true } },
              { upsert: true, returnServerResultPromise: true }
            )
            .catch(async function(err) {
              test.equal(err.error, 403);
              test.matches(err.reason, /in a restricted/);
              test.equal(
                await collection.find({ upserted: true }).countAsync(),
                0
              );
            });
        },
        // update with rename operator not allowed, and has nice error.
        async function(test, expect) {
          await collection
            .updateAsync(
              { _id: id2 },
              { $rename: { updated: 'asdf' } },
              { returnServerResultPromise: true }
            )
            .catch(async function(err) {
              test.equal(err.error, 403);
              test.matches(err.reason, /not allowed/);
              // unchanged
              test.equal(
                await collection.find({ updated: true }).countAsync(),
                2
              );
            });
        },
        // update method with a non-ID selector is not allowed
        async function(test, expect) {
          // We shouldn't even send the method...
          await test.throwsAsync(async function() {
            await collection.updateAsync(
              { updated: { $exists: false } },
              { $set: { updated: true } }
            );
          });
          // ... but if we did, the server would reject it too.
          await Meteor.callAsync(
            '/' + collection._name + '/updateAsync',
            { updated: { $exists: false } },
            { $set: { updated: true } }
          ).catch(async function(err, res) {
            test.equal(err.error, 403);
            // unchanged
            test.equal(
              await collection.find({ updated: true }).countAsync(),
              2
            );
          });
        },
        // make sure it doesn't think that {_id: 'foo', something: else} is ok.
        async function(test, expect) {
          await test.throwsAsync(async function() {
            await collection.updateAsync(
              { _id: id1, updated: { $exists: false } },
              { $set: { updated: true } }
            );
          });
        },
        // remove method with a non-ID selector is not allowed
        async function(test, expect) {
          // We shouldn't even send the method...
          await test.throwsAsync(async function() {
            await collection.removeAsync({ updated: true });
          });
          // ... but if we did, the server would reject it too.
          await Meteor.callAsync(
            '/' + collection._name + '/removeAsync',
            {
              updated: true,
            }
          ).catch(async function(err) {
            test.equal(err.error, 403);
            // unchanged
            test.equal(
              await collection.find({ updated: true }).countAsync(),
              2
            );
          });
        },
      ]);
    })();

    
      [restrictedCollectionDefaultInsecure, restrictedCollectionDefaultSecure].forEach(
      function(collection) {
        var canUpdateId, canRemoveId;

        testAsyncMulti('collection - ' + collection.unnoncedName, [
          // init
          async function(test, expect) {
            await collection.callClearMethod().then(async function() {
              test.equal(await collection.find().countAsync(), 0);
            });
          },

          // insert with no allows passing. request is denied.
          async function(test, expect) {
            await collection
              .insertAsync({}, { returnServerResultPromise: true })
              .catch(async function(err, res) {
                test.equal(err.error, 403);
                test.equal(await collection.find().countAsync(), 0);
              });
          },
          // insert with one allow and one deny. denied.
          async function(test, expect) {
            await collection
              .insertAsync(
                { canInsert: true, cantInsert: true },
                { returnServerResultPromise: true }
              )
              .catch(async function(err, res) {
                test.equal(err.error, 403);
                test.equal(await collection.find().countAsync(), 0);
              });
          },
          // insert with one allow and other deny. denied.
          async function(test, expect) {
            await collection
              .insertAsync(
                { canInsert: true, _id: Random.id() },
                { returnServerResultPromise: true }
              )
              .catch(async function(err) {
                test.equal(err.error, 403);
                test.equal(await collection.find().countAsync(), 0);
              });
          },
          // insert one allow passes. allowed.
          async function(test, expect) {
            await collection
              .insertAsync(
                { canInsert: true },
                { returnServerResultPromise: true }
              )
              .then(async function(err, res) {
                test.equal(await collection.find().countAsync(), 1);
              });
          },
          // insert other allow passes. allowed.
          // includes canUpdate for later.
          async function(test, expect) {
            canUpdateId = await collection
              .insertAsync(
                { canInsert2: true, canUpdate: true },
                { returnServerResultPromise: true }
              )
              .then(async function(res) {
                test.equal(await collection.find().countAsync(), 2);
                return res;
              });
          },
          // yet a third insert executes. this one has canRemove and
          // cantRemove set for later.
          async function(test, expect) {
            canRemoveId = await collection
              .insertAsync(
                { canInsert: true, canRemove: true, cantRemove: true },
                { returnServerResultPromise: true }
              )
              .then(async function(res) {
                test.equal(await collection.find().countAsync(), 3);
                return res;
              });
          },

          // can't update with a non-operator mutation
          async function(test, expect) {
            await collection
              .updateAsync(
                canUpdateId,
                { newObject: 1 },
                { returnServerResultPromise: true }
              )
              .catch(async function(err, res) {
                test.equal(err.error, 403);
                test.equal(await collection.find().countAsync(), 3);
              });
          },

          // updating dotted fields works as if we are changing their
          // top part
          async function(test, expect) {
            await collection
              .updateAsync(
                canUpdateId,
                { $set: { 'dotted.field': 1 } },
                { returnServerResultPromise: true }
              )
              .then(async function(res) {
                test.equal(res, 1);
                test.equal(
                  (await collection.findOneAsync(canUpdateId)).dotted.field,
                  1
                );
              });
          },
          async function(test, expect) {
            await collection
              .updateAsync(
                canUpdateId,
                { $set: { 'verySecret.field': 1 } },
                { returnServerResultPromise: true }
              )
              .catch(async function(err, res) {
                test.equal(err.error, 403);
                test.equal(
                  await collection
                    .find({ verySecret: { $exists: true } })
                    .countAsync(),
                  0
                );
              });
          },

          // update doesn't do anything if no docs match
          async function(test, expect) {
            await collection
              .updateAsync(
                "doesn't exist",
                { $set: { updated: true } },
                { returnServerResultPromise: true }
              )
              .then(async function(res) {
                test.equal(res, 0);
                // nothing has changed
                test.equal(await collection.find().countAsync(), 3);
                test.equal(
                  await collection.find({ updated: true }).countAsync(),
                  0
                );
              });
          },
          // update fails when access is denied trying to set `verySecret`
          async function(test, expect) {
            await collection
              .updateAsync(
                canUpdateId,
                { $set: { verySecret: true } },
                { returnServerResultPromise: true }
              )
              .catch(async function(err) {
                test.equal(err.error, 403);
                // nothing has changed
                test.equal(await collection.find().countAsync(), 3);
                test.equal(
                  await collection.find({ updated: true }).countAsync(),
                  0
                );
              });
          },
          // update fails when trying to set two fields, one of which is
          // `verySecret`
          async function(test, expect) {
            await collection
              .updateAsync(
                canUpdateId,
                { $set: { updated: true, verySecret: true } },
                { returnServerResultPromise: true }
              )
              .catch(async function(err, res) {
                test.equal(err.error, 403);
                // nothing has changed
                test.equal(await collection.find().countAsync(), 3);
                test.equal(
                  await collection.find({ updated: true }).countAsync(),
                  0
                );
              });
          },
          // update fails when trying to modify docs that don't
          // have `canUpdate` set
          async function(test, expect) {
            await collection
              .updateAsync(
                canRemoveId,
                { $set: { updated: true } },
                { returnServerResultPromise: true }
              )
              .catch(async function(err, res) {
                test.equal(err.error, 403);
                // nothing has changed
                test.equal(await collection.find().countAsync(), 3);
                test.equal(
                  await collection.find({ updated: true }).countAsync(),
                  0
                );
              });
          },
          // update executes when it should
          async function(test, expect) {
            await collection
              .updateAsync(
                canUpdateId,
                { $set: { updated: true } },
                { returnServerResultPromise: true }
              )
              .then(async function(res) {
                test.equal(res, 1);
                test.equal(
                  await collection.find({ updated: true }).countAsync(),
                  1
                );
              });
          },

          // remove fails when trying to modify a doc with no `canRemove` set
          async function(test, expect) {
            await collection
              .removeAsync(canUpdateId, { returnServerResultPromise: true })
              .catch(async function(err, res) {
                test.equal(err.error, 403);
                // nothing has changed
                test.equal(await collection.find().countAsync(), 3);
              });
          },
          // remove fails when trying to modify an doc with `cantRemove`
          // set
          async function(test, expect) {
            await collection
              .removeAsync(canRemoveId, { returnServerResultPromise: true })
              .catch(async function(err, res) {
                test.equal(err.error, 403);
                // nothing has changed
                test.equal(await collection.find().countAsync(), 3);
              });
          },

          // update the doc to remove cantRemove.
          async function(test, expect) {
            await collection
              .updateAsync(
                canRemoveId,
                { $set: { cantRemove: false, canUpdate2: true } },
                { returnServerResultPromise: true }
              )
              .then(async function(res) {
                test.equal(res, 1);
                test.equal(
                  await collection.find({ cantRemove: true }).countAsync(),
                  0
                );
              });
          },

          // now remove can remove it.
          async function(test, expect) {
            await collection
              .removeAsync(canRemoveId, { returnServerResultPromise: true })
              .then(async function(res) {
                test.equal(res, 1);
                // successfully removed
                test.equal(await collection.find().countAsync(), 2);
              });
          },

          // try to remove a doc that doesn't exist. see we remove no docs.
          async function(test, expect) {
            await collection
              .removeAsync('some-random-id-that-never-matches', {
                returnServerResultPromise: true,
              })
              .then(async function(res) {
                test.equal(res, 0);
                // nothing removed
                test.equal(await collection.find().countAsync(), 2);
              });
          },

          // methods can still bypass restrictions
          async function(test, expect) {
            await collection.callClearMethod().then(async function(err, res) {
              // successfully removed
              test.equal(await collection.find().countAsync(), 0);
            });
          },
        ]);
      }
    );
    testAsyncMulti(
      'collection - allow/deny transform must return object, ' + idGeneration,
      [
        async function(test, expect) {
          await restrictedCollectionForInvalidTransformTest
            .insertAsync({}, { returnServerResultPromise: true })
            .catch(function(err) {
              test.isTrue(err);
            });
        },
      ]
    );
    testAsyncMulti(
      'collection - restricted collection allows client-side id, ' +
        idGeneration,
      [
        async function(test, expect) {
          var self = this;
          self.id = Random.id();
          await restrictedCollectionForClientIdTest
            .insertAsync({ _id: self.id }, { returnServerResultPromise: true })
            .then(async function(res) {
              test.equal(res, self.id);
              test.equal(
                await restrictedCollectionForClientIdTest.findOneAsync(self.id),
                {
                  _id: self.id,
                }
              );
            });
        },
      ]
    );
  });  // end idGeneration loop
}  // end if isClient



// A few simple server-only tests which don't need to coordinate collections
// with the client..
if (Meteor.isServer) {
  Tinytest.add("collection - allow and deny validate options", function (test) {
    var collection = new Mongo.Collection(null);

    test.throws(function () {
      collection.allow({invalidOption: true});
    });
    test.throws(function () {
      collection.deny({invalidOption: true});
    });

    ['insert', 'update', 'remove', 'fetch'].forEach(function (key) {
      var options = {};
      options[key] = true;
      test.throws(function () {
        collection.allow(options);
      });
      test.throws(function () {
        collection.deny(options);
      });
    });

    ['insert', 'update', 'remove'].forEach(function (key) {
      var options = {};
      options[key] = false;
      test.throws(function () {
        collection.allow(options);
      });
      test.throws(function () {
        collection.deny(options);
      });
    });

    ['insert', 'update', 'remove'].forEach(function (key) {
      var options = {};
      options[key] = undefined;
      test.throws(function () {
        collection.allow(options);
      });
      test.throws(function () {
        collection.deny(options);
      });
    });

    ['insert', 'update', 'remove'].forEach(function (key) {
      var options = {};
      options[key] = ['an array']; // this should be a function, not an array
      test.throws(function () {
        collection.allow(options);
      });
      test.throws(function () {
        collection.deny(options);
      });
    });

    test.throws(function () {
      collection.allow({fetch: function () {}}); // this should be an array
    });
  });

  Tinytest.add("collection - calling allow restricts", function (test) {
    var collection = new Mongo.Collection(null);
    test.equal(collection._restricted, false);
    collection.allow({
      insert: function() {}
    });
    test.equal(collection._restricted, true);
  });

  Tinytest.add("collection - global insecure", function (test) {
    // note: This test alters the global insecure status, by sneakily hacking
    // the global Package object!
    var insecurePackage = Package.insecure;

    Package.insecure = {};
    var collection = new Mongo.Collection(null);
    test.equal(collection._isInsecure(), true);

    Package.insecure = undefined;
    test.equal(collection._isInsecure(), false);

    delete Package.insecure;
    test.equal(collection._isInsecure(), false);

    collection._insecure = true;
    test.equal(collection._isInsecure(), true);

    if (insecurePackage)
      Package.insecure = insecurePackage;
    else
      delete Package.insecure;
  });
}

var AllowAsyncValidateCollection;

Tinytest.addAsync(
  "collection - validate server operations when using allow-deny rules on the client",
  async function (test) {
    AllowAsyncValidateCollection =
      AllowAsyncValidateCollection ||
      new Mongo.Collection(`allowdeny-async-validation`);
    if (Meteor.isServer) {
      await AllowAsyncValidateCollection.removeAsync();
    }
    AllowAsyncValidateCollection.allow({
      insertAsync() {
        return true;
      },
      insert() {
        return true;
      },
      updateAsync() {
        return true;
      },
      update() {
        return true;
      },
      removeAsync() {
        return true;
      },
      remove() {
        return true;
      },
    });

    if (Meteor.isClient) {
      /* sync tests */
      var id = await new Promise((resolve, reject) => {
        AllowAsyncValidateCollection.insert({ num: 1 }, (error, result) =>
          error ? reject(error) : resolve(result)
        );
      });
      await new Promise((resolve, reject) => {
        AllowAsyncValidateCollection.update(
          id,
          { $set: { num: 11 } },
          (error, result) => (error ? reject(error) : resolve(result))
        );
      });
      await new Promise((resolve, reject) => {
        AllowAsyncValidateCollection.remove(id, (error, result) =>
          error ? reject(error) : resolve(result)
        );
      });

      /* async tests */
      id = await AllowAsyncValidateCollection.insertAsync({ num: 2 });
      await AllowAsyncValidateCollection.updateAsync(id, { $set: { num: 22 } });
      await AllowAsyncValidateCollection.removeAsync(id);
    }
  }
);

function configAllAsyncAllowDeny(collection, configType = 'allow', enabled) {
  collection[configType]({
    async insertAsync(selector, doc) {
      if (doc.force) return true;
      await Meteor._sleepForMs(100);
      return enabled;
    },
    async updateAsync() {
      await Meteor._sleepForMs(100);
      return enabled;
    },
    async removeAsync() {
      await Meteor._sleepForMs(100);
      return enabled;
    },
  });
}

async function runAllAsyncExpect(test, collection, allow) {
  let id;
  /* async tests */
  try {
    id = await collection.insertAsync({ num: 2 });
    test.isTrue(allow);
  } catch (e) {
    test.isTrue(!allow);
  }
  try {
    id = await collection.insertAsync({ force: true });
    await collection.updateAsync(id, { $set: { num: 22 } });
    test.isTrue(allow);
  } catch (e) {
    test.isTrue(!allow);
  }
  try {
    await collection.removeAsync(id);
    test.isTrue(allow);
  } catch (e) {
    test.isTrue(!allow);
  }
}

var AllowDenyAsyncRulesCollections = {};

testAsyncMulti("collection - async definitions on allow/deny rules", [
  async function (test) {
    AllowDenyAsyncRulesCollections.allowed =
      AllowDenyAsyncRulesCollections.allowed ||
      new Mongo.Collection(`allowdeny-async-rules-allowed`);
    if (Meteor.isServer) {
      await AllowDenyAsyncRulesCollections.allowed.removeAsync();
    }

    configAllAsyncAllowDeny(AllowDenyAsyncRulesCollections.allowed, 'allow', true);
    if (Meteor.isClient) {
      await runAllAsyncExpect(test, AllowDenyAsyncRulesCollections.allowed, true);
    }
  },
  async function (test) {
    AllowDenyAsyncRulesCollections.notAllowed =
      AllowDenyAsyncRulesCollections.notAllowed ||
      new Mongo.Collection(`allowdeny-async-rules-notAllowed`);
    if (Meteor.isServer) {
      await AllowDenyAsyncRulesCollections.notAllowed.removeAsync();
    }

    configAllAsyncAllowDeny(AllowDenyAsyncRulesCollections.notAllowed, 'allow', false);
    if (Meteor.isClient) {
      await runAllAsyncExpect(test, AllowDenyAsyncRulesCollections.notAllowed, false);
    }
  },
  async function (test) {
    AllowDenyAsyncRulesCollections.denied =
      AllowDenyAsyncRulesCollections.denied ||
      new Mongo.Collection(`allowdeny-async-rules-denied`);
    if (Meteor.isServer) {
      await AllowDenyAsyncRulesCollections.denied.removeAsync();
    }

    configAllAsyncAllowDeny(AllowDenyAsyncRulesCollections.denied, 'deny', true);
    if (Meteor.isClient) {
      await runAllAsyncExpect(test, AllowDenyAsyncRulesCollections.denied, false);
    }
  },
]);
