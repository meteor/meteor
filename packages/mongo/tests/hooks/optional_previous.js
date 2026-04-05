import { Meteor } from "meteor/meteor";
import { Mongo, CollectionHooks } from "meteor/mongo";
import { Tinytest } from "meteor/tinytest";

Tinytest.addAsync(
  "optional-previous - update hook should not prefetch previous, via hook option param",
  async function(test) {
    const collection = new Mongo.Collection(null);

    let called = false;
    collection.after.update(
      function(userId, doc, fieldNames, modifier, options) {
        if (doc && doc._id === "test") {
          test.equal(!!this.previous, false);
          called = true;
        }
      },
      { fetchPrevious: false }
    );

    await collection.insertAsync({ _id: "test", test: 1 });
    await collection.updateAsync({ _id: "test" }, { $set: { test: 1 } });

    test.equal(called, true);
  }
);

Tinytest.addAsync(
  "optional-previous - update hook should not prefetch previous, via collection option param",
  async function(test) {
    const collection = new Mongo.Collection(null);

    collection.hookOptions.after.update = { fetchPrevious: false };

    let called = false;
    collection.after.update(function(
      userId,
      doc,
      fieldNames,
      modifier,
      options
    ) {
      if (doc && doc._id === "test") {
        test.equal(!!this.previous, false);
        called = true;
      }
    });

    await collection.insertAsync({ _id: "test", test: 1 });
    await collection.updateAsync({ _id: "test" }, { $set: { test: 1 } });

    test.equal(called, true);
  }
);

Tinytest.addAsync(
  "optional-previous - hook option can override collection defaults",
  async function(test) {
    const collection = new Mongo.Collection(null);

    collection.hookOptions.after.update = { fetchPrevious: false };

    let called = false;
    collection.after.update(
      function(userId, doc) {
        if (doc && doc._id === "test") {
          test.equal(!!this.previous, true);
          test.equal(this.previous.test, 1);
          called = true;
        }
      },
      { fetchPrevious: true }
    );

    await collection.insertAsync({ _id: "test", test: 1 });
    await collection.updateAsync({ _id: "test" }, { $set: { test: 2 } });

    test.equal(called, true);
  }
);

if (Meteor.isServer) {
  Tinytest.add(
    "optional-previous - update hook should not prefetch previous, via defaults param variation 1: after.update",
    function(test) {
      const collection = new Mongo.Collection(null);

      CollectionHooks.defaults.after.update = { fetchPrevious: false };

      collection.after.update(function(
        userId,
        doc,
        fieldNames,
        modifier,
        options
      ) {
        if (options && options.test) {
          test.equal(!!this.previous, false);
        }
      });

      CollectionHooks.defaults.after.update = {};

      collection.insert({ _id: "test", test: 1 });
      collection.update({ _id: "test" }, { $set: { test: 1 } }, { test: true });
    }
  );

  Tinytest.add(
    "optional-previous - update hook should not prefetch previous, via defaults param variation 2: after.all",
    function(test) {
      const collection = new Mongo.Collection(null);

      CollectionHooks.defaults.after.all = { fetchPrevious: false };

      collection.after.update(function(
        userId,
        doc,
        fieldNames,
        modifier,
        options
      ) {
        if (options && options.test) {
          test.equal(!!this.previous, false);
        }
      });

      CollectionHooks.defaults.after.all = {};

      collection.insert({ _id: "test", test: 1 });
      collection.update({ _id: "test" }, { $set: { test: 1 } }, { test: true });
    }
  );

  Tinytest.add(
    "optional-previous - update hook should not prefetch previous, via defaults param variation 3: all.update",
    function(test) {
      const collection = new Mongo.Collection(null);

      CollectionHooks.defaults.all.update = { fetchPrevious: false };

      collection.after.update(function(
        userId,
        doc,
        fieldNames,
        modifier,
        options
      ) {
        if (options && options.test) {
          test.equal(!!this.previous, false);
        }
      });

      CollectionHooks.defaults.all.update = {};

      collection.insert({ _id: "test", test: 1 });
      collection.update({ _id: "test" }, { $set: { test: 1 } }, { test: true });
    }
  );

  Tinytest.add(
    "optional-previous - update hook should not prefetch previous, via defaults param variation 4: all.all",
    function(test) {
      const collection = new Mongo.Collection(null);

      CollectionHooks.defaults.all.all = { fetchPrevious: false };

      collection.after.update(function(
        userId,
        doc,
        fieldNames,
        modifier,
        options
      ) {
        if (options && options.test) {
          test.equal(!!this.previous, false);
        }
      });

      CollectionHooks.defaults.all.all = {};

      collection.insert({ _id: "test", test: 1 });
      collection.update({ _id: "test" }, { $set: { test: 1 } }, { test: true });
    }
  );
}
