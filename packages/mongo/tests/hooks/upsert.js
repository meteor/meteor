import { Meteor } from "meteor/meteor";
import { Mongo } from "meteor/mongo";
import { Tinytest } from "meteor/tinytest";
import { InsecureLogin } from "./insecure_login";

Tinytest.addAsync(
  "upsert - hooks should all fire the appropriate number of times",
  async function(test) {
    const collection = new Mongo.Collection(null);
    const counts = {
      before: {
        insert: 0,
        update: 0,
        remove: 0,
        upsert: 0
      },
      after: {
        insert: 0,
        update: 0,
        remove: 0
      }
    };

    collection.before.insert(function() {
      counts.before.insert++;
    });
    collection.before.update(function() {
      counts.before.update++;
    });
    collection.before.remove(function() {
      counts.before.remove++;
    });
    collection.before.upsert(function() {
      counts.before.upsert++;
    });

    collection.after.insert(function() {
      counts.after.insert++;
    });
    collection.after.update(function() {
      counts.after.update++;
    });
    collection.after.remove(function() {
      counts.after.remove++;
    });

    await InsecureLogin.ready(async function() {
      await collection.removeAsync({ test: true });
      const obj = await collection.upsertAsync(
        { test: true },
        { test: true, step: "insert" }
      );

      await collection.upsertAsync(obj.insertedId, {
        test: true,
        step: "update"
      });
      test.equal(counts.before.insert, 0, "before.insert should be 0");
      test.equal(counts.before.update, 0, "before.update should be 0");
      test.equal(counts.before.remove, 0, "before.remove should be 0");
      test.equal(counts.before.upsert, 2, "before.upsert should be 2");
      test.equal(counts.after.insert, 1, "after.insert should be 1");
      test.equal(counts.after.update, 1, "after.update should be 1");
      test.equal(counts.after.remove, 0, "after.remove should be 0");
    });
  }
);

if (Meteor.isServer) {
  Tinytest.addAsync(
    "upsert - hooks should all fire the appropriate number of times in a synchronous environment",
    async function(test) {
      const collection = new Mongo.Collection(null);
      const counts = {
        before: {
          insert: 0,
          update: 0,
          remove: 0,
          upsert: 0
        },
        after: {
          insert: 0,
          update: 0,
          remove: 0
        }
      };

      collection.before.insert(function() {
        counts.before.insert++;
      });
      collection.before.update(function() {
        counts.before.update++;
      });
      collection.before.remove(function() {
        counts.before.remove++;
      });
      collection.before.upsert(function() {
        counts.before.upsert++;
      });

      collection.after.insert(function() {
        counts.after.insert++;
      });
      collection.after.update(function() {
        counts.after.update++;
      });
      collection.after.remove(function() {
        counts.after.remove++;
      });

      await collection.removeAsync({ test: true });
      const obj = await collection.upsertAsync(
        { test: true },
        { test: true, step: "insert" }
      );
      await collection.upsertAsync(obj.insertedId, {
        test: true,
        step: "update"
      });

      test.equal(counts.before.insert, 0, "before.insert should be 0");
      test.equal(counts.before.update, 0, "before.update should be 0");
      test.equal(counts.before.remove, 0, "before.remove should be 0");
      test.equal(counts.before.upsert, 2, "before.upsert should be 2");
      test.equal(counts.after.insert, 1, "after.insert should be 1");
      test.equal(counts.after.update, 1, "after.update should be 1");
      test.equal(counts.after.remove, 0, "after.remove should be 0");
    }
  );
}

Tinytest.addAsync("upsert before.upsert can stop the execution", async function(
  test
) {
  const collection = new Mongo.Collection(null);

  collection.before.upsert(async () => false);

  await collection.removeAsync({ test: true });
  await collection.upsertAsync({ test: true }, { $set: { test: true } });

  test.isUndefined(
    await collection.findOneAsync({ test: true }),
    "doc should not exist"
  );
});

