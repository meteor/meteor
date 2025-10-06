# Response to PR Review Comments

## Thank you for the feedback! 

You're absolutely right to question this. Let me clarify the difference between PR #13891 and this fix:

### PR #13891 Fixed: LocalCollection level (Direct calls)
- Fixed `LocalCollection.upsert()` and `LocalCollection.upsertAsync()` direct calls
- Added `insertedId` parameter to `finishUpdate()` method
- Works when calling collection methods directly on client

### This PR Fixes: Method Stub level (Remote collections)  
- Fixes `Collection.upsertAsync()` calls on **remote collections** (Mongo.Collection instances)
- The issue is that `upsertAsync` wasn't registered as a method stub
- Without method stubs, client-side calls go directly to server without local simulation

## The Difference

### Direct LocalCollection calls (Fixed in #13891):
```javascript
const localColl = new LocalCollection();
const result = await localColl.upsertAsync({name: 'test'}, {$set: {value: 1}});
console.log(result.insertedId); // ✅ Works after #13891
```

### Remote Mongo.Collection calls (This PR fixes):
```javascript  
const remoteColl = new Mongo.Collection('myCollection');
const result = await remoteColl.upsertAsync({name: 'test'}, {$set: {value: 1}});
console.log(result.insertedId); // ❌ Broken without method stubs
```

## Test to Verify Issue Still Exists

To verify this is still an issue in 3.3.2, test with a **remote collection** (not LocalCollection):

```javascript
// This should return insertedId but might not without method stubs
const MyCollection = new Mongo.Collection('test');
const result = await MyCollection.upsertAsync({name: 'test'}, {$set: {value: 1}});
console.log(result.insertedId); // Check if this works in 3.3.2
```

## Regarding updateAsync({upsert: true})

Yes, that's a valid alternative approach, but:
1. `upsertAsync()` is the documented, preferred API
2. Users expect it to work consistently 
3. Breaking the `upsertAsync()` method forces users to change their code

Should I test this specifically against Meteor 3.3.2 to confirm the issue still exists with remote collections?