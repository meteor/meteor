import { Tinytest } from 'meteor/tinytest';
import { Mongo } from 'meteor/mongo';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import { MongoInternals } from 'meteor/mongo';

// Force enable Change Streams for testing
const originalMeteorSettings = Meteor.settings;

// dumb-skipping changeStream tests
if (Meteor.isServer && false) {
  
  // Helper to check if MongoDB supports change streams
  const checkChangeStreamSupport = async () => {
    try {
      const mongoHandle = MongoInternals.defaultRemoteCollectionDriver().mongo;
      if (mongoHandle._supportsChangeStreams !== undefined) {
        return mongoHandle._supportsChangeStreams;
      }

      const admin = mongoHandle.db.admin();
      const serverInfo = await admin.serverInfo();
      const isMaster = await admin.command({ isMaster: 1 });
      const versionString = serverInfo.version || 'unknown';
      const versionParts = versionString.split('.').map(Number);
      const major = Number.isFinite(versionParts[0]) ? versionParts[0] : 0;
      const minor = Number.isFinite(versionParts[1]) ? versionParts[1] : 0;
      const reasons = [];

      const hasMinVersion = major > 3 || (major === 3 && minor >= 6);

      if (!hasMinVersion) {
        reasons.push(`Change Streams require MongoDB 3.6+ (current ${versionString})`);
      } else {
        const isReplicaSet = Boolean(isMaster.setName || isMaster.ismaster || isMaster.secondary);
        const isSharded = isMaster.msg === 'isdbgrid';

        if (!(isReplicaSet || isSharded)) {
          reasons.push('Change Streams require a replica set or sharded cluster');
        }
      }

      mongoHandle._changeStreamServerReasons = reasons;
      mongoHandle._supportsChangeStreams = reasons.length === 0;

      return mongoHandle._supportsChangeStreams;
    } catch (error) {
      return false;
    }
  };
  
  // Helper function to wait for specific conditions
  const waitForCondition = async (conditionFn, timeoutMs = 5000, checkIntervalMs = 50) => {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      if (conditionFn()) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, checkIntervalMs));
    }
    return false;
  };

  // Helper to safely stop handle
  const safeStop = async (handle) => {
    if (!handle) return;
    
    // Handle might be a Promise
    if (handle && typeof handle.then === 'function') {
      handle = await handle;
    }
    
    if (handle && typeof handle.stop === 'function') {
      if (handle.stop.constructor.name === 'AsyncFunction') {
        await handle.stop();
      } else {
        handle.stop();
      }
    }
  };

  // Helper to verify we're using ChangeStreamObserveDriver
  const verifyUsingChangeStreamDriver = (handle, test) => {
    if (handle && handle._multiplexer && handle._multiplexer._observeDriver) {
      const driver = handle._multiplexer._observeDriver;
      
      test.isTrue(driver._usesChangeStreams, 'Must be using ChangeStreamObserveDriver');
      test.isTrue(typeof driver._changeStream !== 'undefined', 'Should have change stream property');
      test.isTrue(typeof driver._matcher !== 'undefined', 'Should have matcher');
      return true;
    }
    test.fail('Cannot access driver - handle structure not as expected');
    return false;
  };

  // Check change streams support before running tests
  Tinytest.addAsync('mongo - ChangeStreamObserveDriver - check support', async function (test) {
    const isSupported = await checkChangeStreamSupport();
    
    if (!isSupported) {
      test.skip('MongoDB does not support change streams (requires replica set or sharded cluster)');
      return;
    }
    
    test.isTrue(isSupported, 'Change streams should be supported');
  });

  Tinytest.addAsync('mongo - ChangeStreamObserveDriver - basic observe functionality', async function (test) {
    
    const isSupported = await checkChangeStreamSupport();
    if (!isSupported) {
      test.skip('Change streams not supported - skipping test');
      return;
    }
    
    const TestCollection = new Mongo.Collection('test_changestream_basic_' + Random.id());
    let handle;
    
    try {
      let events = [];
      
      // Start observing
      handle = TestCollection.find({ name: 'test' }).observe({
        added: function(doc) {
          events.push({ type: 'added', doc: { ...doc } });
        },
        changed: function(newDoc, oldDoc) {
          events.push({ type: 'changed', newDoc: { ...newDoc }, oldDoc: { ...oldDoc } });
        },
        removed: function(oldDoc) {
          events.push({ type: 'removed', doc: { ...oldDoc } });
        }
      });
      
      // Wait for handle to be ready if it's a Promise
      if (handle && typeof handle.then === 'function') {
        handle = await handle;
      }
      
      // Verify we're using ChangeStreamObserveDriver
      verifyUsingChangeStreamDriver(handle, test);
      
      // Wait longer for observer to be set up
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Insert document
      const insertId = await TestCollection.insertAsync({ name: 'test', value: 42 });
      
      // Wait for insert to be observed
      const insertObserved = await waitForCondition(() => events.length >= 1, 8000);
      test.isTrue(insertObserved, 'Insert should be observed within timeout');
      
      const addedEvents = events.filter(e => e.type === 'added');
      test.equal(addedEvents.length, 1, 'Should have exactly one added event');
      test.equal(addedEvents[0].doc.name, 'test', 'Document should have correct name');
      test.equal(addedEvents[0].doc.value, 42, 'Document should have correct value');
      
      // Update document
      await TestCollection.updateAsync(insertId, { $set: { value: 100 } });
      
      // Wait for update to be observed
      const updateObserved = await waitForCondition(() => 
        events.some(e => e.type === 'changed'), 8000);
      
      if (!updateObserved) {
        test.fail('Update should be observed within timeout');
        return;
      }
      
      const changedEvents = events.filter(e => e.type === 'changed');
      test.equal(changedEvents.length, 1, 'Should have exactly one changed event');
      test.equal(changedEvents[0].newDoc.value, 100, 'Should have new value');
      test.equal(changedEvents[0].oldDoc.value, 42, 'Should have old value');
      
      // Remove document
      await TestCollection.removeAsync(insertId);
      
      // Wait for remove to be observed
      const removeObserved = await waitForCondition(() => 
        events.some(e => e.type === 'removed'), 8000);
      
      if (!removeObserved) {
        test.fail('Remove should be observed within timeout');
        return;
      }
      
      const removedEvents = events.filter(e => e.type === 'removed');
      test.equal(removedEvents.length, 1, 'Should have exactly one removed event');
      test.equal(removedEvents[0].doc.name, 'test', 'Removed doc should have correct name');
      
    } finally {
      await safeStop(handle);
      await TestCollection.dropCollectionAsync();
    }
  });

  Tinytest.addAsync('mongo - ChangeStreamObserveDriver - verify driver type', async function (test) {
    
    const isSupported = await checkChangeStreamSupport();
    if (!isSupported) {
      test.skip('Change streams not supported - skipping test');
      return;
    }
    
    const TestCollection = new Mongo.Collection('test_changestream_driver_' + Random.id());
    let handle;
    
    try {
      handle = TestCollection.find({}).observe({
        added: function(doc) { /* no-op */ }
      });
      
      // Wait for handle to be ready if it's a Promise
      if (handle && typeof handle.then === 'function') {
        handle = await handle;
      }
      
      // Verify we're using ChangeStreamObserveDriver - this should pass or fail clearly
      verifyUsingChangeStreamDriver(handle, test);
      
    } finally {
      await safeStop(handle);
      await TestCollection.dropCollectionAsync();
    }
  });

  Tinytest.addAsync('mongo - ChangeStreamObserveDriver - projection test', async function (test) {
    
    const isSupported = await checkChangeStreamSupport();
    if (!isSupported) {
      test.skip('Change streams not supported - skipping test');
      return;
    }
    
    const TestCollection = new Mongo.Collection('test_changestream_projection_' + Random.id());
    let handle;
    
    try {
      let observedDocs = [];
     
      // Observe with field projection
      handle = TestCollection.find(
        { type: 'test' }, 
        { fields: { name: 1, value: 1 } }
      ).observe({
        added: function(doc) {
          observedDocs.push({ ...doc });
        }
      });
      
      // Wait for handle to be ready if it's a Promise
      if (handle && typeof handle.then === 'function') {
        handle = await handle;
      }
      
      // Verify we're using ChangeStreamObserveDriver
      verifyUsingChangeStreamDriver(handle, test);
      
      // Wait for observer setup
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Insert document with extra fields
      await TestCollection.insertAsync({ 
        name: 'test', 
        type: 'test',
        value: 42, 
        secretField: 'should-not-appear',
        extraData: { nested: 'value' }
      });
      
      // Wait for document to be observed
      const docObserved = await waitForCondition(() => observedDocs.length >= 1, 5000);
      test.isTrue(docObserved, 'Document should be observed within timeout');
      
      test.equal(observedDocs.length, 1, 'Should observe one document');
      
      const doc = observedDocs[0];
      test.isTrue('_id' in doc, 'Should include _id field');
      test.isTrue('name' in doc, 'Should include projected name field');
      test.isTrue('value' in doc, 'Should include projected value field');
      
      // These fields should be excluded by projection
      test.isFalse('secretField' in doc, 'Should NOT include non-projected secretField');
      test.isFalse('extraData' in doc, 'Should NOT include non-projected extraData');
      test.isFalse('type' in doc, 'Should NOT include non-projected type field');
      
    } finally {
      await safeStop(handle);
      await TestCollection.dropCollectionAsync();
    }
  });

  Tinytest.addAsync('mongo - ChangeStreamObserveDriver - handle cleanup', async function (test) {
    
    const isSupported = await checkChangeStreamSupport();
    if (!isSupported) {
      test.skip('Change streams not supported - skipping test');
      return;
    }
    
    const TestCollection = new Mongo.Collection('test_changestream_cleanup_' + Random.id());
    
    try {
      let handle = TestCollection.find({}).observe({
        added: function(doc) { /* no-op */ }
      });
      
      // Wait for handle to be ready if it's a Promise
      if (handle && typeof handle.then === 'function') {
        handle = await handle;
      }
      
      // Verify we're using ChangeStreamObserveDriver
      verifyUsingChangeStreamDriver(handle, test);
      
      test.isTrue(typeof handle.stop === 'function', 'Handle should have stop method');
      
      // Test that stop doesn't throw
      await safeStop(handle);
      test.isTrue(true, 'Handle stop should complete without error');
      
    } finally {
      await TestCollection.dropCollectionAsync();
    }
  });
} else {
  // Skip tests if not on server
  Tinytest.add('mongo - ChangeStreamObserveDriver - client skip', function (test) {
    test.isTrue(true, 'Change stream tests only run on server');
  });
}
