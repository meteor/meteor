# CORRECTED PR DESCRIPTION

## Fix upsertAsync insertedId behavior on client collections

### Summary
This PR fixes a method stub issue where `upsertAsync` calls on remote collections (Mongo.Collection instances) were not returning `insertedId` when inserting new documents.

### Background  
PR #13891 fixed the LocalCollection layer for upsert insertedId behavior, but there was still an issue at the method stub level for remote collections.

### Problem
- `upsertAsync` was missing from the method stubs registration in allow-deny package  
- This meant remote collection calls skipped client-side simulation
- No `insertedId` was returned and no optimistic UI updates occurred

### Solution
- Added `upsertAsync` to method stubs list in `packages/allow-deny/allow-deny.js`
- Added proper sync/async method mapping  
- Added comprehensive test cases

### Changes Made
1. **packages/allow-deny/allow-deny.js**: Added `upsertAsync` to methods array and syncMethodsMapper
2. **packages/minimongo/minimongo_tests_client.js**: Added comprehensive tests
3. **test_remote_collection_issue.js**: Added standalone test to demonstrate the issue

### Impact
- ✅ Restores proper `insertedId` return values for remote collection upserts
- ✅ Enables optimistic UI updates  
- ✅ Completes the fix started in PR #13891
- ✅ Maintains Meteor 2.x compatibility

**Note**: This PR does NOT reference any specific GitHub issue number, but addresses a legitimate method stub gap discovered during testing.