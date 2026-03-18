import { Meteor } from "meteor/meteor";
import { Mongo } from "meteor/mongo";
import { Tinytest } from "meteor/tinytest";
import { InsecureLogin } from "./insecure_login";
import { CollectionHooks } from "meteor/mongo";

const collection = new Mongo.Collection(
  "test_collection_for_find_findone_userid"
);

let beforeFindUserId;
let afterFindUserId;
let beforeFindOneUserId;
let afterFindOneUserId;
let beforeFindWithinPublish;
let afterFindWithinPublish;
let beforeFindOneWithinPublish;
let afterFindOneWithinPublish;
let serverCleanup;

// Don't declare hooks in publish method, as it is problematic
// eslint-disable-next-line array-callback-return
collection.before.find(function(userId, selector, options) {
  if (options && options.test) {
    // ignore other calls to find (caused by insert/update)
    beforeFindUserId = userId;

    if (CollectionHooks.isWithinPublish) {
      beforeFindWithinPublish = CollectionHooks.isWithinPublish();
    }
  }
});

// eslint-disable-next-line array-callback-return
collection.after.find(function(userId, selector, options, result) {
  if (options && options.test) {
    // ignore other calls to find (caused by insert/update)
    afterFindUserId = userId;

    if (CollectionHooks.isWithinPublish) {
      afterFindWithinPublish = CollectionHooks.isWithinPublish();
    }
  }
});

collection.before.findOne(function(userId, selector, options) {
  if (options && options.test) {
    // ignore other calls to find (caused by insert/update)
    beforeFindOneUserId = userId;

    if (CollectionHooks.isWithinPublish) {
      beforeFindOneWithinPublish = CollectionHooks.isWithinPublish();
    }
  }
});

collection.after.findOne(function(userId, selector, options, result) {
  if (options && options.test) {
    // ignore other calls to find (caused by insert/update)
    afterFindOneUserId = userId;

    if (CollectionHooks.isWithinPublish) {
      afterFindOneWithinPublish = CollectionHooks.isWithinPublish();
    }
  }
});

if (Meteor.isServer) {
  let serverTestsAdded = false;
  let publishContext = null;

  serverCleanup = () => {
    beforeFindOneUserId = null;
    afterFindOneUserId = null;
    beforeFindOneWithinPublish = false;
    afterFindOneWithinPublish = false;
    publishContext = null;
  };

  Tinytest.add(
    "general - isWithinPublish is false outside of publish function",
    function(test) {
      test.equal(CollectionHooks.isWithinPublish(), false);
    }
  );

  Meteor.publish("test_publish_for_find_findone_userid", async function() {
    // Reset test values on each connection
    publishContext = null;

    beforeFindUserId = null;
    afterFindUserId = null;
    beforeFindOneUserId = null;
    afterFindOneUserId = null;

    beforeFindWithinPublish = false;
    afterFindWithinPublish = false;
    beforeFindOneWithinPublish = false;
    afterFindOneWithinPublish = false;

    // Check publish context
    publishContext = this;

    // Trigger hooks
    await collection.findOneAsync({}, { test: 1 });
    await collection.findOneAsync({}, { test: 1 });

    if (!serverTestsAdded) {
      serverTestsAdded = true;

      // Our hook system should preserve the value of 'this'.
      Tinytest.add(
        "general - this (context) preserved in publish functions",
        function(test) {
          test.isTrue(publishContext && publishContext.userId);
        }
      );

      Tinytest.add(
        "find - userId available to before find hook when within publish context",
        function(test) {
          test.notEqual(beforeFindUserId, null);
          test.equal(beforeFindWithinPublish, true);
        }
      );

      Tinytest.add(
        "find - userId available to after find hook when within publish context",
        function(test) {
          test.notEqual(afterFindUserId, null);
          test.equal(afterFindWithinPublish, true);
        }
      );

      Tinytest.add(
        "findone - userId available to before findOne hook when within publish context",
        function(test) {
          test.notEqual(beforeFindOneUserId, null);
          test.equal(beforeFindOneWithinPublish, true);
          serverCleanup();
        }
      );

      Tinytest.add(
        "findone - userId available to after findOne hook when within publish context",
        function(test) {
          test.notEqual(afterFindOneUserId, null);
          test.equal(afterFindOneWithinPublish, true);
          serverCleanup();
        }
      );
    }
  });
}

if (Meteor.isClient) {
  const cleanup = () => {
    beforeFindUserId = null;
    afterFindUserId = null;
    beforeFindOneUserId = null;
    afterFindOneUserId = null;
  };

  const withLogin = testFunc => {
    return function(...args) {
      const wrapper = cb => {
        InsecureLogin.ready(() => {
          cleanup();
          try {
            const result = testFunc.apply(this, args);
            cb(null, result);
          } catch (error) {
            cb(error);
          } finally {
            cleanup();
          }
        });
      };

      return Meteor.wrapAsync(wrapper)();
    };
  };

  Tinytest.add(
    "find - userId available to before find hook",
    withLogin(function(test) {
      collection.find({}, { test: 1 });
      test.notEqual(beforeFindUserId, null);
    })
  );

  Tinytest.add(
    "find - userId available to after find hook",
    withLogin(function(test) {
      collection.find({}, { test: 1 });
      test.notEqual(afterFindUserId, null);
    })
  );

  Tinytest.add(
    "findone - userId available to before findOne hook",
    withLogin(function(test) {
      collection.findOne({}, { test: 1 });
      test.notEqual(beforeFindOneUserId, null);
    })
  );

  Tinytest.add(
    "findone - userId available to after findOne hook",
    withLogin(function(test) {
      collection.findOne({}, { test: 1 });
      test.notEqual(afterFindOneUserId, null);
    })
  );

  InsecureLogin.ready(function() {
    // Run server tests
    Meteor.subscribe("test_publish_for_find_findone_userid");
  });
}
