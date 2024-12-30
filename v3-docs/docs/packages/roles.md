# Roles

Authorization package for Meteor - compatible with built-in accounts package.

> Available since Meteor 3.1.0 (previously alanning:roles)

## Installation

To add roles to your application, run this command in your terminal:

```bash
meteor add roles
```

## Overview

The roles package lets you attach roles to users and then check against those roles when deciding whether to grant access to Meteor methods or publish data. The core concept is simple - you create role assignments for users and then verify those roles later. This package provides helper methods to make the process of adding, removing, and verifying roles easier.

## Concepts

### Roles vs Permissions

Although named "roles", you can define your **roles**, **scopes** or **permissions** however you like. They are essentially tags assigned to users that you can check later.

You can have traditional roles like `admin` or `webmaster`, or more granular permissions like `view-secrets`, `users.view`, or `users.manage`. Often, more granular permissions are better as they handle edge cases without creating many higher-level roles.

### Role Hierarchy

Roles can be organized in a hierarchy:

- Roles can have multiple parents and children (subroles)
- If a parent role is assigned to a user, all its descendant roles also apply
- This allows creating "super roles" that aggregate permissions

Example hierarchy setup:

```js
import { Roles } from "meteor/roles";

// Create base roles
await Roles.createRoleAsync("user");
await Roles.createRoleAsync("admin");

// Create permission roles
await Roles.createRoleAsync("USERS_VIEW");
await Roles.createRoleAsync("POST_EDIT");

// Set up hierarchy
await Roles.addRolesToParentAsync("USERS_VIEW", "admin");
await Roles.addRolesToParentAsync("POST_EDIT", "admin");
await Roles.addRolesToParentAsync("POST_EDIT", "user");
```

### Scopes

Scopes allow users to have independent sets of roles. Use cases include:

- Different communities within your app
- Multiple tenants in a multi-tenant application
- Different resource groups

Users can have both scoped roles and global roles:

- Global roles apply across all scopes
- Scoped roles only apply within their specific scope
- Scopes are independent of each other

Example using scopes:

```js
// Assign scoped roles
await Roles.addUsersToRolesAsync(userId, ["manage-team"], "team-a");
await Roles.addUsersToRolesAsync(userId, ["player"], "team-b");

// Check scoped roles
await Roles.userIsInRoleAsync(userId, "manage-team", "team-a"); // true
await Roles.userIsInRoleAsync(userId, "manage-team", "team-b"); // false

// Assign global role
await Roles.addUsersToRolesAsync(userId, "super-admin", null);

// Global roles work in all scopes
await Roles.userIsInRoleAsync(userId, ["manage-team", "super-admin"], "team-b"); // true
```

## Role Management

<ApiBox name="Roles.createRoleAsync" hasCustomExample/>

Example:

```js
import { Roles } from "meteor/roles";

// Create a new role
await Roles.createRoleAsync("admin");

// Create if doesn't exist
await Roles.createRoleAsync("editor", { unlessExists: true });
```

### Modifying Roles

<ApiBox name="Roles.addRolesToParentAsync" hasCustomExample />

Example:

```js
// Make 'editor' a child role of 'admin'
await Roles.addRolesToParentAsync("editor", "admin");

// Add multiple child roles
await Roles.addRolesToParentAsync(["editor", "moderator"], "admin");
```

<ApiBox name="Roles.removeRolesFromParentAsync" hasCustomExample />

Example:

```js
// Remove 'editor' as child role of 'admin'
await Roles.removeRolesFromParentAsync("editor", "admin");
```

<ApiBox name="Roles.deleteRoleAsync" hasCustomExample />

Example:

```js
// Delete role and all its assignments
await Roles.deleteRoleAsync("temp-role");
```

<ApiBox name="Roles.renameRoleAsync" hasCustomExample />

Example:

```js
// Rename an existing role
await Roles.renameRoleAsync("editor", "content-editor");
```

### Assigning Roles

<ApiBox name="Roles.addUsersToRolesAsync" hasCustomExample />

Example:

