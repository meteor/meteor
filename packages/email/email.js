import { Meteor } from 'meteor/meteor';
import { Log } from 'meteor/logging';
import { Hook } from 'meteor/callback-hook';

import Future from 'fibers/future';
import url from 'url';
import nodemailer from 'nodemailer';
import wellKnow from 'nodemailer/lib/well-known';

export const Email = {};
export const EmailTest = {};

export const EmailInternals = {
  NpmModules: {
    mailcomposer: {
      version: Npm.require('nodemailer/package.json').version,
      module: Npm.require('nodemailer/lib/mail-composer'),
    },
    nodemailer: {
      version: Npm.require('nodemailer/package.json').version,
      module: Npm.require('nodemailer'),
    },
  },
};

const MailComposer = EmailInternals.NpmModules.mailcomposer.module;

const makeTransport = function(mailUrlString) {
  const mailUrl = new URL(mailUrlString);

  if (mailUrl.protocol !== 'smtp:' && mailUrl.protocol !== 'smtps:') {
    throw new Error(
      'Email protocol in $MAIL_URL (' +
        mailUrlString +
        ") must be 'smtp' or 'smtps'"
    );
  }

  if (mailUrl.protocol === 'smtp:' && mailUrl.port === '465') {
    Log.debug(
      "The $MAIL_URL is 'smtp://...:465'.  " +
        "You probably want 'smtps://' (The 's' enables TLS/SSL) " +
        "since '465' is typically a secure port."
    );
  }

  // Allow overriding pool setting, but default to true.
  if (!mailUrl.query) {
    mailUrl.query = {};
  }

  if (!mailUrl.query.pool) {
    mailUrl.query.pool = 'true';
  }

  const transport = nodemailer.createTransport(url.format(mailUrl));

  transport._syncSendMail = Meteor.wrapAsync(transport.sendMail, transport);
  return transport;
};

// More info: https://nodemailer.com/smtp/well-known/
const knownHostsTransport = function(settings = undefined, url = undefined) {
  let service, user, password;

  const hasSettings = settings && Object.keys(settings).length;

  if (url && !hasSettings) {
    let host = url.split(':')[0];
    const urlObject = new URL(url);
    if (host === 'http' || host === 'https') {
      // Look to hostname for service
      host = urlObject.hostname;
      user = urlObject.username;
      password = urlObject.password;
    } else if (urlObject.protocol && urlObject.username && urlObject.password) {
      // We have some data from urlObject
      host = urlObject.protocol.split(':')[0];
      user = urlObject.username;
      password = urlObject.password;
    } else {
      // We need to disect the URL ourselves to get the data
      // First get rid of the leading '//' and split to username and the rest
      const temp = urlObject.pathname.substring(2)?.split(':');
      user = temp[0];
      // Now we split by '@' to get password and hostname
      const temp2 = temp[1].split('@');
      password = temp2[0];
      host = temp2[1];
    }
    service = host;
  }

  if (!wellKnow(settings?.service || service)) {
    throw new Error(
      'Could not recognize e-mail service. See list at https://nodemailer.com/smtp/well-known/ for services that we can configure for you.'
    );
  }

  const transport = nodemailer.createTransport({
    service: settings?.service || service,
    auth: {
      user: settings?.user || user,
      pass: settings?.password || password,
    },
  });

  transport._syncSendMail = Meteor.wrapAsync(transport.sendMail, transport);
  return transport;
};
EmailTest.knowHostsTransport = knownHostsTransport;

const getTransport = function() {
  const packageSettings = Meteor.settings.packages?.email || {};
  // We delay this check until the first call to Email.send, in case someone
  // set process.env.MAIL_URL in startup code. Then we store in a cache until
  // process.env.MAIL_URL changes.
  const url = process.env.MAIL_URL;
  if (
    this.cacheKey === undefined ||
    this.cacheKey !== url ||
    this.cacheKey !== packageSettings.service ||
    this.cacheKey !== 'settings'
  ) {
    if (
      (packageSettings.service && wellKnow(packageSettings.service)) ||
      (url && wellKnow(new URL(url).hostname)) ||
      wellKnow(url?.split(':')[0] || '')
    ) {
      this.cacheKey = packageSettings.service || 'settings';
      this.cache = knownHostsTransport(packageSettings, url);
    } else {
      this.cacheKey = url;
      this.cache = url ? makeTransport(url, packageSettings) : null;
    }
  }
  return this.cache;
};

let nextDevModeMailId = 0;
let output_stream = process.stdout;

// Testing hooks
EmailTest.overrideOutputStream = function(stream) {
  nextDevModeMailId = 0;
  output_stream = stream;
};

