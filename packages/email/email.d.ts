import { Readable, Writable } from 'stream';
import { Url } from 'url';

// The types below are a self-contained copy of Mail.Options (aka
// SendMailOptions) from @types/nodemailer, matching the nodemailer version in
// package.js. We can't import from 'nodemailer' here: this .d.ts is shipped to
// apps (zodern:types) and resolves against the app's node_modules, where
// nodemailer isn't installed.

type Headers =
  | { [key: string]: string | string[] | { prepared: boolean; value: string } }
  | Array<{ key: string; value: string }>;

type ListHeader = string | { url: string; comment: string };

interface ListHeaders {
  [key: string]: ListHeader | ListHeader[] | ListHeader[][];
}

type TextEncoding = 'quoted-printable' | 'base64';

interface Address {
  name: string;
  address: string;
}

interface AttachmentLike {
  /** String, Buffer or a Stream contents for the attachment */
  content?: string | Buffer | Readable | undefined;
  /** path to a file or an URL (data uris are allowed as well) if you want to stream the file instead of including it (better for larger attachments) */
  path?: string | Url | undefined;
}

interface Attachment extends AttachmentLike {
  /** filename to be reported as the name of the attached file, use of unicode is allowed. If you do not want to use a filename, set this value as false, otherwise a filename is generated automatically */
  filename?: string | false | undefined;
  /** optional content id for using inline images in HTML message source. Using cid sets the default contentDisposition to 'inline' and moves the attachment into a multipart/related mime node, so use it only if you actually want to use this attachment as an embedded image */
  cid?: string | undefined;
  /** If set and content is string, then encodes the content to a Buffer using the specified encoding. Example values: base64, hex, binary etc. Useful if you want to use binary attachments in a JSON formatted e-mail object */
  encoding?: string | undefined;
  /** optional content type for the attachment, if not set will be derived from the filename property */
  contentType?: string | undefined;
  /** optional transfer encoding for the attachment, if not set it will be derived from the contentType property. Example values: quoted-printable, base64. If it is unset then base64 encoding is used for the attachment. If it is set to false then previous default applies (base64 for most, 7bit for text). */
  contentTransferEncoding?: '7bit' | 'base64' | 'quoted-printable' | false | undefined;
  /** optional content disposition type for the attachment, defaults to ‘attachment’ */
  contentDisposition?: 'attachment' | 'inline' | undefined;
  /** is an object of additional headers */
  headers?: Headers | undefined;
  /** an optional value that overrides entire node content in the mime message. If used then all other options set for this node are ignored. */
  raw?: string | Buffer | Readable | AttachmentLike | undefined;
}

interface AmpAttachment extends AttachmentLike {
  /** is an alternative for content to load the AMP4EMAIL data from an URL */
  href?: string | undefined;
  /** defines optional content encoding, eg. ‘base64’ or ‘hex’. This only applies if the content is a string. By default an unicode string is assumed. */
  encoding?: string | undefined;
  /** optional content type for the attachment, if not set will be derived from the filename property */
  contentType?: string | undefined;
  /** an optional value that overrides entire node content in the mime message. If used then all other options set for this node are ignored. */
  raw?: string | Buffer | Readable | AttachmentLike | undefined;
}

interface IcalAttachment extends AttachmentLike {
  /** optional method, case insensitive, defaults to ‘publish’. Other possible values would be ‘request’, ‘reply’, ‘cancel’ or any other valid calendar method listed in RFC5546. This should match the METHOD: value in calendar event file. */
  method?: string | undefined;
  /** optional filename, defaults to ‘invite.ics’ */
  filename?: string | false | undefined;
  /** is an alternative for content to load the calendar data from an URL */
  href?: string | undefined;
  /** defines optional content encoding, eg. ‘base64’ or ‘hex’. This only applies if the content is a string. By default an unicode string is assumed. */
  encoding?: string | undefined;
}

interface Envelope {
  /** the first address gets used as MAIL FROM address in SMTP */
  from?: string | undefined;
  /** addresses from this value get added to RCPT TO list */
  to?: string | undefined;
  /** addresses from this value get added to RCPT TO list */
  cc?: string | undefined;
  /** addresses from this value get added to RCPT TO list */
  bcc?: string | undefined;
}

/** MimeNode.Envelope in @types/nodemailer */
interface MimeNodeEnvelope {
  /** includes an address object or is set to false */
  from: string | false;
  /** includes an array of address objects */
  to: string[];
}

interface DKIMOptionalOptions {
  /** optional location for cached messages. If not set then caching is not used. */
  cacheDir?: string | false | undefined;
  /** optional size in bytes, if message is larger than this treshold it gets cached to disk (assuming cacheDir is set and writable). Defaults to 131072 (128 kB). */
  cacheTreshold?: number | undefined;
  /** optional algorithm for the body hash, defaults to ‘sha256’ */
  hashAlgo?: string | undefined;
  /** an optional colon separated list of header keys to sign (eg. message-id:date:from:to...') */
  headerFieldNames?: string | undefined;
  /** optional colon separated list of header keys not to sign. This is useful if you want to sign all the relevant keys but your provider changes some values, ie Message-ID and Date. In this case you should use 'message-id:date' to prevent signing these values. */
  skipFields?: string | undefined;
}

