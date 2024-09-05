// Definitions by: Robbie Van Gorkom <https://github.com/vangorra>
//                 Matthew Zartman <https://github.com/mattmm3d>
//                 Jan Dvorak <https://github.com/storytellercz>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped
// Minimum TypeScript Version: 4.1

import { Mongo } from 'meteor/mongo'

/**
 * Provides functions related to user authorization. Compatible with built-in Meteor accounts packages.
 *
 * @module Roles
 */
declare namespace Roles {
  /**
   * Constant used to reference the special 'global' group that
   * can be used to apply blanket permissions across all groups.
   *
   * @example
   *     Roles.addUsersToRoles(user, 'admin', Roles.GLOBAL_GROUP)
   *     Roles.userIsInRole(user, 'admin') // => true
   *
   *     Roles.setUserRoles(user, 'support-staff', Roles.GLOBAL_GROUP)
   *     Roles.userIsInRole(user, 'support-staff') // => true
   *     Roles.userIsInRole(user, 'admin') // => false
   *
   * @static
   * @final
   */
  var GLOBAL_GROUP: string

  /**
   * Subscription handle for the currently logged in user's permissions.
   *
   * NOTE: The corresponding publish function, `_roles`, depends on
   * `this.userId` so it will automatically re-run when the currently
   * logged-in user changes.
   *
   * @example
   *
   *     `Roles.subscription.ready()` // => `true` if user roles have been loaded
   *
   * @for Roles
   */
  var subscription: Subscription

  /**
   * Add users to roles.
   *
   * Adds roles to existing roles for each user.
   *
   * @example
   *     Roles.addUsersToRoles(userId, 'admin')
   *     Roles.addUsersToRoles(userId, ['view-secrets'], 'example.com')
   *     Roles.addUsersToRoles([user1, user2], ['user','editor'])
   *     Roles.addUsersToRoles([user1, user2], ['glorious-admin', 'perform-action'], 'example.org')
   *
   * @method addUsersToRoles
   * @param {Array|String} users User ID(s) or object(s) with an `_id` field.
   * @param {Array|String} roles Name(s) of roles to add users to. Roles have to exist.
   * @param {Object|String} [options] Options:
   *   - `scope`: name of the scope, or `null` for the global role
   *   - `ifExists`: if `true`, do not throw an exception if the role does not exist
   *
   * Alternatively, it can be a scope name string.
   */
  function addUsersToRoles(
    users: string | string[] | Meteor.User | Meteor.User[],
    roles: string | string[],
    options?: string | { scope?: string; ifExists?: boolean }
  ): void
  function addUsersToRolesAsync(
    users: string | string[] | Meteor.User | Meteor.User[],
    roles: string | string[],
    options?: string | { scope?: string; ifExists?: boolean }
  ): Promise<void>

  /**
   * Create a new role.
   *
   * @method createRole
   * @param {String} roleName Name of role.
   * @param {Object} [options] Options:
   *   - `unlessExists`: if `true`, exception will not be thrown in the role already exists
   * @return {String} ID of the new role or null.
   */
  function createRole(roleName: string, options?: { unlessExists: boolean }): string
  function createRoleAsync(roleName: string, options?: { unlessExists: boolean }): Promise<string>

  /**
   * Delete an existing role.
   *
   * If the role is set for any user, it is automatically unset.
   *
   * @method deleteRole
   * @param {String} roleName Name of role.
   */
  function deleteRole(roleName: string): void
  function deleteRoleAsync(roleName: string): Promise<void>

  /**
   * Rename an existing role.
   *
   * @method renameRole
   * @param {String} oldName Old name of a role.
   * @param {String} newName New name of a role.
   */
  function renameRole(oldName: string, newName: string): void
  function renameRoleAsync(oldName: string, newName: string): Promise<void>

  /**
   * Add role parent to roles.
   *
   * Previous parents are kept (role can have multiple parents). For users which have the
   * parent role set, new subroles are added automatically.
   *
   * @method addRolesToParent
   * @param {Array|String} rolesNames Name(s) of role(s).
   * @param {String} parentName Name of parent role.
   */
  function addRolesToParent(rolesNames: string | string[], parentName: string): void
  function addRolesToParentAsync(rolesNames: string | string[], parentName: string): Promise<void>