EmailTest.restoreOutputStream = function() {
  output_stream = process.stdout;
};

const devModeSend = function(mail) {
  let devModeMailId = nextDevModeMailId++;

  const stream = output_stream;

  // This approach does not prevent other writers to stdout from interleaving.
  stream.write('====== BEGIN MAIL #' + devModeMailId + ' ======\n');
  stream.write(
    '(Mail not sent; to enable sending, set the MAIL_URL ' +
      'environment variable.)\n'
  );
  const readStream = new MailComposer(mail).compile().createReadStream();
  readStream.pipe(stream, { end: false });
  const future = new Future();
  readStream.on('end', function() {
    stream.write('====== END MAIL #' + devModeMailId + ' ======\n');
    future.return();
  });
  future.wait();
};

const smtpSend = function(transport, mail) {
  transport._syncSendMail(mail);
};

const sendHooks = new Hook();

/**
 * @summary Hook that runs before email is sent.
 * @locus Server
 *
 * @param f {function} receives the arguments to Email.send and should return true to go
 * ahead and send the email (or at least, try subsequent hooks), or
 * false to skip sending.
 * @returns {{ stop: function, callback: function }}
 */
Email.hookSend = function(f) {
  return sendHooks.register(f);
};

/**
 * @summary Overrides sending function with your own.
 * @locus Server
 * @since 2.2
 * @param f {function} function that will receive options from the send function and under `packageSettings` will
 * include the package settings from Meteor.settings.packages.email for your custom transport to access.
 */
Email.customTransport = undefined;

/**
 * @summary Send an email. Throws an `Error` on failure to contact mail server
 * or if mail server returns an error. All fields should match
 * [RFC5322](http://tools.ietf.org/html/rfc5322) specification.
 *
 * If the `MAIL_URL` environment variable is set, actually sends the email.
 * Otherwise, prints the contents of the email to standard out.
 *
 * Note that this package is based on **nodemailer**, so make sure to refer to
 * [the documentation](http://nodemailer.com/)
 * when using the `attachments` or `mailComposer` options.
 *
 * @locus Server
 * @param {Object} options
 * @param {String} [options.from] "From:" address (required)
 * @param {String|String[]} options.to,cc,bcc,replyTo
 *   "To:", "Cc:", "Bcc:", and "Reply-To:" addresses
 * @param {String} [options.inReplyTo] Message-ID this message is replying to
 * @param {String|String[]} [options.references] Array (or space-separated string) of Message-IDs to refer to
 * @param {String} [options.messageId] Message-ID for this message; otherwise, will be set to a random value
 * @param {String} [options.subject]  "Subject:" line
 * @param {String} [options.text|html] Mail body (in plain text and/or HTML)
 * @param {String} [options.watchHtml] Mail body in HTML specific for Apple Watch
 * @param {String} [options.icalEvent] iCalendar event attachment
 * @param {Object} [options.headers] Dictionary of custom headers - e.g. `{ "header name": "header value" }`. To set an object under a header name, use `JSON.stringify` - e.g. `{ "header name": JSON.stringify({ tracking: { level: 'full' } }) }`.
 * @param {Object[]} [options.attachments] Array of attachment objects, as
 * described in the [nodemailer documentation](https://nodemailer.com/message/attachments/).
 * @param {MailComposer} [options.mailComposer] A [MailComposer](https://nodemailer.com/extras/mailcomposer/#e-mail-message-fields)
 * object representing the message to be sent.  Overrides all other options.
 * You can create a `MailComposer` object via
 * `new EmailInternals.NpmModules.mailcomposer.module`.
 */
Email.send = function(options) {
  if (options.mailComposer) {
    options = options.mailComposer.mail;
  }

  let send = true;
  sendHooks.forEach(hook => {
    send = hook(options);
    return send;
  });
  if (!send) return;

  const customTransport = Email.customTransport;
  if (customTransport) {
    const packageSettings = Meteor.settings.packages?.email || {};
    customTransport({ packageSettings, ...options });
    return;
  }

  const mailUrlEnv = process.env.MAIL_URL;
  const mailUrlSettings = Meteor.settings.packages?.email;

  if (Meteor.isProduction && !mailUrlEnv && !mailUrlSettings) {
    // This check is mostly necessary when using the flag --production when running locally.
    // And it works as a reminder to properly set the mail URL when running locally.
    throw new Error(
      'You have not provided a mail URL. You can provide it by using the environment variable MAIL_URL or your settings. You can read more about it here: https://docs.meteor.com/api/email.html.'
    );
  }

  if (mailUrlEnv || mailUrlSettings) {
    const transport = getTransport();
    smtpSend(transport, options);
    return;
  }
  devModeSend(options);
};
