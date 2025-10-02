import { Tinytest } from "meteor/tinytest";
import { Email, MailComposer } from "meteor/email";

Tinytest.add("Email - TypeScript types - sendAsync options", (test) => {
  // Type check that sendAsync accepts proper options
  const options = {
    from: "sender@example.com",
    to: "recipient@example.com",
    subject: "Test Email",
    text: "This is a test email"
  };

  // This ensures the type signature is correct
  const sendPromise: Promise<void> = Email.sendAsync(options);
  test.equal(typeof sendPromise.then, "function");
});

Tinytest.add("Email - TypeScript types - sendAsync with html", (test) => {
  const options = {
    from: "sender@example.com",
    to: "recipient@example.com",
    subject: "Test Email",
    html: "<p>This is a test email</p>"
  };

  const sendPromise: Promise<void> = Email.sendAsync(options);
  test.equal(typeof sendPromise.then, "function");
});

Tinytest.add("Email - TypeScript types - sendAsync with attachments", (test) => {
  const options = {
    from: "sender@example.com",
    to: "recipient@example.com",
    subject: "Test Email",
    text: "Email with attachment",
    attachments: [
      {
        filename: "test.txt",
        content: "Test content"
      }
    ]
  };

  const sendPromise: Promise<void> = Email.sendAsync(options);
  test.equal(typeof sendPromise.then, "function");
});

Tinytest.add("Email - TypeScript types - hookSend", (test) => {
  Email.hookSend((options) => {
    const from: string | undefined = options.from as string | undefined;
    test.equal(typeof options, "object");
    return true;
  });

  test.equal(true, true);
});

Tinytest.add("Email - TypeScript types - customTransport", (test) => {
  Email.customTransport((options) => {
    const settings: unknown = options.packageSettings;
    test.equal(typeof options, "object");
  });

  test.equal(true, true);
});

Tinytest.add("Email - TypeScript types - MailComposer constructor", (test) => {
  const composer: MailComposer = new MailComposer({
    escapeSMTP: true,
    encoding: "utf8",
    charset: "utf-8",
    keepBcc: false,
    forceEmbeddedImages: false
  });

  test.equal(typeof composer, "object");
});

Tinytest.add("Email - TypeScript types - MailComposer methods", (test) => {
  const composer: MailComposer = new MailComposer({
    escapeSMTP: true,
    encoding: "utf8",
    charset: "utf-8",
    keepBcc: false,
    forceEmbeddedImages: false
  });

  composer.addHeader("X-Custom-Header", "value");
  test.equal(typeof composer.addHeader, "function");
  test.equal(typeof composer.setMessageOption, "function");
  test.equal(typeof composer.streamMessage, "function");
});

Tinytest.add("Email - TypeScript types - send options with multiple recipients", (test) => {
  const options = {
    from: "sender@example.com",
    to: ["recipient1@example.com", "recipient2@example.com"],
    cc: "cc@example.com",
    bcc: ["bcc1@example.com", "bcc2@example.com"],
    subject: "Test Email",
    text: "Multiple recipients"
  };

  const sendPromise: Promise<void> = Email.sendAsync(options);
  test.equal(typeof sendPromise.then, "function");
});
