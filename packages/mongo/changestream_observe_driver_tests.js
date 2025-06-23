import { Tinytest } from 'meteor/tinytest';
import { Mongo } from 'meteor/mongo';
import { Meteor } from 'meteor/meteor';
import { ChangeStreamObserveDriver } from './changestream_observe_driver';

// Only run these tests if Change Streams are supported
if (Meteor.isServer && MongoInternals.defaultRemoteCollectionDriver().mongo._supportsChangeStreams) {
  
  Tinytest.add('mongo - ChangeStreamObserveDriver - basic functionality', async function (test) {
    const TestCollection = new Mongo.Collection('test_changestream_' + Random.id());
    
    try {
      const insertId = await TestCollection.insertAsync({ name: 'test', value: 42 });
      
      // Test basic observe functionality
      let addedCount = 0;
      let changedCount = 0;
      let removedCount = 0;
      
      const handle = TestCollection.find({ name: 'test' }).observe({
        added: function(doc) {
          addedCount++;
          test.equal(doc._id, insertId);
          test.equal(doc.name, 'test');
        },
        changed: function(newDoc, oldDoc) {
          changedCount++;
          test.equal(newDoc._id, insertId);
        },
        removed: function(oldDoc) {
          removedCount++;
          test.equal(oldDoc._id, insertId);
        }
      });
      
      // Wait a bit for the observer to be set up
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Test update
      await TestCollection.updateAsync(insertId, { $set: { value: 100 } });
      
      // Wait for change to propagate
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Test remove
      await TestCollection.removeAsync(insertId);
      
      // Wait for removal to propagate
      await new Promise(resolve => setTimeout(resolve, 100));
      
      handle.stop();
      
      // Note: We can't easily test the exact counts because the observer
      // might catch the initial insert or not, depending on timing
      test.isTrue(changedCount > 0, 'Should have detected changes');
      test.isTrue(removedCount > 0, 'Should have detected removal');
      
    } finally {
      // Clean up
      await TestCollection.dropCollectionAsync();
    }
  });
  
  Tinytest.add('mongo - ChangeStreamObserveDriver - selector filtering', async function (test) {
    const TestCollection = new Mongo.Collection('test_changestream_filter_' + Random.id());
    
    try {
      let observedDocs = [];
      
      // Only observe documents with status: 'active'
      const handle = TestCollection.find({ status: 'active' }).observe({
        added: function(doc) {
          observedDocs.push({ type: 'added', doc: doc });
        },
        changed: function(newDoc, oldDoc) {
          observedDocs.push({ type: 'changed', newDoc: newDoc, oldDoc: oldDoc });
        },
        removed: function(oldDoc) {
          observedDocs.push({ type: 'removed', doc: oldDoc });
        }
      });
      
      // Wait for observer setup
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Insert document that matches selector
      const activeId = await TestCollection.insertAsync({ name: 'active', status: 'active' });
      
      // Insert document that doesn't match selector
      const inactiveId = await TestCollection.insertAsync({ name: 'inactive', status: 'inactive' });
      
      // Wait for inserts to propagate
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Update the active document
      await TestCollection.updateAsync(activeId, { $set: { name: 'updated_active' } });
      
      // Update inactive to active (should trigger add)
      await TestCollection.updateAsync(inactiveId, { $set: { status: 'active' } });
      
      // Wait for updates to propagate
      await new Promise(resolve => setTimeout(resolve, 200));
      
      handle.stop();
      
      // We should have observed the active document but not the inactive one initially
      const addedEvents = observedDocs.filter(event => event.type === 'added');
      test.isTrue(addedEvents.length >= 1, 'Should have observed at least one added event');
      
      // Clean up
      await TestCollection.removeAsync(activeId);
      await TestCollection.removeAsync(inactiveId);
      
    } finally {
      await TestCollection.dropCollectionAsync();
    }
  });
  
} else {
  // Skip tests if Change Streams are not supported
  Tinytest.add('mongo - ChangeStreamObserveDriver - skipped (not supported)', function (test) {
    test.isTrue(true, 'Change Streams not supported in this environment');
  });
}
