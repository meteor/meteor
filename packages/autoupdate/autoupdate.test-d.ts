import { expectTypeOf } from "expect-type";
import { Autoupdate } from "./autoupdate";

expectTypeOf(Autoupdate).toBeObject();

expectTypeOf(Autoupdate.appId).toEqualTypeOf<string | undefined>();
expectTypeOf(Autoupdate.autoupdateVersion).toEqualTypeOf<string | null>();
expectTypeOf(Autoupdate.autoupdateVersionRefreshable).toEqualTypeOf<string | null>();
expectTypeOf(Autoupdate.autoupdateVersionCordova).toEqualTypeOf<string | null>();
expectTypeOf(Autoupdate.newClientAvailable).returns.toBeBoolean();
