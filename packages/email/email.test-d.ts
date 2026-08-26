import { expectTypeOf } from "expect-type";
import { Email } from "./email";
import type {
  MailComposerOptions,
  MailComposerStatic,
  MailComposer as MailComposerType,
} from "./email";

expectTypeOf(Email).toBeObject();
// MailComposer is a type only (not a runtime export of meteor/email).
expectTypeOf<MailComposerStatic>().toBeObject();
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
// hookSend returns an unregister handle
expectTypeOf(Email.hookSend).returns.toMatchTypeOf<{ stop: () => void }>();
// customTransport is a settable, optionally-undefined property
expectTypeOf(Email.customTransport).toEqualTypeOf<
  ((options: Email.CustomEmailOptions) => unknown) | undefined
>();
