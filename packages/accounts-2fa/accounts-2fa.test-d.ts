import { expectTypeOf } from "expect-type";
import type { TwoFactorActivationData } from "./accounts-2fa";

expectTypeOf<TwoFactorActivationData>().toEqualTypeOf<{
  svg: string;
  secret: string;
  uri: string;
}>();