```js
// Add global roles
await Roles.addUsersToRolesAsync(userId, ["admin", "editor"]);

// Add scoped roles
await Roles.addUsersToRolesAsync(userId, ["manager"], "department-a");

// Add roles to multiple users
await Roles.addUsersToRolesAsync([user1Id, user2Id], ["user"]);
```

<ApiBox name="Roles.setUserRolesAsync" hasCustomExample />

Example:

```js
// Replace user's global roles
await Roles.setUserRolesAsync(userId, ["editor"]);

// Replace scoped roles
await Roles.setUserRolesAsync(userId, ["viewer"], "project-x");

// Clear all roles in scope
await Roles.setUserRolesAsync(userId, [], "project-x");
```

<ApiBox name="Roles.removeUsersFromRolesAsync" hasCustomExample />

Example:

```js
// Remove global roles
await Roles.removeUsersFromRolesAsync(userId, ["admin"]);

// Remove scoped roles
await Roles.removeUsersFromRolesAsync(userId, ["manager"], "department-a");

// Remove roles from multiple users
await Roles.removeUsersFromRolesAsync([user1Id, user2Id], ["temp-role"]);
```

<ApiBox name="Roles.renameScopeAsync" hasCustomExample />

Example:

```js
// Rename a scope
await Roles.renameScopeAsync("department-1", "marketing");
```

<ApiBox name="Roles.removeScopeAsync" hasCustomExample />

Example:

```js
// Remove a scope and all its role assignments
await Roles.removeScopeAsync("old-department");
```

<ApiBox name="Roles.getAllRoles" hasCustomExample />

Example:

```js
// Get all roles sorted by name
const roles = Roles.getAllRoles({ sort: { _id: 1 } });

// Get roles with custom query
const customRoles = Roles.getAllRoles({
  fields: { _id: 1, children: 1 },
  sort: { _id: -1 },
});
```

<ApiBox name="Roles.getUsersInRoleAsync" hasCustomExample />

Example:

```js
// Find all admin users
const adminUsers = await Roles.getUsersInRoleAsync("admin");

// Find users with specific roles in a scope
const scopedUsers = await Roles.getUsersInRoleAsync(
  ["editor", "writer"],
  "blog"
);

// Find users with custom options
const users = await Roles.getUsersInRoleAsync("manager", {
  scope: "department-a",
  queryOptions: {
    sort: { createdAt: -1 },
    limit: 10,
  },
});
```

## Checking Roles

<ApiBox name="Roles.userIsInRoleAsync" hasCustomExample />

Example:

```js
// Check global role
const isAdmin = await Roles.userIsInRoleAsync(userId, "admin");

// Check any of multiple roles
const canEdit = await Roles.userIsInRoleAsync(userId, ["editor", "admin"]);

// Check scoped role
const isManager = await Roles.userIsInRoleAsync(
  userId,
  "manager",
  "department-a"
);

// Check role in any scope
const hasRole = await Roles.userIsInRoleAsync(userId, "viewer", {
  anyScope: true,
});
```

<ApiBox name="Roles.getRolesForUserAsync"  hasCustomExample />

Example:

```js
// Get user's global roles
const globalRoles = await Roles.getRolesForUserAsync(userId);

// Get scoped roles
const deptRoles = await Roles.getRolesForUserAsync(userId, "department-a");

// Get all roles including inherited
const allRoles = await Roles.getRolesForUserAsync(userId, {
  anyScope: true,
  fullObjects: true,
});
```

<ApiBox name="Roles.isParentOfAsync" hasCustomExample />

Example:

```js
// Check if admin is a parent of editor
const isParent = await Roles.isParentOfAsync("admin", "editor");

// Can be used to check inheritance chains
const hasPermission = await Roles.isParentOfAsync("super-admin", "post-edit");
```

<ApiBox name="Roles.getScopesForUserAsync" hasCustomExample />

Example:

```js
// Get all scopes for user
const allScopes = await Roles.getScopesForUserAsync(userId);

// Get scopes where user has specific roles
const editorScopes = await Roles.getScopesForUserAsync(userId, ["editor"]);
```

