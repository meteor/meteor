import { expectTypeOf } from "expect-type";
import { Email, MailComposer } from "./email";
import type {
  MailComposerOptions,
  MailComposerStatic,
  MailComposer as MailComposerType,
} from "./email";

expectTypeOf(Email).toBeObject();
expectTypeOf(MailComposer).toMatchTypeOf<MailComposerStatic>();
expectTypeOf<MailComposerOptions>().toBeObject();
expectTypeOf<MailComposerType>().toBeObject();
