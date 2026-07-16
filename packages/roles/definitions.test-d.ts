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
