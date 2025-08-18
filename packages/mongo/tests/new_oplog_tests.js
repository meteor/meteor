import { oplogOptionsTest } from "./oplog_tests.js";

process.env.MONGO_OPLOG_URL &&
  Tinytest.addAsync(
    "mongo-livedata - newOplog - oplogIncludeCollections",
    async (test) => {
      const collectionNameA = "oplog-a-" + Random.id();
      const collectionNameB = "oplog-b-" + Random.id();
      const mongoPackageSettings = {
        oplogIncludeCollections: [collectionNameB],
        useNewOplogTailing: true,
      };
      await oplogOptionsTest({
        test,
        includeCollectionName: collectionNameB,
        excludeCollectionName: collectionNameA,
        mongoPackageSettings,
      });
    }
  );

process.env.MONGO_OPLOG_URL &&
  Tinytest.addAsync(
    "mongo-livedata - newOplog - oplogExcludeCollections",
    async (test) => {
      const collectionNameA = "oplog-a-" + Random.id();
      const collectionNameB = "oplog-b-" + Random.id();
      const mongoPackageSettings = {
        oplogExcludeCollections: [collectionNameB],
        useNewOplogTailing: true,
      };
      await oplogOptionsTest({
        test,
        includeCollectionName: collectionNameA,
        excludeCollectionName: collectionNameB,
        mongoPackageSettings,
      });
    }
  );

const withNewOplog = async (callback) => {
  const previousMongoPackageSettings = {
    ...(Meteor.settings?.packages?.mongo || {}),
  };
  Meteor.settings.packages.mongo = {
    ...previousMongoPackageSettings,
    useNewOplogTailing: true,
  };
  const defaultOplogHandle =
    MongoInternals.defaultRemoteCollectionDriver().mongo._oplogHandle;

  try {
    const myOplogHandle = new MongoInternals.NewOplogHandle(
      process.env.MONGO_OPLOG_URL,
      "meteor"
    );
    await myOplogHandle._startTrailingPromise;
    MongoInternals.defaultRemoteCollectionDriver().mongo._setOplogHandle(
      myOplogHandle
    );

    return await callback();
  } finally {
    Meteor.settings.packages.mongo = previousMongoPackageSettings;
    MongoInternals.defaultRemoteCollectionDriver().mongo._setOplogHandle(
      defaultOplogHandle
    );
  }
};

Tinytest.addAsync(
  "mongo-livedata - newOplog - unordered - basics",
  async function (test, onComplete) {
    await withNewOplog(async () => {
      const c = new Mongo.Collection(Random.id());
      await withCallbackLogger(
        test,
        ["added", "changed", "removed"],
        Meteor.isServer,
        async function (logger) {
          const handle = await c.find().observeChanges(logger);
          const barid = await c.insertAsync({ thing: "stuff" });
          await logger.expectResultOnly("added", [barid, { thing: "stuff" }]);

          let fooid = await c.insertAsync({
            noodles: "good",
            bacon: "bad",
            apples: "ok",
          });

          await logger.expectResultOnly("added", [
            fooid,
            { noodles: "good", bacon: "bad", apples: "ok" },
          ]);

          await c.updateAsync(fooid, {
            noodles: "alright",
            potatoes: "tasty",
            apples: "ok",
          });
          await c.updateAsync(fooid, {
            noodles: "alright",
            potatoes: "tasty",
            apples: "ok",
          });
          await logger.expectResultOnly("changed", [
            fooid,
            { noodles: "alright", potatoes: "tasty", bacon: undefined },
          ]);
          await c.removeAsync(fooid);
          await logger.expectResultOnly("removed", [fooid]);
          await c.removeAsync(barid);
          await logger.expectResultOnly("removed", [barid]);

          fooid = await c.insertAsync({
            noodles: "good",
            bacon: "bad",
            apples: "ok",
          });

          await logger.expectResult("added", [
            fooid,
            { noodles: "good", bacon: "bad", apples: "ok" },
          ]);
          await logger.expectNoResult();
          handle.stop();
          onComplete();
        }
      );
    });
  }
);