  /**
   * Remove role parent from roles.
   *
   * Other parents are kept (role can have multiple parents). For users which have the
   * parent role set, removed subrole is removed automatically.
   *
   * @method removeRolesFromParent
   * @param {Array|String} rolesNames Name(s) of role(s).
   * @param {String} parentName Name of parent role.
   */
  function removeRolesFromParent(rolesNames: string | string[], parentName: string): void
  function removeRolesFromParentAsync(rolesNames: string | string[], parentName: string): Promise<void>

  /**
   * Retrieve cursor of all existing roles.
   *
   * @method getAllRoles
   * @param {Object} queryOptions Options which are passed directly
   *                                through to `Meteor.roles.find(query, options)`.
   * @return {Cursor} Cursor of existing roles.
   */
  function getAllRoles(queryOptions?: QueryOptions): Mongo.Cursor<Role>

  /**
   * Retrieve users groups, if any
   * @deprecated Use `getScopesForUser` instead.
   * @method getGroupsForUser
   * @param {String|Object} user User ID or actual user object
   * @param {String} [role] Optional name of roles to restrict groups to.
   *
   * @return {Array} Array of user's groups, unsorted. Roles.GLOBAL_GROUP will be omitted
   */
  function getGroupsForUser(user: string | Meteor.User, role?: string): string[]
  function getGroupsForUserAsync(user: string | Meteor.User, role?: string): Promise<string[]>

  /**
   * Retrieve users scopes, if any.
   *
   * @method getScopesForUser
   * @param {String|Object} user User ID or an actual user object.
   * @param {Array|String} [roles] Name of roles to restrict scopes to.
   *
   * @return {Array} Array of user's scopes, unsorted.
   */
  function getScopesForUser(user: string | Meteor.User, roles?: string | string[]): string[]
  function getScopesForUserAsync(user: string | Meteor.User, roles?: string | string[]): Promise<string[]>

  /**
   * Rename a scope.
   *
   * Roles assigned with a given scope are changed to be under the new scope.
   *
   * @method renameScope
   * @param {String} oldName Old name of a scope.
   * @param {String} newName New name of a scope.
   */
  function renameScope(oldName: string, newName: string): void
  function renameScopeAsync(oldName: string, newName: string): Promise<void>

  /**
   * Remove a scope.
   *
   * Roles assigned with a given scope are removed.
   *
   * @method removeScope
   * @param {String} name The name of a scope.
   *
   */
  function removeScope(name: String): void
  function removeScopeAsync(name: String): Promise<void>

  /**
   * Find out if a role is an ancestor of another role.
   *
   * WARNING: If you check this on the client, please make sure all roles are published.
   *
   * @method isParentOf
   * @param {String} parentRoleName The role you want to research.
   * @param {String} childRoleName The role you expect to be among the children of parentRoleName.
   * @return {Boolean}
   */
  function isParentOf(parentRoleName: string, childRoleName: string): boolean
  function isParentOfAsync(parentRoleName: string, childRoleName: string): Promise<boolean>

  /**
   * Retrieve user's roles.
   *
   * @method getRolesForUser
   * @param {String|Object} user User ID or an actual user object.
   * @param {Object|String} [options] Options:
   *   - `scope`: name of scope to provide roles for; if not specified, global roles are returned
   *   - `anyScope`: if set, role can be in any scope (`scope` and `onlyAssigned` options are ignored)
   *   - `onlyScoped`: if set, only roles in the specified scope are returned
   *   - `onlyAssigned`: return only assigned roles and not automatically inferred (like subroles)
   *   - `fullObjects`: return full roles objects (`true`) or just names (`false`) (`onlyAssigned` option is ignored) (default `false`)
   *     If you have a use-case for this option, please file a feature-request. You shouldn't need to use it as it's
   *     result strongly dependant on the internal data structure of this plugin.
   *
   * Alternatively, it can be a scope name string.
   * @return {Array} Array of user's roles, unsorted.
   */
  function getRolesForUser(user: string | Meteor.User, options?: string | {
    scope?: string;
    anyScope?: boolean;
    onlyScoped?: boolean;
    onlyAssigned?: boolean;
    fullObjects?: boolean
  }): string[]
  function getRolesForUserAsync(user: string | Meteor.User, options?: string | {
    scope?: string;
    anyScope?: boolean;
    onlyScoped?: boolean;
    onlyAssigned?: boolean;
    fullObjects?: boolean
  }): Promise<string[]>

