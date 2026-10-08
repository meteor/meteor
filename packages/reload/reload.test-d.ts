import { expectTypeOf } from "expect-type";
import { Reload } from "./reload";

expectTypeOf(Reload).toBeObject();

expectTypeOf(Reload._onMigrate).toBeFunction();
expectTypeOf(Reload._migrationData).parameters.toEqualTypeOf<[string]>();
expectTypeOf(Reload._getData).returns.toEqualTypeOf<string | null>();
expectTypeOf(Reload._migrate).toBeFunction();
expectTypeOf(Reload._migrate).parameter(0).toEqualTypeOf<(() => void) | undefined>();
expectTypeOf(Reload._migrate).returns.toBeBoolean();
// The retry callback is optional at runtime (#14815).
expectTypeOf(Reload._migrate()).toBeBoolean();
expectTypeOf(Reload._migrate(undefined, { immediateMigration: true })).toBeBoolean();
expectTypeOf(Reload._reload).returns.toBeVoid();

// --- MigrationCallback (type)
expectTypeOf<Reload.MigrationCallback>().toEqualTypeOf<(retry: () => void) => [boolean, unknown?]>();
