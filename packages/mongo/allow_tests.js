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
    var needToConfigure = undefined;

    // helper for defining a collection. we are careful to create just one
    // Mongo.Collection even if the sub body is rerun, by caching them.
    var defineCollection = function(name, insecure, transform) {
      var fullName = name + idGeneration + nonce;

      var collection;
      if (_.has(allowCollections, fullName)) {
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
        m["clear-collection-" + fullName] = function() {
          collection.remove({});
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
        insert: function (userId, doc) {
          return doc.foo === "foo";
        },
        update: function (userId, doc) {
          return doc.foo === "foo";
        },
        remove: function (userId, doc) {
          return doc.bar === "bar";
        }
      });
      restrictedCollectionWithTransform.allow({
        // transform: null means that doc here is the top level, not the 'a'
        // element.
        transform: null,
        insert: function (userId, doc) {
          return !!doc.topLevelField;
        },
        update: function (userId, doc) {
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
        insert: function () { return true; }
      });

      // two calls to allow to verify that either validator is sufficient.
      var allows = [{
        insert: function(userId, doc) {
          return doc.canInsert;
        },
        update: function(userId, doc) {
          return doc.canUpdate;
        },
        remove: function (userId, doc) {
          return doc.canRemove;
        }
      }, {
        insert: function(userId, doc) {
          return doc.canInsert2;
        },
        update: function(userId, doc, fields, modifier) {
          return -1 !== _.indexOf(fields, 'canUpdate2');
        },
        remove: function(userId, doc) {
          return doc.canRemove2;
        }
      }];

      // two calls to deny to verify that either one blocks the change.
      var denies = [{
        insert: function(userId, doc) {
          return doc.cantInsert;
        },
        remove: function (userId, doc) {
          return doc.cantRemove;
        }
      }, {
        insert: function(userId, doc) {
          // Don't allow explicit ID to be set by the client.
          return _.has(doc, '_id');
        },
        update: function(userId, doc, fields, modifier) {
          return -1 !== _.indexOf(fields, 'verySecret');
        }
      }];

      _.each([
        restrictedCollectionDefaultSecure,
        restrictedCollectionDefaultInsecure,
        restrictedCollectionForUpdateOptionsTest
      ], function (collection) {
        _.each(allows, function (allow) {
          collection.allow(allow);
        });
        _.each(denies, function (deny) {
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
        insert: function() { return true; },
        update: function(userId, doc) {
          // throw fields in doc so that we can inspect them in test
          throw new Meteor.Error(
            999, "Test: Fields in doc: " + _.keys(doc).join(','));
        },
        remove: function(userId, doc) {
          // throw fields in doc so that we can inspect them in test
          throw new Meteor.Error(
            999, "Test: Fields in doc: " + _.keys(doc).join(','));
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
        insert: function() { return true; },
        update: function(userId, doc) {
          // throw fields in doc so that we can inspect them in test
          throw new Meteor.Error(
            999, "Test: Fields in doc: " + _.keys(doc).join(','));
        },
        remove: function(userId, doc) {
          // throw fields in doc so that we can inspect them in test
          throw new Meteor.Error(
            999, "Test: Fields in doc: " + _.keys(doc).join(','));
        },
        fetch: ['field1']
      });
      restrictedCollectionForFetchAllTest.allow({
        update: function() { return true; }
      });
    }

    return cursors;
  });
}

if (Meteor.isClient) {
  _.each(['STRING', 'MONGO'], function (idGeneration) {
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

      collection.callClearMethod = function (callback) {
        Meteor.call("clear-collection-" + fullName, callback);
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
    testAsyncMulti("collection - partial allow, " + idGeneration, [
      function (test, expect) {
        restrictedCollectionForPartialAllowTest.update(
          'foo', {$set: {updated: true}}, expect(function (err, res) {
            test.equal(err.error, 403);
          }));
      }
    ]);

    // test that if deny is called once then the collection is
    // restricted, and that other mutations aren't allowed
    testAsyncMulti("collection - partial deny, " + idGeneration, [
      function (test, expect) {
        restrictedCollectionForPartialDenyTest.update(
          'foo', {$set: {updated: true}}, expect(function (err, res) {
            test.equal(err.error, 403);
          }));
      }
    ]);


    // test that we only fetch the fields specified
    testAsyncMulti("collection - fetch, " + idGeneration, [
      function (test, expect) {
        var fetchId = restrictedCollectionForFetchTest.insert(
          {field1: 1, field2: 1, field3: 1, field4: 1});
        var fetchAllId = restrictedCollectionForFetchAllTest.insert(
          {field1: 1, field2: 1, field3: 1, field4: 1});
        restrictedCollectionForFetchTest.update(
          fetchId, {$set: {updated: true}}, expect(function (err, res) {
            test.equal(err.reason,
                       "Test: Fields in doc: _id,field1,field2,field3");
          }));
        restrictedCollectionForFetchTest.remove(
          fetchId, expect(function (err, res) {
            test.equal(err.reason,
                       "Test: Fields in doc: _id,field1,field2,field3");
          }));

        restrictedCollectionForFetchAllTest.update(
          fetchAllId, {$set: {updated: true}}, expect(function (err, res) {
            test.equal(err.reason,
                       "Test: Fields in doc: _id,field1,field2,field3,field4");
          }));
        restrictedCollectionForFetchAllTest.remove(
          fetchAllId, expect(function (err, res) {
            test.equal(err.reason,
                       "Test: Fields in doc: _id,field1,field2,field3,field4");
          }));
      }
    ]);

    (function(){
      testAsyncMulti("collection - restricted factories " + idGeneration, [
        function (test, expect) {
          restrictedCollectionWithTransform.callClearMethod(expect(function () {
            test.equal(restrictedCollectionWithTransform.find().count(), 0);
          }));
        },
        function (test, expect) {
          var self = this;
          restrictedCollectionWithTransform.insert({
            a: {foo: "foo", bar: "bar", baz: "baz"}
          }, expect(function (e, res) {
            test.isFalse(e);
            test.isTrue(res);
            self.item1 = res;
          }));
          restrictedCollectionWithTransform.insert({
            a: {foo: "foo", bar: "quux", baz: "quux"},
            b: "potato"
          }, expect(function (e, res) {
            test.isFalse(e);
            test.isTrue(res);
            self.item2 = res;
          }));
          restrictedCollectionWithTransform.insert({
            a: {foo: "adsfadf", bar: "quux", baz: "quux"},
            b: "potato"
          }, expect(function (e, res) {
            test.isTrue(e);
          }));
          restrictedCollectionWithTransform.insert({
            a: {foo: "bar"},
            topLevelField: true
          }, expect(function (e, res) {
            test.isFalse(e);
            test.isTrue(res);
            self.item3 = res;
          }));
        },
        function (test, expect) {
          var self = this;
          // This should work, because there is an update allow for things with
          // topLevelField.
          restrictedCollectionWithTransform.update(
            self.item3, { $set: { xxx: true } }, expect(function (e, res) {
              test.isFalse(e);
              test.equal(1, res);
            }));
        },
        function (test, expect) {
          var self = this;
          test.equal(
            restrictedCollectionWithTransform.findOne(self.item1),
            {_id: self.item1, foo: "foo", bar: "bar", baz: "baz"});
          restrictedCollectionWithTransform.remove(
            self.item1, expect(function (e, res) {
              test.isFalse(e);
            }));
          restrictedCollectionWithTransform.remove(
            self.item2, expect(function (e, res) {
              test.isTrue(e);
            }));
        }
      ]);
    })();

    testAsyncMulti("collection - insecure, " + idGeneration, [
      function (test, expect) {
        insecureCollection.callClearMethod(expect(function () {
          test.equal(insecureCollection.find().count(), 0);
        }));
      },
      function (test, expect) {
        var id = insecureCollection.insert({foo: 'bar'}, expect(function(err, res) {
          test.equal(res, id);
          test.equal(insecureCollection.find(id).count(), 1);
          test.equal(insecureCollection.findOne(id).foo, 'bar');
        }));
        test.equal(insecureCollection.find(id).count(), 1);
        test.equal(insecureCollection.findOne(id).foo, 'bar');
      }
    ]);

    testAsyncMulti("collection - locked down, " + idGeneration, [
      function (test, expect) {
        lockedDownCollection.callClearMethod(expect(function() {
          test.equal(lockedDownCollection.find().count(), 0);
        }));
      },
      function (test, expect) {
        lockedDownCollection.insert({foo: 'bar'}, expect(function (err, res) {
          test.equal(err.error, 403);
          test.equal(lockedDownCollection.find().count(), 0);
        }));
      }
    ]);

    (function () {
      var collection = restrictedCollectionForUpdateOptionsTest;
      var id1, id2;
      testAsyncMulti("collection - update options, " + idGeneration, [
        // init
        function (test, expect) {
          collection.callClearMethod(expect(function () {
            test.equal(collection.find().count(), 0);
          }));
        },
        // put a few objects
        function (test, expect) {
          var doc = {canInsert: true, canUpdate: true};
          id1 = collection.insert(doc);
          id2 = collection.insert(doc);
          collection.insert(doc);
          collection.insert(doc, expect(function (err, res) {
            test.isFalse(err);
            test.equal(collection.find().count(), 4);
          }));
        },
        // update by id
        function (test, expect) {
          collection.update(
            id1,
            {$set: {updated: true}},
            expect(function (err, res) {
              test.isFalse(err);
              test.equal(res, 1);
              test.equal(collection.find({updated: true}).count(), 1);
            }));
        },
        // update by id in an object
        function (test, expect) {
          collection.update(
            {_id: id2},
            {$set: {updated: true}},
            expect(function (err, res) {
              test.isFalse(err);
              test.equal(res, 1);
              test.equal(collection.find({updated: true}).count(), 2);
            }));
        },
        // update with replacement operator not allowed, and has nice error.
        function (test, expect) {
          collection.update(
            {_id: id2},
            {_id: id2, updated: true},
            expect(function (err, res) {
              test.equal(err.error, 403);
              test.matches(err.reason, /In a restricted/);
              // unchanged
              test.equal(collection.find({updated: true}).count(), 2);
            }));
        },
        // upsert not allowed, and has nice error.
        function (test, expect) {
          collection.update(
            {_id: id2},
            {$set: { upserted: true }},
            { upsert: true },
            expect(function (err, res) {
              test.equal(err.error, 403);
              test.matches(err.reason, /in a restricted/);
              test.equal(collection.find({ upserted: true }).count(), 0);
            }));
        },
        // update with rename operator not allowed, and has nice error.
        function (test, expect) {
          collection.update(
            {_id: id2},
            {$rename: {updated: 'asdf'}},
            expect(function (err, res) {
              test.equal(err.error, 403);
              test.matches(err.reason, /not allowed/);
              // unchanged
              test.equal(collection.find({updated: true}).count(), 2);
            }));
        },
        // update method with a non-ID selector is not allowed
        function (test, expect) {
          // We shouldn't even send the method...
          test.throws(function () {
            collection.update(
              {updated: {$exists: false}},
              {$set: {updated: true}});
          });
          // ... but if we did, the server would reject it too.
          Meteor.call(
            '/' + collection._name + '/update',
            {updated: {$exists: false}},
            {$set: {updated: true}},
            expect(function (err, res) {
              test.equal(err.error, 403);
              // unchanged
              test.equal(collection.find({updated: true}).count(), 2);
            }));
        },
        // make sure it doesn't think that {_id: 'foo', something: else} is ok.
        function (test, expect) {
          test.throws(function () {
            collection.update(
              {_id: id1, updated: {$exists: false}},
              {$set: {updated: true}});
          });
        },
        // remove method with a non-ID selector is not allowed
        function (test, expect) {
          // We shouldn't even send the method...
          test.throws(function () {
            collection.remove({updated: true});
          });
          // ... but if we did, the server would reject it too.
          Meteor.call(
            '/' + collection._name + '/remove',
            {updated: true},
            expect(function (err, res) {
              test.equal(err.error, 403);
              // unchanged
              test.equal(collection.find({updated: true}).count(), 2);
            }));
        }
      ]);
    }) ();

    _.each(
      [restrictedCollectionDefaultInsecure, restrictedCollectionDefaultSecure],
      function(collection) {
        var canUpdateId, canRemoveId;

        testAsyncMulti("collection - " + collection.unnoncedName, [
          // init
          function (test, expect) {
            collection.callClearMethod(expect(function () {
              test.equal(collection.find().count(), 0);
            }));
          },

          // insert with no allows passing. request is denied.
          function (test, expect) {
            collection.insert(
              {},
              expect(function (err, res) {
                test.equal(err.error, 403);
                test.equal(collection.find().count(), 0);
              }));
          },
          // insert with one allow and one deny. denied.
          function (test, expect) {
            collection.insert(
              {canInsert: true, cantInsert: true},
              expect(function (err, res) {
                test.equal(err.error, 403);
                test.equal(collection.find().count(), 0);
              }));
          },
          // insert with one allow and other deny. denied.
          function (test, expect) {
            collection.insert(
              {canInsert: true, _id: Random.id()},
              expect(function (err, res) {
                test.equal(err.error, 403);
                test.equal(collection.find().count(), 0);
              }));
          },
          // insert one allow passes. allowed.
          function (test, expect) {
            collection.insert(
              {canInsert: true},
              expect(function (err, res) {
                test.isFalse(err);
                test.equal(collection.find().count(), 1);
              }));
          },
          // insert other allow passes. allowed.
          // includes canUpdate for later.
          function (test, expect) {
            canUpdateId = collection.insert(
              {canInsert2: true, canUpdate: true},
              expect(function (err, res) {
                test.isFalse(err);
                test.equal(collection.find().count(), 2);
              }));
          },
          // yet a third insert executes. this one has canRemove and
          // cantRemove set for later.
          function (test, expect) {
            canRemoveId = collection.insert(
              {canInsert: true, canRemove: true, cantRemove: true},
              expect(function (err, res) {
                test.isFalse(err);
                test.equal(collection.find().count(), 3);
              }));
          },

          // can't update with a non-operator mutation
          function (test, expect) {
            collection.update(
              canUpdateId, {newObject: 1},
              expect(function (err, res) {
                test.equal(err.error, 403);
                test.equal(collection.find().count(), 3);
              }));
          },

          // updating dotted fields works as if we are changing their
          // top part
          function (test, expect) {
            collection.update(
              canUpdateId, {$set: {"dotted.field": 1}},
              expect(function (err, res) {
                test.isFalse(err);
                test.equal(res, 1);
                test.equal(collection.findOne(canUpdateId).dotted.field, 1);
              }));
          },
          function (test, expect) {
            collection.update(
              canUpdateId, {$set: {"verySecret.field": 1}},
              expect(function (err, res) {
                test.equal(err.error, 403);
                test.equal(collection.find({verySecret: {$exists: true}}).count(), 0);
              }));
          },

          // update doesn't do anything if no docs match
          function (test, expect) {
            collection.update(
              "doesn't exist",
              {$set: {updated: true}},
              expect(function (err, res) {
                test.isFalse(err);
                test.equal(res, 0);
                // nothing has changed
                test.equal(collection.find().count(), 3);
                test.equal(collection.find({updated: true}).count(), 0);
              }));
          },
          // update fails when access is denied trying to set `verySecret`
          function (test, expect) {
            collection.update(
              canUpdateId, {$set: {verySecret: true}},
              expect(function (err, res) {
                test.equal(err.error, 403);
                // nothing has changed
                test.equal(collection.find().count(), 3);
                test.equal(collection.find({updated: true}).count(), 0);
              }));
          },
          // update fails when trying to set two fields, one of which is
          // `verySecret`
          function (test, expect) {
            collection.update(
              canUpdateId, {$set: {updated: true, verySecret: true}},
              expect(function (err, res) {
                test.equal(err.error, 403);
                // nothing has changed
                test.equal(collection.find().count(), 3);
                test.equal(collection.find({updated: true}).count(), 0);
              }));
          },
          // update fails when trying to modify docs that don't
          // have `canUpdate` set
          function (test, expect) {
            collection.update(
              canRemoveId,
              {$set: {updated: true}},
              expect(function (err, res) {
                test.equal(err.error, 403);
                // nothing has changed
                test.equal(collection.find().count(), 3);
                test.equal(collection.find({updated: true}).count(), 0);
              }));
          },
          // update executes when it should
          function (test, expect) {
            collection.update(
              canUpdateId,
              {$set: {updated: true}},
              expect(function (err, res) {
                test.isFalse(err);
                test.equal(res, 1);
                test.equal(collection.find({updated: true}).count(), 1);
              }));
          },

          // remove fails when trying to modify a doc with no `canRemove` set
          function (test, expect) {
            collection.remove(canUpdateId,
                              expect(function (err, res) {
              test.equal(err.error, 403);
              // nothing has changed
              test.equal(collection.find().count(), 3);
            }));
          },
          // remove fails when trying to modify an doc with `cantRemove`
          // set
          function (test, expect) {
            collection.remove(canRemoveId,
                              expect(function (err, res) {
              test.equal(err.error, 403);
              // nothing has changed
              test.equal(collection.find().count(), 3);
            }));
          },

          // update the doc to remove cantRemove.
          function (test, expect) {
            collection.update(
              canRemoveId,
              {$set: {cantRemove: false, canUpdate2: true}},
              expect(function (err, res) {
                test.isFalse(err);
                test.equal(res, 1);
                test.equal(collection.find({cantRemove: true}).count(), 0);
              }));
          },

          // now remove can remove it.
          function (test, expect) {
            collection.remove(canRemoveId,
                              expect(function (err, res) {
              test.isFalse(err);
              test.equal(res, 1);
              // successfully removed
              test.equal(collection.find().count(), 2);
            }));
          },

          // try to remove a doc that doesn't exist. see we remove no docs.
          function (test, expect) {
            collection.remove('some-random-id-that-never-matches',
                              expect(function (err, res) {
              test.isFalse(err);
              test.equal(res, 0);
              // nothing removed
              test.equal(collection.find().count(), 2);
            }));
          },

          // methods can still bypass restrictions
          function (test, expect) {
            collection.callClearMethod(
              expect(function (err, res) {
                test.isFalse(err);
                // successfully removed
                test.equal(collection.find().count(), 0);
            }));
          }
        ]);
      });
    testAsyncMulti(
      "collection - allow/deny transform must return object, " + idGeneration,
      [function (test, expect) {
        restrictedCollectionForInvalidTransformTest.insert({}, expect(function (err, res) {
          test.isTrue(err);
        }));
      }]);
    testAsyncMulti(
      "collection - restricted collection allows client-side id, " + idGeneration,
      [function (test, expect) {
        var self = this;
        self.id = Random.id();
        restrictedCollectionForClientIdTest.insert({_id: self.id}, expect(function (err, res) {
          test.isFalse(err);
          test.equal(res, self.id);
          test.equal(restrictedCollectionForClientIdTest.findOne(self.id),
                     {_id: self.id});
        }));
      }]);
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

    _.each(['insert', 'update', 'remove', 'fetch'], function (key) {
      var options = {};
      options[key] = true;
      test.throws(function () {
        collection.allow(options);
      });
      test.throws(function () {
        collection.deny(options);
      });
    });

    _.each(['insert', 'update', 'remove'], function (key) {
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
