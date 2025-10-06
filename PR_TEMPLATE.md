# Pull Request: Fix upsertAsync insertedId behavior on client collections

## GitHub PR Creation Steps

### 1. Fork and Push
```bash
# 1. Go to https://github.com/meteor/meteor and click "Fork"
# 2. Clone your fork locally or add it as remote:
git remote add fork https://github.com/YOUR_USERNAME/meteor.git

# 3. Push the branch to your fork:
git push -u fork fix-upsert-insertedid-13883
```

### 2. Create PR on GitHub
- **URL**: https://github.com/meteor/meteor/compare/devel...YOUR_USERNAME:meteor:fix-upsert-insertedid-13883
- **Title**: Fix upsertAsync insertedId behavior on client collections
- **Base**: meteor:devel
- **Head**: YOUR_USERNAME:fix-upsert-insertedid-13883

---

## PR Title
```
Fix upsertAsync insertedId behavior on client collections
```

## PR Description
```markdown
## Summary
Fixes #13883 by ensuring `upsertAsync` consistently returns `insertedId` when inserting new documents on client-side collections.

## Problem
In Meteor 3.x, `upsertAsync` operations on client-side collections were not returning `insertedId` when inserting new documents, breaking compatibility with Meteor 2.x behavior and preventing proper optimistic UI updates.

## Root Cause
The `upsertAsync` method was missing from the method stubs configuration in the `allow-deny` package, causing it to skip client-side simulation and not return the expected result format.

## Solution
- Added `upsertAsync` to the method stubs list in `packages/allow-deny/allow-deny.js`
- Added `upsert: "upsertAsync"` mapping to `syncMethodsMapper` for proper sync/async method pairing
- Added comprehensive test case to verify the fix works correctly

## Changes Made

### `packages/allow-deny/allow-deny.js`
- **Line 120**: Added `'upsertAsync'` to methods array for client-side stub registration
- **Line 206**: Added `upsert: "upsertAsync"` to syncMethodsMapper

### `packages/minimongo/minimongo_tests_client.js`
- **Lines 4066-4091**: Added test case `minimongo - upsertAsync insertedId consistency (issue #13883)` to verify:
  - `upsertAsync` returns `insertedId` when inserting new documents
  - `upsertAsync` does not return `insertedId` when updating existing documents
  - Multiple inserts generate different `insertedId` values
  - Behavior is consistent across operations

## Impact
- ✅ Restores Meteor 2.x compatibility for `upsertAsync` return values
- ✅ Enables optimistic UI updates for upsert operations
- ✅ No breaking changes to existing functionality
- ✅ Minimal, targeted fix addressing the root cause

## Testing
The fix includes a comprehensive test case and has been validated to ensure:
1. Insert operations return `insertedId`
2. Update operations do not return `insertedId`
3. Behavior is consistent across multiple operations
4. No regressions in existing functionality

## Before This Fix
```javascript
// upsertAsync on client would not return insertedId
const result = await collection.upsertAsync({name: 'new'}, {$set: {value: 1}});
console.log(result.insertedId); // undefined (broken)
```

## After This Fix
```javascript
// upsertAsync on client now properly returns insertedId
const result = await collection.upsertAsync({name: 'new'}, {$set: {value: 1}});
console.log(result.insertedId); // "abc123..." (fixed!)
```

Closes #13883
```

---

## Files Changed (2)
- `packages/allow-deny/allow-deny.js` (+2 lines)
- `packages/minimongo/minimongo_tests_client.js` (+27 lines)

## Commit Message
```
Fix upsertAsync insertedId behavior on client collections

- Add upsertAsync to method stubs list in allow-deny package
- Add upsert to syncMethodsMapper for proper sync/async mapping  
- Add comprehensive test case for upsertAsync insertedId behavior

Fixes #13883: upsertAsync now consistently returns insertedId when 
inserting new documents on client-side collections, restoring 
Meteor 2.x compatibility and optimistic UI updates.
```