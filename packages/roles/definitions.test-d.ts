import { expectTypeOf } from "expect-type";
import { Roles } from "./definitions";
import type { RolesCollection, RoleAssignmentsCollection } from "./definitions";

expectTypeOf(Roles).toBeObject();
expectTypeOf<RolesCollection>().toBeObject();
expectTypeOf<RoleAssignmentsCollection>().toBeObject();
