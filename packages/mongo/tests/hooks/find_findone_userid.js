import { Meteor } from "meteor/meteor";
import { Mongo, CollectionHooks } from "meteor/mongo";
import { Tinytest } from "meteor/tinytest";
import { InsecureLogin } from "./insecure_login";

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
let publishContext = null;

function resetHookState() {
  beforeFindUserId = null;
  afterFindUserId = null;
  beforeFindOneUserId = null;
  afterFindOneUserId = null;
  beforeFindWithinPublish = false;
  afterFindWithinPublish = false;
  beforeFindOneWithinPublish = false;
  afterFindOneWithinPublish = false;
  publishContext = null;
}

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
  const runWithinPublishContext = async function (context) {
    resetHookState();
    publishContext = context;

    await DDP._CurrentPublicationInvocation.withValue(context, async function () {
      await collection.find({}, { test: 1 }).fetchAsync();
      await collection.findOneAsync({}, { test: 1 });
    });
  };

  Tinytest.add(
    "general - isWithinPublish is false outside of publish function",
    function(test) {
      test.equal(CollectionHooks.isWithinPublish(), false);
    }
  );

  Tinytest.addAsync(
    "general - this (context) preserved in publish functions",
    async function(test) {
      const context = { userId: "publish-test-user" };
      await runWithinPublishContext(context);
      test.equal(publishContext, context);
      test.equal(publishContext.userId, "publish-test-user");
      resetHookState();
    }
  );

  Tinytest.addAsync(
    "find - userId available to before find hook when within publish context",
    async function(test) {
      const context = { userId: "publish-test-user" };
      await runWithinPublishContext(context);
      test.equal(beforeFindUserId, "publish-test-user");
      test.equal(beforeFindWithinPublish, true);
      resetHookState();
    }
  );

  Tinytest.addAsync(
    "find - userId available to after find hook when within publish context",
    async function(test) {
      const context = { userId: "publish-test-user" };
      await runWithinPublishContext(context);
      test.equal(afterFindUserId, "publish-test-user");
      test.equal(afterFindWithinPublish, true);
      resetHookState();
    }
  );

  Tinytest.addAsync(
    "findone - userId available to before findOne hook when within publish context",
    async function(test) {
      const context = { userId: "publish-test-user" };
      await runWithinPublishContext(context);
      test.equal(beforeFindOneUserId, "publish-test-user");
      test.equal(beforeFindOneWithinPublish, true);
      resetHookState();
    }
  );

  Tinytest.addAsync(
    "findone - userId available to after findOne hook when within publish context",
    async function(test) {
      const context = { userId: "publish-test-user" };
      await runWithinPublishContext(context);
      test.equal(afterFindOneUserId, "publish-test-user");
      test.equal(afterFindOneWithinPublish, true);
      resetHookState();
    }
  );

  Meteor.publish("test_publish_for_find_findone_userid", async function() {
    await runWithinPublishContext(this);
    this.ready();
  });
}

if (Meteor.isClient) {
  Tinytest.addAsync(
    "find - userId available to before find hook",
    async function(test) {
      await InsecureLogin.ready(async function() {
        resetHookState();
        await collection.find({}, { test: 1 }).fetchAsync();
      });
      test.notEqual(beforeFindUserId, null);
      resetHookState();
    }
  );

  Tinytest.addAsync(
    "find - userId available to after find hook",
    async function(test) {
      await InsecureLogin.ready(async function() {
        resetHookState();
        await collection.find({}, { test: 1 }).fetchAsync();
      });
      test.notEqual(afterFindUserId, null);
      resetHookState();
    }
  );

  Tinytest.addAsync(
    "findone - userId available to before findOne hook",
    async function(test) {
      await InsecureLogin.ready(async function() {
        resetHookState();
        await collection.findOneAsync({}, { test: 1 });
      });
      test.notEqual(beforeFindOneUserId, null);
      resetHookState();
    }
  );

  Tinytest.addAsync(
    "findone - userId available to after findOne hook",
    async function(test) {
      await InsecureLogin.ready(async function() {
        resetHookState();
        await collection.findOneAsync({}, { test: 1 });
      });
      test.notEqual(afterFindOneUserId, null);
      resetHookState();
    }
  );
}
