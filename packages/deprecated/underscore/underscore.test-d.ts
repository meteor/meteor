import { expectTypeOf } from "expect-type";
import { _ } from "./underscore";

expectTypeOf(_).not.toBeNever();