  /**
   * Retrieve all assignments of a user which are for the target role.
   *
   * Options:
   *
   * @method getUserAssignmentsForRole
   * @param {Array|String} roles Name of role or an array of roles. If array, users
   *                             returned will have at least one of the roles
   *                             specified but need not have _all_ roles.
   *                             Roles do not have to exist.
   * @param {Object|String} [options] Options:
   *   - `scope`: name of the scope to restrict roles to; user's global
   *     roles will also be checked
   *   - `anyScope`: if set, role can be in any scope (`scope` option is ignored)
   *   - `queryOptions`: options which are passed directly
   *     through to `Meteor.roleAssignment.find(query, options)`
   *
   * Alternatively, it can be a scope name string.
   * @return {Cursor} Cursor of user assignments for roles.
   */
  function getUserAssignmentsForRole(roles: string | string[], options?: string | {
    scope?: string
    anyScope?: boolean
    queryOptions?: QueryOptions
  }): Mongo.Cursor<RoleAssignment>

  /**
   * Retrieve all users who are in target role.
   *
   * Options:
   *
   * @method getUsersInRole
   * @param {Array|String} roles Name of role or an array of roles. If array, users
   *                             returned will have at least one of the roles
   *                             specified but need not have _all_ roles.
   *                             Roles do not have to exist.
   * @param {Object|String} options Options:
   *   - `scope`: name of the scope to restrict roles to; user's global
   *     roles will also be checked
   *   - `anyScope`: if set, role can be in any scope (`scope` option is ignored)
   *   - `onlyScoped`: if set, only roles in the specified scope are returned
   *   - `queryOptions`: options which are passed directly
   *     through to `Meteor.users.find(query, options)`
   *
   * Alternatively, it can be a scope name string.
   * @param {Object} queryOptions Options which are passed directly
   *                                through to `Meteor.users.find(query, options)`
   * @return {Cursor} Cursor of users in roles.
   */
  function getUsersInRole(
    roles: string | string[],
    options?: string | { scope?: string; anyScope?: boolean; onlyScoped?: boolean; queryOptions?: QueryOptions },
    queryOptions?: QueryOptions
  ): Mongo.Cursor<Meteor.User>
  function getUsersInRoleAsync(
    roles: string | string[],
    options?: string | { scope?: string; anyScope?: boolean; onlyScoped?: boolean; queryOptions?: QueryOptions },
    queryOptions?: QueryOptions
  ): Promise<Mongo.Cursor<Meteor.User>>

  /**
   * Remove users from assigned roles.
   *
   * @example
   *     Roles.removeUsersFromRoles(userId, 'admin')
   *     Roles.removeUsersFromRoles([userId, user2], ['editor'])
   *     Roles.removeUsersFromRoles(userId, ['user'], 'group1')
   *
   * @method removeUsersFromRoles
   * @param {Array|String} users User ID(s) or object(s) with an `_id` field.
   * @param {Array|String} roles Name(s) of roles to remove users from. Roles have to exist.
   * @param {Object|String} [options] Options:
   *   - `scope`: name of the scope, or `null` for the global role
   *   - `anyScope`: if set, role can be in any scope (`scope` option is ignored)
   *
   * Alternatively, it can be a scope name string.
   */
  function removeUsersFromRoles(
    users: string | string[] | Meteor.User | Meteor.User[],
    roles?: string | string[],
    options?: string | { scope?: string; anyScope?: boolean }
  ): void
  function removeUsersFromRolesAsync(
    users: string | string[] | Meteor.User | Meteor.User[],
    roles?: string | string[],
    options?: string | { scope?: string; anyScope?: boolean }
  ): Promise<void>

