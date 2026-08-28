import { expectTypeOf } from "expect-type";
import { Roles } from "./definitions";
import { Meteor } from "meteor/meteor";
import { Mongo } from "meteor/mongo";
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

// --- Functions: exact return types (strong assertions catch signature drift)
expectTypeOf(Roles.addUsersToRoles).returns.toEqualTypeOf<void>();
expectTypeOf(Roles.addUsersToRolesAsync).returns.toEqualTypeOf<Promise<void>>();
expectTypeOf(Roles.removeUsersFromRoles).returns.toEqualTypeOf<void>();
expectTypeOf(Roles.removeUsersFromRolesAsync).returns.toEqualTypeOf<Promise<void>>();
expectTypeOf(Roles.setUserRoles).returns.toEqualTypeOf<void>();
expectTypeOf(Roles.setUserRolesAsync).returns.toEqualTypeOf<Promise<void>>();
expectTypeOf(Roles.userIsInRole).returns.toEqualTypeOf<boolean>();
expectTypeOf(Roles.userIsInRoleAsync).returns.toEqualTypeOf<Promise<boolean>>();
expectTypeOf(Roles.createRole).returns.toEqualTypeOf<string>();
expectTypeOf(Roles.createRoleAsync).returns.toEqualTypeOf<Promise<string>>();
expectTypeOf(Roles.deleteRole).returns.toEqualTypeOf<void>();
expectTypeOf(Roles.deleteRoleAsync).returns.toEqualTypeOf<Promise<void>>();
expectTypeOf(Roles.renameRole).returns.toEqualTypeOf<void>();
expectTypeOf(Roles.renameRoleAsync).returns.toEqualTypeOf<Promise<void>>();
expectTypeOf(Roles.addRolesToParent).returns.toEqualTypeOf<void>();
expectTypeOf(Roles.addRolesToParentAsync).returns.toEqualTypeOf<Promise<void>>();
expectTypeOf(Roles.removeRolesFromParent).returns.toEqualTypeOf<void>();
expectTypeOf(Roles.removeRolesFromParentAsync).returns.toEqualTypeOf<Promise<void>>();
expectTypeOf(Roles.isParentOf).returns.toEqualTypeOf<boolean>();
expectTypeOf(Roles.isParentOfAsync).returns.toEqualTypeOf<Promise<boolean>>();
expectTypeOf(Roles.getAllRoles).returns.toEqualTypeOf<Mongo.Cursor<Roles.Role>>();
expectTypeOf(Roles.getGroupsForUser).returns.toEqualTypeOf<string[]>();
expectTypeOf(Roles.getGroupsForUserAsync).returns.toEqualTypeOf<Promise<string[]>>();
expectTypeOf(Roles.getScopesForUser).returns.toEqualTypeOf<string[]>();
expectTypeOf(Roles.getScopesForUserAsync).returns.toEqualTypeOf<Promise<string[]>>();
expectTypeOf(Roles.getRolesForUser).returns.toEqualTypeOf<string[]>();
expectTypeOf(Roles.getRolesForUserAsync).returns.toEqualTypeOf<Promise<string[]>>();
expectTypeOf(Roles.getUserAssignmentsForRole).returns.toEqualTypeOf<Mongo.Cursor<Roles.RoleAssignment>>();
expectTypeOf(Roles.getUsersInRole).returns.toEqualTypeOf<Mongo.Cursor<Meteor.User>>();
expectTypeOf(Roles.getUsersInRoleAsync).returns.toEqualTypeOf<Promise<Mongo.Cursor<Meteor.User>>>();
expectTypeOf(Roles.getUserIdsInRole).returns.toEqualTypeOf<string[]>();
expectTypeOf(Roles.getUserIdsInRoleAsync).returns.toEqualTypeOf<Promise<string[]>>();
expectTypeOf(Roles.renameScope).returns.toEqualTypeOf<void>();
expectTypeOf(Roles.renameScopeAsync).returns.toEqualTypeOf<Promise<void>>();
expectTypeOf(Roles.removeScope).returns.toEqualTypeOf<void>();
expectTypeOf(Roles.removeScopeAsync).returns.toEqualTypeOf<Promise<void>>();

// --- Interfaces
expectTypeOf<Roles.Role>().toBeObject();
expectTypeOf<Roles.RoleAssignment>().toBeObject();
expectTypeOf<Roles.QueryOptions>().toBeObject();
