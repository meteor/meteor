import { expectTypeOf } from "expect-type";
import { Reload } from "./reload";

expectTypeOf(Reload).toBeObject();

expectTypeOf(Reload._onMigrate).toBeFunction();
expectTypeOf(Reload._migrationData).parameters.toEqualTypeOf<[string]>();
expectTypeOf(Reload._getData).returns.toEqualTypeOf<string | null>();
expectTypeOf(Reload._migrate).toBeFunction();
expectTypeOf(Reload._migrate).parameter(0).toEqualTypeOf<() => void>();
expectTypeOf(Reload._migrate).returns.toBeVoid();
expectTypeOf(Reload._reload).returns.toBeVoid();

// --- MigrationCallback (type)
expectTypeOf<Reload.MigrationCallback>().toEqualTypeOf<(retry: () => void) => [boolean, unknown?]>();
