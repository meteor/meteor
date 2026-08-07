import { expectTypeOf } from "expect-type";
import { Roles } from "./definitions";
import { Meteor } from "meteor/meteor";
import type { RolesCollection, RoleAssignmentsCollection } from "./definitions";

expectTypeOf(Roles).toBeObject();
expectTypeOf<RolesCollection>().toBeObject();
expectTypeOf<RoleAssignmentsCollection>().toBeObject();

// Collections this package augments onto Meteor.
expectTypeOf(Meteor.roles).toBeObject();
expectTypeOf(Meteor.roleAssignment).toBeObject();

// --- Constants / vars
expectTypeOf(Roles.GLOBAL_GROUP).toBeString();
expectTypeOf(Roles.subscription).toBeObject();

// --- User <-> role assignment functions
expectTypeOf(Roles.addUsersToRoles).toBeFunction();
expectTypeOf(Roles.addUsersToRolesAsync).toBeFunction();
expectTypeOf(Roles.removeUsersFromRoles).toBeFunction();
expectTypeOf(Roles.removeUsersFromRolesAsync).toBeFunction();
expectTypeOf(Roles.setUserRoles).toBeFunction();
expectTypeOf(Roles.setUserRolesAsync).toBeFunction();
expectTypeOf(Roles.userIsInRole).toBeFunction();
expectTypeOf(Roles.userIsInRoleAsync).toBeFunction();

// --- Role CRUD functions
expectTypeOf(Roles.createRole).toBeFunction();
expectTypeOf(Roles.createRoleAsync).toBeFunction();
expectTypeOf(Roles.deleteRole).toBeFunction();
expectTypeOf(Roles.deleteRoleAsync).toBeFunction();
expectTypeOf(Roles.renameRole).toBeFunction();
expectTypeOf(Roles.renameRoleAsync).toBeFunction();

// --- Role hierarchy functions
expectTypeOf(Roles.addRolesToParent).toBeFunction();
expectTypeOf(Roles.addRolesToParentAsync).toBeFunction();
expectTypeOf(Roles.removeRolesFromParent).toBeFunction();
expectTypeOf(Roles.removeRolesFromParentAsync).toBeFunction();
expectTypeOf(Roles.isParentOf).toBeFunction();
expectTypeOf(Roles.isParentOfAsync).toBeFunction();

// --- Query / retrieval functions
expectTypeOf(Roles.getAllRoles).toBeFunction();
expectTypeOf(Roles.getGroupsForUser).toBeFunction();
expectTypeOf(Roles.getGroupsForUserAsync).toBeFunction();
expectTypeOf(Roles.getScopesForUser).toBeFunction();
expectTypeOf(Roles.getScopesForUserAsync).toBeFunction();
expectTypeOf(Roles.getRolesForUser).toBeFunction();
expectTypeOf(Roles.getRolesForUserAsync).toBeFunction();
expectTypeOf(Roles.getUserAssignmentsForRole).toBeFunction();
expectTypeOf(Roles.getUsersInRole).toBeFunction();
expectTypeOf(Roles.getUsersInRoleAsync).toBeFunction();
expectTypeOf(Roles.getUserIdsInRole).toBeFunction();
expectTypeOf(Roles.getUserIdsInRoleAsync).toBeFunction();

// --- Scope functions
expectTypeOf(Roles.renameScope).toBeFunction();
expectTypeOf(Roles.renameScopeAsync).toBeFunction();
expectTypeOf(Roles.removeScope).toBeFunction();
expectTypeOf(Roles.removeScopeAsync).toBeFunction();

// --- Interfaces
expectTypeOf<Roles.Role>().toBeObject();
expectTypeOf<Roles.RoleAssignment>().toBeObject();
expectTypeOf<Roles.QueryOptions>().toBeObject();