## Publishing Roles

Role assignments need to be published to be available on the client. Example publication:

```js
// Publish user's own roles
Meteor.publish(null, function () {
  if (this.userId) {
    return Meteor.roleAssignment.find({ "user._id": this.userId });
  }
  this.ready();
});

// Publish roles for specific scope
Meteor.publish("scopeRoles", function (scope) {
  if (this.userId) {
    return Meteor.roleAssignment.find({ scope: scope });
  }
  this.ready();
});
```

## Client only APIs

On the client alongside the async methods, you can use the `sync` versions of the functions:

- `Roles.userIsInRole(userId, roles, scope)`
- `Roles.getRolesForUser(userId, scope)`
- `Roles.getScopesForUser(userId)`
- `Roles.isParentOf(parent, child)`
- `Roles.getUsersInRole(role, scope)`
- `Roles.getAllRoles(options)`
- `Roles.createRole(role, options)`
- `Roles.addUsersToRoles(userId, roles, scope)`
- `Roles.setUserRoles(userId, roles, scope)`
- `Roles.removeUsersFromRoles(userId, roles, scope)`
- `Roles.addRolesToParent(child, parent)`
- `Roles.removeRolesFromParent(child, parent)`
- `Roles.deleteRole(role)`
- `Roles.renameRole(oldRole, newRole)`
- `Roles.renameScope(oldScope, newScope)`
- `Roles.removeScope(scope)`

## Using with Templates

The roles package automatically provides an `isInRole` helper for templates:

```handlebars
{{#if isInRole "admin"}}
  <div class="admin-panel">
    <!-- Admin only content -->
  </div>
{{/if}}

{{#if isInRole "editor,writer" "blog"}}
  <div class="editor-tools">
    <!-- Blog editor tools -->
  </div>
{{/if}}
```

## Migration to Core Version

If you are currently using the `alanning:roles` package, follow these steps to migrate to the core version:

1. Make sure you are on version 3.6 of `alanning:roles` first
2. Run any pending migrations from previous versions
3. Switch all server-side role operations to use the async versions of the functions:
   - createRoleAsync
   - deleteRoleAsync
   - addUsersToRolesAsync
   - setUserRolesAsync
   - removeUsersFromRolesAsync
   - etc.
4. Remove `alanning:roles` package:
   ```bash
   meteor remove alanning:roles
   ```
5. Add the core roles package:
   ```bash
   meteor add roles
   ```
6. Update imports to use the new package:
   ```js
   import { Roles } from "meteor/roles";
   ```

The sync versions of these functions are still available on the client.

## Security Considerations

1. Client-side role checks are for convenience only - always verify permissions on the server
2. Publish only the role data that users need
3. Use scopes to properly isolate role assignments
4. Validate role names and scopes to prevent injection attacks
5. Consider using more granular permissions over broad role assignments

## Example Usage

### Method Security

```js
// server/methods.js
Meteor.methods({
  deletePost: async function (postId) {
    check(postId, String);

    const canDelete = await Roles.userIsInRoleAsync(
      this.userId,
      ["admin", "moderator"],
      "posts"
    );

    if (!canDelete) {
      throw new Meteor.Error("unauthorized", "Not authorized to delete posts");
    }

    Posts.remove(postId);
  },
});
```

### Publication Security

```js
// server/publications.js
Meteor.publish("secretDocuments", async function (scope) {
  check(scope, String);

  const canView = await Roles.userIsInRoleAsync(
    this.userId,
    ["view-secrets", "admin"],
    scope
  );

  if (canView) {
    return SecretDocs.find({ scope: scope });
  }

  this.ready();
});
```

### User Management

```js
// server/users.js
Meteor.methods({
  promoteToEditor: async function (userId, scope) {
    check(userId, String);
    check(scope, String);

    const canPromote = await Roles.userIsInRoleAsync(
      this.userId,
      "admin",
      scope
    );

    if (!canPromote) {
      throw new Meteor.Error("unauthorized");
    }

    await Roles.addUsersToRolesAsync(userId, ["editor"], scope);
  },
});
```
