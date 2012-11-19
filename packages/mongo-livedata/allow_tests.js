(function () {

  //
  // Set up a bunch of test collections
  //

  // helper for defining a collection, subscribing to it, and defining
  // a method to clear it
  var defineCollection = function(name, insecure) {
    var collection = new Meteor.Collection(name);
    collection._insecure = insecure;

    if (Meteor.isServer) {
      Meteor.publish("collection-" + name, function() {
        return collection.find();
      });

      var m = {};
      m["clear-collection-" + name] = function(runId) {
        collection.remove({world: runId});
      };
      Meteor.methods(m);
    } else {
      Meteor.subscribe("collection-" + name);
    }

    collection.callClearMethod = function (runId, callback) {
      Meteor.call("clear-collection-" + name, runId, callback);
    };
    return collection;
  };

  // totally insecure collection
  var insecureCollection = defineCollection(
    "collection-insecure", true /*insecure*/);

  // totally locked down collection
  var lockedDownCollection = defineCollection(
    "collection-locked-down", false /*insecure*/);

  // resticted collection with same allowed modifications, both with and
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


  //
  // Set up allow/deny rules for test collections
  //


  // two calls to allow to verify that either validator is sufficient.
  var allows = [{
    insert: function(userId, doc) {
      return doc.canInsert;
    },
    update: function(userId, docs) {
      return _.all(docs, function (doc) {
        return doc.canUpdate;
      });
    },
    remove: function (userId, docs) {
      return _.all(docs, function (doc) {
        return doc.canRemove;
      });
    }
  }, {
    insert: function(userId, doc) {
      return doc.canInsert2;
    },
    update: function(userId, docs, fields, modifier) {
      return -1 !== _.indexOf(fields, 'canUpdate2');
    },
    remove: function(userId, docs) {
      return _.all(docs, function (doc) {
        return doc.canRemove2;
      });
    }
  }];

  // two calls to deny to verify that either one blocks the change.
  var denies = [{
    insert: function(userId, doc) {
      return doc.cantInsert;
    },
    remove: function (userId, docs) {
      return _.any(docs, function (doc) {
        return doc.cantRemove;
      });
    }
  }, {
    insert: function(userId, doc) {
      return doc.cantInsert2;
    },
    update: function(userId, docs, fields, modifier) {
      return -1 !== _.indexOf(fields, 'verySecret');
    }
  }];




  if (Meteor.isServer) {
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
      update: function(userId, docs) {
        // throw fields in first doc so that we can inspect them in test
        throw new Meteor.Error(
          999, "Test: Fields in doc: " + _.keys(docs[0]).join(','));
      },
      remove: function(userId, docs) {
        // throw fields in first doc so that we can inspect them in test
        throw new Meteor.Error(
          999, "Test: Fields in doc: " + _.keys(docs[0]).join(','));
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
      update: function(userId, docs) {
        // throw fields in first doc so that we can inspect them in test
        throw new Meteor.Error(
          999, "Test: Fields in doc: " + _.keys(docs[0]).join(','));
      },
      remove: function(userId, docs) {
        // throw fields in first doc so that we can inspect them in test
        throw new Meteor.Error(
          999, "Test: Fields in doc: " + _.keys(docs[0]).join(','));
      },
      fetch: ['field1']
    });
    restrictedCollectionForFetchAllTest.allow({
      update: function() { return true; }
    });
  }


  //
  // Begin actual tests
  //

  if (Meteor.isServer) {
    Tinytest.add("collection - allow and deny validate options", function (test) {
      var collection = new Meteor.Collection(null);

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
      var collection = new Meteor.Collection(null);
      test.equal(collection._restricted, false);
      collection.allow({
        insert: function() {}
      });
      test.equal(collection._restricted, true);
    });

    Tinytest.add("collection - global insecure", function (test) {
      // note: This test alters the global insecure status! This may
      // collide with itself if run multiple times (but is better than
      // the old test which had the same problem)
      var oldGlobalInsecure = Meteor.Collection.insecure;

      Meteor.Collection.insecure = true;
      var collection = new Meteor.Collection(null);
      test.equal(collection._isInsecure(), true);

      Meteor.Collection.insecure = false;
      test.equal(collection._isInsecure(), false);

      collection._insecure = true;
      test.equal(collection._isInsecure(), true);

      Meteor.Collection.insecure = oldGlobalInsecure;
    });

  }

  if (Meteor.isClient) {
    // test that if allow is called once then the collection is
    // restricted, and that other mutations aren't allowed
    testAsyncMulti("collection - partial allow", [
      function (test, expect) {
        restrictedCollectionForPartialAllowTest.update(
          {world: test.runId()}, {$set: {updated: true}}, expect(function (err, res) {
            test.equal(err.error, 403);
          }));
      }
    ]);

    // test that if deny is called once then the collection is
    // restricted, and that other mutations aren't allowed
    testAsyncMulti("collection - partial deny", [
      function (test, expect) {
        restrictedCollectionForPartialDenyTest.update(
          {world: test.runId()}, {$set: {updated: true}}, expect(function (err, res) {
            test.equal(err.error, 403);
          }));
      }
    ]);


    // test that we only fetch the fields specified
    testAsyncMulti("collection - fetch", [
      function (test, expect) {
        restrictedCollectionForFetchTest.insert(
          {field1: 1, field2: 1, field3: 1, field4: 1,
           world: test.runId()});
        restrictedCollectionForFetchAllTest.insert(
          {field1: 1, field2: 1, field3: 1, field4: 1,
           world: test.runId()});

      }, function (test, expect) {
        restrictedCollectionForFetchTest.update(
          {world: test.runId()},
          {$set: {updated: true}}, expect(function (err, res) {
            test.equal(err.reason,
                       "Test: Fields in doc: field1,field2,field3,_id");
          }));
        restrictedCollectionForFetchTest.remove(
          {world: test.runId()}, expect(function (err, res) {
            test.equal(err.reason,
                       "Test: Fields in doc: field1,field2,field3,_id");
          }));

        restrictedCollectionForFetchAllTest.update(
          {world: test.runId()},
          {$set: {updated: true}}, expect(function (err, res) {
            test.equal(err.reason,
                       "Test: Fields in doc: field1,field2,field3,field4,world,_id");
          }));
        restrictedCollectionForFetchAllTest.remove(
          {world: test.runId()}, expect(function (err, res) {
            test.equal(err.reason,
                       "Test: Fields in doc: field1,field2,field3,field4,world,_id");
          }));

      }
    ]);
  }

  if (Meteor.isClient) {
    testAsyncMulti("collection - insecure", [
      function (test, expect) {
        insecureCollection.callClearMethod(test.runId(), expect(function () {
          test.equal(insecureCollection.find({world: test.runId()}).count(), 0);
        }));
      },
      function (test, expect) {
        insecureCollection.insert({world: test.runId(), foo: 'bar'}, expect(function(err, res) {
          test.equal(insecureCollection.find({world: test.runId()}).count(), 1);
          test.equal(insecureCollection.findOne({world: test.runId()}).foo, 'bar');
        }));
        test.equal(insecureCollection.find({world: test.runId()}).count(), 1);
        test.equal(insecureCollection.findOne({world: test.runId()}).foo, 'bar');
      }
    ]);

    testAsyncMulti("collection - locked down", [
      function (test, expect) {
        lockedDownCollection.callClearMethod(test.runId(), expect(function() {
          test.equal(lockedDownCollection.find({world: test.runId()}).count(), 0);
        }));
      },
      function (test, expect) {
        lockedDownCollection.insert({world: test.runId(), foo: 'bar'}, expect(function (err, res) {
          test.equal(err.error, 403);
          test.equal(lockedDownCollection.find({world: test.runId()}).count(), 0);
        }));
      }
    ]);

    (function () {
      var collection = restrictedCollectionForUpdateOptionsTest;
      var id1;
      testAsyncMulti("collection - update options", [
        // init
        function (test, expect) {
          collection.callClearMethod(test.runId(), expect(function () {
            test.equal(collection.find({world: test.runId()}).count(), 0);
          }));
        },
        // put a few objects
        function (test, expect) {
          var doc = {canInsert: true, canUpdate: true, world: test.runId()};
          id1 = collection.insert(doc);
          collection.insert(doc);
          collection.insert(doc);
          collection.insert(doc, expect(function (err, res) {
            test.isFalse(err);
            test.equal(collection.find({world: test.runId()}).count(), 4);
          }));
        },
        // update by id
        function (test, expect) {
          collection.update(
            id1,
            {$set: {updated: true}},
            expect(function (err, res) {
              test.isFalse(err);
              test.equal(collection.find({world: test.runId(), updated: true}).count(), 1);
            }));
        },
        // update without the `multi` option
        function (test, expect) {
          collection.update(
            {updated: {$exists: false}, world: test.runId()},
            {$set: {updated: true}},
            expect(function (err, res) {
              test.isFalse(err);
              test.equal(collection.find({world: test.runId(), updated: true}).count(), 2);
            }));
        },
        // update with the `multi` option
        function (test, expect) {
          collection.update(
            {world: test.runId()},
            {$set: {updated: true}},
            {multi: true},
            expect(function (err, res) {
              test.isFalse(err);
              test.equal(collection.find({world: test.runId(), updated: true}).count(), 4);
            }));
        }
      ]);
    }) ();

    _.each(
      [restrictedCollectionDefaultInsecure, restrictedCollectionDefaultSecure],
      function(collection) {
        testAsyncMulti("collection - " + collection._name, [
          // init
          function (test, expect) {
            collection.callClearMethod(test.runId(), expect(function () {
              test.equal(collection.find({world: test.runId()}).count(), 0);
            }));
          },

          // insert with no allows passing. request is denied.
          function (test, expect) {
            collection.insert(
              {world: test.runId()},
              expect(function (err, res) {
                test.equal(err.error, 403);
                test.equal(collection.find({world: test.runId()}).count(), 0);
              }));
          },
          // insert with one allow and one deny. denied.
          function (test, expect) {
            collection.insert(
              {world: test.runId(), canInsert: true, cantInsert: true},
              expect(function (err, res) {
                test.equal(err.error, 403);
                test.equal(collection.find({world: test.runId()}).count(), 0);
              }));
          },
          // insert with one allow and other deny. denied.
          function (test, expect) {
            collection.insert(
              {world: test.runId(), canInsert: true, cantInsert2: true},
              expect(function (err, res) {
                test.equal(err.error, 403);
                test.equal(collection.find({world: test.runId()}).count(), 0);
              }));
          },
          // insert one allow passes. allowed.
          function (test, expect) {
            collection.insert(
              {world: test.runId(), canInsert: true},
              expect(function (err, res) {
                test.isFalse(err);
                test.equal(collection.find({world: test.runId()}).count(), 1);
              }));
          },
          // insert other allow passes. allowed.
          // includes canUpdate for later.
          function (test, expect) {
            collection.insert(
              {world: test.runId(), canInsert2: true, canUpdate: true},
              expect(function (err, res) {
                test.isFalse(err);
                test.equal(collection.find({world: test.runId()}).count(), 2);
              }));
          },
          // yet a third insert executes. this one has canRemove and
          // cantRemove set for later.
          function (test, expect) {
            collection.insert(
              {canInsert: true, canRemove: true, cantRemove: true,
               world: test.runId()},
              expect(function (err, res) {
                test.isFalse(err);
                test.equal(collection.find({world: test.runId()}).count(), 3);
              }));
          },

          // can't update to a new object
          function (test, expect) {
            collection.update(
              {canUpdate:true, world: test.runId()},
              {newObject: 1},
              expect(function (err, res) {
                test.equal(err.error, 403);
                test.equal(collection.find({world:test.runId()}).count(), 3);
              }));
          },

          // updating dotted fields works as if we are changing their
          // top part
          function (test, expect) {
            collection.update(
              {world: test.runId(), canUpdate: true},
              {$set: {"dotted.field": 1}},
              expect(function (err, res) {
                test.isFalse(err);
                test.equal(collection.find({world: test.runId(), canUpdate: true}).count(), 1);
                test.equal(collection.findOne({world: test.runId(), canUpdate: true}).dotted.field, 1);
              }));
          },
          function (test, expect) {
            collection.update(
              {world: test.runId(), canUpdate: true},
              {$set: {"verySecret.field": 1}},
              expect(function (err, res) {
                test.equal(err.error, 403);
                test.equal(collection.find({verySecret: {$exists: true}}).count(), 0);
              }));
          },

          // update doesn't do anything if no docs match
          function (test, expect) {
            collection.update(
              {world: test.runId(), doesntExist: true},
              {$set: {updated: true}},
              expect(function (err, res) {
                test.isFalse(err);
                // nothing has changed
                test.equal(collection.find({world: test.runId()}).count(), 3);
                test.equal(collection.find({world: test.runId(), updated: true}).count(), 0);
              }));
          },
          // update fails when access is denied trying to set `verySecret`
          function (test, expect) {
            collection.update(
              {world: test.runId(), canUpdate: true},
              {$set: {verySecret: true}},
              expect(function (err, res) {
                test.equal(err.error, 403);
                // nothing has changed
                test.equal(collection.find({world: test.runId()}).count(), 3);
                test.equal(collection.find({world: test.runId(), updated: true}).count(), 0);
              }));
          },
          // update fails when trying to set two fields, one of which is
          // `verySecret`
          function (test, expect) {
            collection.update(
              {world: test.runId(), canUpdate: true},
              {$set: {updated: true, verySecret: true}},
              expect(function (err, res) {
                test.equal(err.error, 403);
                // nothing has changed
                test.equal(collection.find({world: test.runId()}).count(), 3);
                test.equal(collection.find({world: test.runId(), updated: true}).count(), 0);
              }));
          },
          // update fails when trying to modify docs that don't
          // have `canUpdate` set
          function (test, expect) {
            collection.update(
              {world: test.runId(), canRemove: true},
              {$set: {updated: true}},
              expect(function (err, res) {
                test.equal(err.error, 403);
                // nothing has changed
                test.equal(collection.find({world: test.runId()}).count(), 3);
                test.equal(collection.find({world: test.runId(), updated: true}).count(), 0);
              }));
          },
          // update executes when it should
          function (test, expect) {
            collection.update(
              {world: test.runId(), canUpdate: true},
              {$set: {updated: true}},
              expect(function (err, res) {
                test.isFalse(err);
                test.equal(collection.find({world: test.runId(), updated: true}).count(), 1);
              }));
          },

          // remove fails when trying to modify an doc with no
          // `canRemove` set
          function (test, expect) {
            collection.remove({world: test.runId(), canUpdate: true},
                              expect(function (err, res) {
              test.equal(err.error, 403);
              // nothing has changed
              test.equal(collection.find({world: test.runId()}).count(), 3);
            }));
          },
          // remove fails when trying to modify an doc with `cantRemove`
          // set
          function (test, expect) {
            collection.remove({world: test.runId(), canRemove: true},
                              expect(function (err, res) {
              test.equal(err.error, 403);
              // nothing has changed
              test.equal(collection.find({world: test.runId()}).count(), 3);
            }));
          },

          // update the doc to remove cantRemove.
          function (test, expect) {
            collection.update(
              {world: test.runId(), canRemove: true},
              {$set: {cantRemove: false, canUpdate2: true}},
              expect(function (err, res) {
                test.isFalse(err);
                test.equal(collection.find({world: test.runId(), cantRemove: true}).count(), 0);
              }));
          },

          // now remove can remove it.
          function (test, expect) {
            collection.remove({world: test.runId(), canRemove: true},
                              expect(function (err, res) {
              test.isFalse(err);
              // successfully removed
              test.equal(collection.find({world: test.runId()}).count(), 2);
            }));
          },

          // methods can still bypass restrictions
          function (test, expect) {
            collection.callClearMethod(
              test.runId(), expect(function (err, res) {
                test.isFalse(err);
                // successfully removed
                test.equal(collection.find({world: test.runId()}).count(), 0);
            }));
          }
        ]);
      });
  }
}) ();