  /**
   * Set users' roles.
   *
   * Replaces all existing roles with a new set of roles.
   *
   * @example
   *     Roles.setUserRoles(userId, 'admin')
   *     Roles.setUserRoles(userId, ['view-secrets'], 'example.com')
   *     Roles.setUserRoles([user1, user2], ['user','editor'])
   *     Roles.setUserRoles([user1, user2], ['glorious-admin', 'perform-action'], 'example.org')
   *
   * @method setUserRoles
   * @param {Array|String} users User ID(s) or object(s) with an `_id` field.
   * @param {Array|String} roles Name(s) of roles to add users to. Roles have to exist.
   * @param {Object|String} [options] Options:
   *   - `scope`: name of the scope, or `null` for the global role
   *   - `anyScope`: if `true`, remove all roles the user has, of any scope, if `false`, only the one in the same scope
   *   - `ifExists`: if `true`, do not throw an exception if the role does not exist
   *
   * Alternatively, it can be a scope name string.
   */
  function setUserRoles(
    users: string | string[] | Meteor.User | Meteor.User[],
    roles: string | string[],
    options?: string | { scope?: string; anyScope?: boolean; ifExists?: boolean }
  ): void
  function setUserRolesAsync(
    users: string | string[] | Meteor.User | Meteor.User[],
    roles: string | string[],
    options?: string | { scope?: string; anyScope?: boolean; ifExists?: boolean }
  ): Promise<void>

  /**
   * Check if user has specified roles.
   *
   * @example
   *     // global roles
   *     Roles.userIsInRole(user, 'admin')
   *     Roles.userIsInRole(user, ['admin','editor'])
   *     Roles.userIsInRole(userId, 'admin')
   *     Roles.userIsInRole(userId, ['admin','editor'])
   *
   *     // scope roles (global roles are still checked)
   *     Roles.userIsInRole(user, 'admin', 'group1')
   *     Roles.userIsInRole(userId, ['admin','editor'], 'group1')
   *     Roles.userIsInRole(userId, ['admin','editor'], {scope: 'group1'})
   *
   * @method userIsInRole
   * @param {String|Object} user User ID or an actual user object.
   * @param {Array|String} roles Name of role or an array of roles to check against. If array,
   *                             will return `true` if user is in _any_ role.
   *                             Roles do not have to exist.
   * @param {Object|String} [options] Options:
   *   - `scope`: name of the scope; if supplied, limits check to just that scope
   *     the user's global roles will always be checked whether scope is specified or not
   *   - `anyScope`: if set, role can be in any scope (`scope` option is ignored)
   *
   * Alternatively, it can be a scope name string.
   * @return {Boolean} `true` if user is in _any_ of the target roles
   */
  function userIsInRole(
    user: string | string[] | Meteor.User | Meteor.User[],
    roles: string | string[],
    options?: string | { scope?: string; anyScope?: boolean }
  ): boolean
  function userIsInRoleAsync(
    user: string | string[] | Meteor.User | Meteor.User[],
    roles: string | string[],
    options?: string | { scope?: string; anyScope?: boolean }
  ): Promise<boolean>

  // The schema for the roles collection
  interface Role {
    _id: string
    name: string
    children: { _id: string }[]
  }

  // The schema for the role-assignment collection
  interface RoleAssignment {
    _id: string
    user: {
      _id: string
    }
    role: {
      _id: string
    }
    inheritedRoles?: {
      _id: string
    }[]
    scope?: string
  }

  interface QueryOptions {
    sort?: Mongo.SortSpecifier | undefined
    skip?: number | undefined
    limit?: number | undefined
    fields?: Mongo.FieldSpecifier | undefined
    projection?: Mongo.FieldSpecifier | undefined
    reactive?: boolean | undefined
    transform?: Function | undefined
  }

} // module

// Exported collections
declare type RolesCollection = Mongo.Collection<Roles.Role>
declare type RoleAssignmentsCollection = Mongo.Collection<Roles.RoleAssignment>

// Additions to the Meteor object
declare module 'meteor/meteor' {
  namespace Meteor {
    const roles: Mongo.Collection<Roles.Role>
    const roleAssignment: Mongo.Collection<Roles.RoleAssignment>
  }
}