Tinytest.addAsync(
  "mongo-livedata - newOplog - dedicatedChannel",
  async function (test, onComplete) {
    await withNewOplog(async () => {
      const c = new Mongo.Collection(Random.id());
      await withCallbackLogger(
        test,
        ["added", "changed", "removed"],
        Meteor.isServer,
        async function (logger) {
          const observedId = Random.id();

          const handle = await c.find({ _id: observedId }).observeChanges(logger);
          const nonObeservedId = await c.insertAsync({ thing: "uselessStuff" });
          await logger.expectNoResult();
          await c.insertAsync({ _id: observedId, thing: "importantStuff" });
          await logger.expectResultOnly("added", [
            observedId,
            { thing: "importantStuff" },
          ]);
          await c.updateAsync(nonObeservedId, {
            $set: { thing: "updatedUselessStuff" },
          });
          await logger.expectNoResult();
          await c.updateAsync(observedId, {
            $set: { thing: "updatedImportantStuff" },
          });
          await logger.expectResultOnly("changed", [
            observedId,
            { thing: "updatedImportantStuff" },
          ]);
          await c.removeAsync(nonObeservedId);
          await logger.expectNoResult();
          await c.removeAsync(observedId);
          await logger.expectResultOnly("removed", [observedId]);
          handle.stop();
          onComplete();
        }
      );
    });
  }
);
Tinytest.addAsync(
  "mongo-livedata - newOplog - default",
  async function (test, onComplete) {
    await withNewOplog(async () => {
      const c = new Mongo.Collection(Random.id());
      await withCallbackLogger(
        test,
        ["added", "changed", "removed"],
        Meteor.isServer,
        async function (logger) {
          const observedId = Random.id();

          const handle = await c
            .find({ type: "important" })
            .observeChanges(logger);
          const nonObeservedId = await c.insertAsync({
            name: "test1",
            type: "useless",
          });
          await logger.expectNoResult();
          await c.insertAsync({
            _id: observedId,
            name: "test2",
            type: "important",
          });
          await logger.expectResultOnly("added", [
            observedId,
            { name: "test2", type: "important" },
          ]);
          await c.updateAsync(nonObeservedId, {
            $set: { type: "still-useless" },
          });
          await logger.expectNoResult();
          await c.updateAsync(nonObeservedId, { $set: { type: "important" } });
          await logger.expectResultOnly("added", [
            nonObeservedId,
            { name: "test1", type: "important" },
          ]);
          await c.updateAsync(observedId, { $set: { name: "test2-updated" } });
          await logger.expectResultOnly("changed", [
            observedId,
            { name: "test2-updated" },
          ]);
          await c.updateAsync(nonObeservedId, { $set: { type: "useless" } });
          await logger.expectResultOnly("removed", [nonObeservedId]);
          await c.removeAsync(nonObeservedId);
          await logger.expectNoResult();
          await c.removeAsync(observedId);
          await logger.expectResultOnly("removed", [observedId]);
          handle.stop();
          onComplete();
        }
      );
    });
  }
);
Tinytest.addAsync(
  "mongo-livedata - newOplog - limit",
  async function (test, onComplete) {
    await withNewOplog(async () => {
      const c = new Mongo.Collection(Random.id());
      await withCallbackLogger(
        test,
        ["added", "changed", "removed"],
        Meteor.isServer,
        async function (logger) {
          const handle = await c
            .find({ type: "important" }, { sort: { name: 1 }, limit:3 })
            .observeChanges(logger);
          const test1Id = await c.insertAsync({
            name: "test1",
            type: "useless",
          });

          await logger.expectNoResult();
          const test2Id = await c.insertAsync({
            name: "test2",
            type: "important",
          });
          await logger.expectResultOnly("added", [
            test2Id,
            { name: "test2", type: "important" },
          ]);
          await c.updateAsync(test1Id, {
            $set: { type: "still-useless" },
          });
          await logger.expectNoResult();
          await c.updateAsync(test1Id, { $set: { type: "important" } });
          await logger.expectResultOnly("added", [
            test1Id,
            { name: "test1", type: "important" },
          ]);
          await c.updateAsync(test2Id, { $set: { name: "test2-updated" } });
          await logger.expectResultOnly("changed", [
            test2Id,
            { name: "test2-updated" },
          ]);
          const test3Id = await c.insertAsync({
            name: "test3",
            type: "important",
          });
          await logger.expectResultOnly("added", [
            test3Id,
            { name: "test3", type: "important" },
          ]);
          const test4Id = await c.insertAsync({
            name: "test4",
            type: "important",
          });
          await logger.expectNoResult();
          await c.updateAsync(test4Id, { $set: { name: "test0" } });
          await logger.expectResult("removed", [test3Id]);
          await logger.expectResult("added", [
            test4Id,
            { name: "test0", type: "important" },
          ]);
          await c.updateAsync(test1Id, { $set: { type: "useless" } });
          await logger.expectResult("removed", [test1Id]);
          await logger.expectResult("added", [test3Id, {name: "test3", type: "important"}]);
          await c.removeAsync(test1Id);
          await logger.expectNoResult();
          await c.removeAsync(test2Id);
          await logger.expectResultOnly("removed", [test2Id]);
          handle.stop();
          onComplete();
        }
      );
    });
  }
);
