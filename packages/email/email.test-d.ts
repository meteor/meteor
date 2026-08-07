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

// --- Email namespace options types ---
expectTypeOf<Email.ExtraMailOptions>().toBeObject();
expectTypeOf<Email.EmailOptions>().not.toBeAny();
expectTypeOf<Email.CustomEmailOptions>().not.toBeAny();

// --- Email namespace functions ---
expectTypeOf(Email.send).toBeFunction();
expectTypeOf(Email.sendAsync).toBeFunction();
expectTypeOf(Email.hookSend).toBeFunction();
expectTypeOf(Email.customTransport).toBeFunction();
