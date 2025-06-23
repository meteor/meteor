// Test helper for Change Streams
// Add this to your server/main.js to test change streams manually

import { LinksCollection } from '../imports/api/links';
import { Meteor } from 'meteor/meteor';

// Add test methods to verify change streams are working
Meteor.methods({
  'changestreams.test.insert'() {
    console.log('🧪 TEST: Inserting test link via Change Streams...');
    const id = LinksCollection.insert({
      title: `Test Link ${Date.now()}`,
      url: 'https://example.com',
      createdAt: new Date(),
      source: 'CHANGE_STREAM_TEST'
    });
    console.log('🧪 TEST: Inserted test link with ID:', id);
    return id;
  },
  
  'changestreams.test.update'() {
    console.log('🧪 TEST: Updating test link via Change Streams...');
    const doc = LinksCollection.findOne({ source: 'CHANGE_STREAM_TEST' });
    if (doc) {
      LinksCollection.update(doc._id, {
        $set: {
          title: `Updated Test Link ${Date.now()}`,
          updatedAt: new Date()
        }
      });
      console.log('🧪 TEST: Updated test link with ID:', doc._id);
      return doc._id;
    } else {
      console.log('🧪 TEST: No test link found to update');
      return null;
    }
  },
  
  'changestreams.test.remove'() {
    console.log('🧪 TEST: Removing test link via Change Streams...');
    const doc = LinksCollection.findOne({ source: 'CHANGE_STREAM_TEST' });
    if (doc) {
      LinksCollection.remove(doc._id);
      console.log('🧪 TEST: Removed test link with ID:', doc._id);
      return doc._id;
    } else {
      console.log('🧪 TEST: No test link found to remove');
      return null;
    }
  },
  
  'changestreams.test.status'() {
    const count = LinksCollection.find().count();
    const testCount = LinksCollection.find({ source: 'CHANGE_STREAM_TEST' }).count();
    console.log('🧪 TEST STATUS: Total links:', count, 'Test links:', testCount);
    return { total: count, test: testCount };
  }
});

// Log instructions for manual testing
console.log('🧪 CHANGE STREAMS TESTING:');
console.log('To test change streams manually, open browser console and run:');
console.log('Meteor.call("changestreams.test.insert")');
console.log('Meteor.call("changestreams.test.update")');
console.log('Meteor.call("changestreams.test.remove")');
console.log('Meteor.call("changestreams.test.status")');
console.log('Watch the server logs for 🔥 ChangeStream messages!');
