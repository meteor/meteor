import { Writable } from 'stream';

interface Address {
  name?: string;
  address: string;
}

interface SendMailOptions {
  from?: string | Address;
  to?: string | Address | (string | Address)[];
  cc?: string | Address | (string | Address)[];
  bcc?: string | Address | (string | Address)[];
  replyTo?: string | Address;
  subject?: string;
  text?: string;
  html?: string;
  headers?: Record<string, string | string[]>;
  attachments?: Array<{
    filename?: string;
    content?: string | Buffer;
    path?: string;
    contentType?: string;
    encoding?: string;
    cid?: string;
  }>;
  messageId?: string;
  [key: string]: unknown;
}

export namespace Email {
  /**
   * ExtraMailOptions is intentionally left empty here, but can be overridden in
   * your application if desired. This should not be necessary if you're using
   * the default mail transport, but if you're using a custom transport or have
   * configured hooks which accept additional options, you may need to define
   * this interface to match your custom options.
   */
  interface ExtraMailOptions {}
  type EmailOptions = { mailComposer: MailComposer } | (ExtraMailOptions & SendMailOptions)

  type CustomEmailOptions = EmailOptions & {
    packageSettings?: unknown;
  }

  /** @deprecated */
  function send(options: EmailOptions): void;
  function sendAsync(options: EmailOptions): Promise<void>;
  /** Register a send hook. Returns a handle to unregister it. */
  function hookSend(
    fn: (options: EmailOptions) => boolean
  ): { stop: () => void; callback: (options: EmailOptions) => boolean };
  /**
   * A settable transport that, when assigned, replaces the default mail
   * delivery. Unset (`undefined`) by default.
   */
  var customTransport: ((options: CustomEmailOptions) => unknown) | undefined;
}

export interface MailComposerOptions {
  escapeSMTP: boolean;
  encoding: string;
  charset: string;
  keepBcc: boolean;
  forceEmbeddedImages: boolean;
}

// NOTE: MailComposer is NOT a top-level export of `meteor/email` — the package
// only exports `Email` and `EmailInternals` (package.js). The npm constructor is
// reachable via `EmailInternals.NpmModules.mailcomposer.module`. The types below
// describe that constructor/instance shape for reference.
export interface MailComposerStatic {
  new (options?: MailComposerOptions | null): MailComposer;
}

export interface MailComposer {
  addHeader(name: string, value: string): void;
  setMessageOption(from: string, to: string, body: string, html: string): void;
  streamMessage(): void;
  pipe(stream: Writable): void;
}