interface DKIMSingleKeyOptions extends DKIMOptionalOptions {
  /** is the domain name to use in the signature */
  domainName: string;
  /** is the DKIM key selector */
  keySelector: string;
  /** is the private key for the selector in PEM format */
  privateKey: string | { key: string; passphrase: string };
}

interface DKIMMultipleKeysOptions extends DKIMOptionalOptions {
  /** is an optional array of key objects (domainName, keySelector, privateKey) if you want to add more than one signature to the message. If this value is set then the default key values are ignored */
  keys: DKIMSingleKeyOptions[];
}

type DKIMOptions = DKIMSingleKeyOptions | DKIMMultipleKeysOptions;

interface SendMailOptions {
  /** The e-mail address of the sender. All e-mail addresses can be plain 'sender@server.com' or formatted 'Sender Name <sender@server.com>' */
  from?: string | Address | Array<string | Address> | undefined;
  /** An e-mail address that will appear on the Sender: field */
  sender?: string | Address | undefined;
  /** Comma separated list or an array of recipients e-mail addresses that will appear on the To: field */
  to?: string | Address | Array<string | Address> | undefined;
  /** Comma separated list or an array of recipients e-mail addresses that will appear on the Cc: field */
  cc?: string | Address | Array<string | Address> | undefined;
  /** Comma separated list or an array of recipients e-mail addresses that will appear on the Bcc: field */
  bcc?: string | Address | Array<string | Address> | undefined;
  /** Comma separated list or an array of e-mail addresses that will appear on the Reply-To: field */
  replyTo?: string | Address | Array<string | Address> | undefined;
  /** The message-id this message is replying */
  inReplyTo?: string | Address | undefined;
  /** Message-id list (an array or space separated string) */
  references?: string | string[] | undefined;
  /** The subject of the e-mail */
  subject?: string | undefined;
  /** The plaintext version of the message */
  text?: string | Buffer | Readable | AttachmentLike | undefined;
  /** The HTML version of the message */
  html?: string | Buffer | Readable | AttachmentLike | undefined;
  /** Apple Watch specific HTML version of the message, same usage as with text and html */
  watchHtml?: string | Buffer | Readable | AttachmentLike | undefined;
  /** AMP4EMAIL specific HTML version of the message, same usage as with text and html. Make sure it is a full and valid AMP4EMAIL document, otherwise the displaying email client falls back to html and ignores the amp part */
  amp?: string | Buffer | Readable | AmpAttachment | undefined;
  /** iCalendar event, same usage as with text and html. Event method attribute defaults to ‘PUBLISH’ or define it yourself: {method: 'REQUEST', content: iCalString}. This value is added as an additional alternative to html or text. Only utf-8 content is allowed */
  icalEvent?: string | Buffer | Readable | IcalAttachment | undefined;
  /** An object or array of additional header fields */
  headers?: Headers | undefined;
  /** An object where key names are converted into list headers. List key help becomes List-Help header etc. */
  list?: ListHeaders | undefined;
  /** An array of attachment objects */
  attachments?: Attachment[] | undefined;
  /** An array of alternative text contents (in addition to text and html parts) */
  alternatives?: Attachment[] | undefined;
  /** optional SMTP envelope, if auto generated envelope is not suitable */
  envelope?: Envelope | MimeNodeEnvelope | undefined;
  /** optional Message-Id value, random value will be generated if not set */
  messageId?: string | undefined;
  /** optional Date value, current UTC string will be used if not set */
  date?: Date | string | undefined;
  /** optional transfer encoding for the textual parts */
  encoding?: string | undefined;
  /** if set then overwrites entire message output with this value. The value is not parsed, so you should still set address headers or the envelope value for the message to work */
  raw?: string | Buffer | Readable | AttachmentLike | undefined;
  /** set explicitly which encoding to use for text parts (quoted-printable or base64). If not set then encoding is detected from text content (mostly ascii means quoted-printable, otherwise base64) */
  textEncoding?: TextEncoding | undefined;
  /** if set to true then fails with an error when a node tries to load content from URL */
  disableUrlAccess?: boolean | undefined;
  /** if set to true then fails with an error when a node tries to load content from a file */
  disableFileAccess?: boolean | undefined;
  /** is an object with DKIM options */
  dkim?: DKIMOptions | undefined;
  /** method to normalize header keys for custom caseing */
  normalizeHeaderKey?(key: string): string;
  priority?: 'high' | 'normal' | 'low' | undefined;
  /** if set to true then converts data:images in the HTML content of message to embedded attachments */
  attachDataUrls?: boolean | undefined;
  /** if set to false then removes x-mailer header, otherwise replaces the default x-mailer header value */
  xMailer?: false | string;
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
