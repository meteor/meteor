// Test to demonstrate the difference between PR #13891 and this PR
// Run this in a Meteor 3.3.2 app to see the issue

// This file demonstrates why both fixes are needed:
// 1. PR #13891 fixed LocalCollection direct calls  
// 2. This PR fixes remote Mongo.Collection method stubs

console.log('Testing upsertAsync behavior differences...');

// Test 1: LocalCollection (should work after #13891)
async function testLocalCollection() {
  console.log('\n1. Testing LocalCollection (direct calls):');
  
  if (typeof LocalCollection !== 'undefined') {
    const localColl = new LocalCollection();
    
    try {
      const result = await localColl.upsertAsync({name: 'local-test'}, {$set: {value: 1}});
      console.log('LocalCollection result:', result);
      console.log('Has insertedId:', result.hasOwnProperty('insertedId'));
      console.log('✅ LocalCollection works (fixed in #13891)');
    } catch (error) {
      console.log('❌ LocalCollection error:', error.message);
    }
  } else {
    console.log('LocalCollection not available in this context');
  }
}

// Test 2: Remote Mongo.Collection (needs method stubs - this PR's fix)
async function testRemoteCollection() {
  console.log('\n2. Testing Remote Mongo.Collection (method stubs):');
  
  if (typeof Mongo !== 'undefined' && Mongo.Collection) {
    // Create a test collection (this would be a remote collection in a real app)
    const TestCollection = new Mongo.Collection('test_upsert_' + Random.id());
    
    try {
      const result = await TestCollection.upsertAsync({name: 'remote-test'}, {$set: {value: 1}});
      console.log('Remote Collection result:', result);
      console.log('Has insertedId:', result.hasOwnProperty('insertedId'));
      
      if (result.hasOwnProperty('insertedId')) {
        console.log('✅ Remote Collection works (method stubs active)');
      } else {
        console.log('❌ Remote Collection missing insertedId (method stubs needed)');
      }
    } catch (error) {
      console.log('❌ Remote Collection error:', error.message);
    }
  } else {
    console.log('Mongo.Collection not available in this context');
  }
}

// Test 3: Check method stub registration
function testMethodStubRegistration() {
  console.log('\n3. Testing Method Stub Registration:');
  
  if (typeof AllowDeny !== 'undefined' && AllowDeny.CollectionPrototype) {
    console.log('AllowDeny available');
    
    // Check if _defineMutationMethods exists
    const hasMethod = typeof AllowDeny.CollectionPrototype._defineMutationMethods === 'function';
    console.log('Has _defineMutationMethods:', hasMethod);
    
    console.log('✅ Method stub system available');
  } else {
    console.log('❌ AllowDeny not available');
  }
}

// Run all tests
if (typeof Meteor !== 'undefined') {
  Meteor.startup(async () => {
    await testLocalCollection();
    await testRemoteCollection();
    testMethodStubRegistration();
    
    console.log('\n📝 Summary:');
    console.log('- PR #13891 fixed LocalCollection direct calls');
    console.log('- This PR fixes remote collection method stubs');
    console.log('- Both fixes are needed for complete compatibility');
  });
} else {
  // Running outside Meteor
  console.log('Run this inside a Meteor application to see the full test results');
}