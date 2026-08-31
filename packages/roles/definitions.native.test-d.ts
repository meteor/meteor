import { expectTypeOf } from "expect-type";
import { Roles } from "./definitions.native";
import { Meteor } from "meteor/meteor";
import { Mongo } from "meteor/mongo";
import type { RolesCollection, RoleAssignmentsCollection } from "./definitions.native";

expectTypeOf(Roles).toBeObject();
expectTypeOf<Roles.Scope>().toEqualTypeOf<string | null>();
expectTypeOf<RolesCollection>().toBeObject();
expectTypeOf<RoleAssignmentsCollection>().toBeObject();

// Collections this package augments onto Meteor.
expectTypeOf(Meteor.roles).toBeObject();
expectTypeOf(Meteor.roleAssignment).toBeObject();

// --- Constants / vars
expectTypeOf(Roles.GLOBAL_GROUP).toBeNull();
expectTypeOf(Roles.subscription).toBeObject();
Roles.addUsersToRoles("user-id", "admin", Roles.GLOBAL_GROUP);
Roles.addUsersToRoles("user-id", "admin", { scope: Roles.GLOBAL_GROUP });
Roles.setUserRoles("user-id", "admin", Roles.GLOBAL_GROUP);
Roles.userIsInRole("user-id", "admin", Roles.GLOBAL_GROUP);
const globalAssignment: Roles.RoleAssignment = {
  _id: "assignment-id",
  user: { _id: "user-id" },
  role: { _id: "admin" },
  scope: Roles.GLOBAL_GROUP,
};
expectTypeOf(globalAssignment.scope).toEqualTypeOf<Roles.Scope | undefined>();

// --- Functions: exact return types (strong assertions catch signature drift)
expectTypeOf(Roles.addUsersToRoles).returns.toEqualTypeOf<void>();
expectTypeOf(Roles.addUsersToRolesAsync).returns.toEqualTypeOf<Promise<void>>();
expectTypeOf(Roles.removeUsersFromRoles).returns.toEqualTypeOf<void>();
expectTypeOf(Roles.removeUsersFromRolesAsync).returns.toEqualTypeOf<Promise<void>>();
expectTypeOf(Roles.setUserRoles).returns.toEqualTypeOf<void>();
expectTypeOf(Roles.setUserRolesAsync).returns.toEqualTypeOf<Promise<void>>();
expectTypeOf(Roles.userIsInRole).returns.toEqualTypeOf<boolean>();
expectTypeOf(Roles.userIsInRoleAsync).returns.toEqualTypeOf<Promise<boolean>>();
expectTypeOf(Roles.createRole).returns.toEqualTypeOf<string | null>();
expectTypeOf(Roles.createRoleAsync).returns.toEqualTypeOf<Promise<string | null>>();
expectTypeOf(Roles.createRole).toBeCallableWith("admin");
expectTypeOf(Roles.createRole).toBeCallableWith("admin", {
  unlessExists: true,
});
expectTypeOf(Roles.createRole("admin")).toEqualTypeOf<string>();
expectTypeOf(Roles.createRole("admin", {
  unlessExists: false,
})).toEqualTypeOf<string>();
expectTypeOf(Roles.createRole("admin", {
  unlessExists: true,
})).toEqualTypeOf<string | null>();
declare const createRoleOptions: { unlessExists: boolean };
expectTypeOf(Roles.createRole("admin", createRoleOptions)).toEqualTypeOf<string | null>();
declare const optionalCreateRoleOptions: { unlessExists?: boolean };
expectTypeOf(Roles.createRole("admin", optionalCreateRoleOptions)).toEqualTypeOf<string | null>();
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