Tinytest.addAsync(
  "upsert after.update should have a correct prev-doc",
  async function(test) {
    const collection = new Mongo.Collection(null);

    collection.after.update(function(userId, doc) {
      test.isNotUndefined(
        this.previous,
        "this.previous should not be undefined"
      );
      test.equal(
        this.previous.step,
        "inserted",
        "previous doc should have a step property equal to inserted"
      );
      test.equal(
        doc.step,
        "updated",
        "doc should have a step property equal to updated"
      );
    });

    await collection.removeAsync({ test: true });
    await collection.insertAsync({ test: true, step: "inserted" });
    await collection.upsertAsync(
      { test: true },
      { $set: { test: true, step: "updated" } }
    );
  }
);

Tinytest.addAsync(
  "upsert after.update should have the list of manipulated fields",
  async function(test) {
    const collection = new Mongo.Collection(null);

    collection.after.update(function(userId, doc, fields) {
      test.equal(fields, ["step"]);
    });

    await collection.removeAsync({ test: true });
    await collection.insertAsync({ test: true, step: "inserted" });
    await collection.upsertAsync({ test: true }, { $set: { step: "updated" } });
  }
);

Tinytest.addAsync(
  "upsert after.update should derive fields from all Mongo modifiers",
  async function(test) {
    const collection = new Mongo.Collection(null);

    collection.after.update(function(userId, doc, fields) {
      test.equal(fields, ["count"]);
    });

    await collection.removeAsync({ test: true });
    await collection.insertAsync({ test: true, count: 2 });
    await collection.upsertAsync({ test: true }, { $mul: { count: 3 } });
  }
);

Tinytest.addAsync(
  "upsert after.update should respect fetch fields",
  async function(test) {
    const collection = new Mongo.Collection(null);

    collection.after.update(
      function(userId, doc) {
        test.equal(doc.visible, "after");
        test.isUndefined(doc.hidden);
        test.equal(this.previous.visible, "before");
        test.isUndefined(this.previous.hidden);
      },
      { fetchPrevious: true, fetchFields: { visible: 1 } }
    );

    await collection.removeAsync({ test: true });
    await collection.insertAsync({
      test: true,
      visible: "before",
      hidden: "secret"
    });
    await collection.upsertAsync(
      { test: true },
      { $set: { visible: "after", hidden: "updated-secret" } }
    );
  }
);

Tinytest.addAsync(
  "upsert after.update should respect fetch fields excluding _id",
  async function(test) {
    const collection = new Mongo.Collection(null);
    let called = false;

    collection.after.update(
      function(userId, doc) {
        called = true;
        test.equal(doc.visible, "after");
        test.isUndefined(doc.hidden);
        test.equal(this.previous.visible, "before");
        test.isUndefined(this.previous.hidden);
      },
      { fetchPrevious: true, fetchFields: { _id: 0, visible: 1 } }
    );

    await collection.removeAsync({ test: true });
    await collection.insertAsync({
      test: true,
      visible: "before",
      hidden: "secret"
    });
    await collection.upsertAsync(
      { test: true },
      { $set: { visible: "after", hidden: "updated-secret" } }
    );

    test.equal(called, true);
  }
);

Tinytest.addAsync(
  "issue #156 - upsert after.insert should have a correct doc using $set",
  async function(test) {
    const collection = new Mongo.Collection(null);

    collection.after.insert(function(userId, doc) {
      test.isNotUndefined(doc, "doc should not be undefined");
      test.isNotUndefined(doc._id, "doc should have an _id property");
      test.isNotUndefined(doc.test, "doc should have a test property");
      test.equal(
        doc.step,
        "insert-async",
        "doc should have a step property equal to insert-async"
      );
    });

    await collection.removeAsync({ test: true });
    await collection.upsertAsync(
      { test: true },
      { $set: { test: true, step: "insert-async" } }
    );
  }
);

if (Meteor.isClient) {
  const collectionForSync = new Mongo.Collection(null);
  Tinytest.add("upsert - hooks are not called for sync methods", function(
    test
  ) {
    let beforeCalled = false;
    collectionForSync.before.upsert(function(userId, selector, options) {
      beforeCalled = true;
    });

    const result = collectionForSync.upsert(
      { test: 1 },
      {
        $set: { name: "abc" }
      }
    );

    test.equal(result.numberAffected, 1);

    test.equal(beforeCalled, false);
  });
}
