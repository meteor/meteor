var Future = Npm.require('fibers/future');
var urlModule = Npm.require('url');
var SMTPConnection = Npm.require('smtp-connection');

Email = {};
EmailTest = {};

EmailInternals = {
  NpmModules: {
    mailcomposer: {
      version: Npm.require('mailcomposer/package.json').version,
      module: Npm.require('mailcomposer')
    }
  }
};

var mailcomposer = EmailInternals.NpmModules.mailcomposer.module;

var makePool = function (mailUrlString) {
  var mailUrl = urlModule.parse(mailUrlString);
  if (mailUrl.protocol !== 'smtp:' && mailUrl.protocol !== 'smtps:')
    throw new Error("Email protocol in $MAIL_URL (" +
                    mailUrlString + ") must be 'smtp' or 'smtps'");

  var port = +(mailUrl.port);
  var auth = false;
  if (mailUrl.auth) {
    var parts = mailUrl.auth.split(':', 2);
    auth = {user: parts[0],
            pass: parts[1]};
  }

  var pool = new SMTPConnection({
    port: port,  // Defaults to 25
    host: mailUrl.hostname,  // Defaults to "localhost"
    secure: (port === 465) || (mailUrl.protocol === 'smtps:')
  });
  Meteor.wrapAsync(pool.connect, pool)();
  if (auth) {
      //_.bind(Future.wrap(pool.login), pool)(auth).wait();
      Meteor.wrapAsync(pool.login, pool)(auth);
  }

  pool._syncSend = Meteor.wrapAsync(pool.send, pool);
  return pool;
};

var getPool = function() {
  // We delay this check until the first call to Email.send, in case someone
  // set process.env.MAIL_URL in startup code. Then we store in a cache until
  // process.env.MAIL_URL changes.
  var url = process.env.MAIL_URL;
  if (this.cacheKey === undefined || this.cacheKey !== url) {
    this.cacheKey = url;
    this.cache = url ? makePool(url) : null;
  }
  return this.cache;
}

var next_devmode_mail_id = 0;
var output_stream = process.stdout;

// Testing hooks
EmailTest.overrideOutputStream = function (stream) {
  next_devmode_mail_id = 0;
  output_stream = stream;
};

EmailTest.restoreOutputStream = function () {
  output_stream = process.stdout;
};

var devModeSend = function (mc) {
  var devmode_mail_id = next_devmode_mail_id++;

  var stream = output_stream;

  // This approach does not prevent other writers to stdout from interleaving.
  stream.write("====== BEGIN MAIL #" + devmode_mail_id + " ======\n");
  stream.write("(Mail not sent; to enable sending, set the MAIL_URL " +
               "environment variable.)\n");
  var readStream = mc.createReadStream();
  readStream.pipe(stream, {end: false});
  var future = new Future;
  readStream.on('end', function () {
    stream.write("====== END MAIL #" + devmode_mail_id + " ======\n");
    future.return();
  });
  future.wait();
};

var smtpSend = function (pool, mc) {
  pool._syncSend(mc.getEnvelope(), mc.createReadStream());
};

/**
 * Mock out email sending (eg, during a test.) This is private for now.
 *
 * f receives the arguments to Email.send and should return true to go
 * ahead and send the email (or at least, try subsequent hooks), or
 * false to skip sending.
 */
var sendHooks = [];
EmailTest.hookSend = function (f) {
  sendHooks.push(f);
};

// Old comment below
/**
 * Send an email.
 *
 * Connects to the mail server configured via the MAIL_URL environment
 * variable. If unset, prints formatted message to stdout. The "from" option
 * is required, and at least one of "to", "cc", and "bcc" must be provided;
 * all other options are optional.
 *
 * @param options
 * @param options.from {String} RFC5322 "From:" address
 * @param options.to {String|String[]} RFC5322 "To:" address[es]
 * @param options.cc {String|String[]} RFC5322 "Cc:" address[es]
 * @param options.bcc {String|String[]} RFC5322 "Bcc:" address[es]
 * @param options.replyTo {String|String[]} RFC5322 "Reply-To:" address[es]
 * @param options.subject {String} RFC5322 "Subject:" line
 * @param options.text {String} RFC5322 mail body (plain text)
 * @param options.html {String} RFC5322 mail body (HTML)
 * @param options.headers {Object} custom RFC5322 headers (dictionary)
 */

// New API doc comment below
/**
 * @summary Send an email. Throws an `Error` on failure to contact mail server
 * or if mail server returns an error. All fields should match
 * [RFC5322](http://tools.ietf.org/html/rfc5322) specification.
 *
 * If the `MAIL_URL` environment variable is set, actually sends the email.
 * Otherwise, prints the contents of the email to standard out.
 *
 * Note that this package is based on mailcomposer version `4.0.1`, so make
 * sure to refer to the documentation for that version if using the
 * `attachments` or `mailComposer` options.
 * [Click here to read the mailcomposer 4.0.1 docs](https://github.com/nodemailer/mailcomposer/blob/v4.0.1/README.md).
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
 * @param {Object} [options.headers] Dictionary of custom headers
 * @param {Object[]} [options.attachments] Array of attachment objects, as
 * described in the [mailcomposer documentation](https://github.com/nodemailer/mailcomposer/blob/v4.0.1/README.md#attachments).
 * @param {MailComposer} [options.mailComposer] A [MailComposer](https://github.com/andris9/mailcomposer)
 * object (or its `compile()` output) representing the message to be sent.
 * Overrides all other options. You can access the `mailcomposer` npm module at
 * `EmailInternals.NpmModules.mailcomposer.module`. This module is a function
 * which assembles a MailComposer object and immediately `compile()`s it.
 * Alternatively, you can create and pass a MailComposer object via
 * `new EmailInternals.NpmModules.mailcomposer.module.MailComposer`.
 */
Email.send = function (options) {
  for (var i = 0; i < sendHooks.length; i++)
    if (! sendHooks[i](options))
      return;

  var mc;
  if (options.mailComposer) {
    mc = options.mailComposer;
    if (mc.compile) {
      mc = mc.compile();
    }
  } else {
    // mailcomposer now automatically adds date if omitted
    //if (!options.hasOwnProperty('date') &&
    //    (!options.headers || !options.headers.hasOwnProperty('Date'))) {
    //  options['date'] = new Date().toUTCString().replace(/GMT/, '+0000');
    //}

    mc = mailcomposer(options);
  }

  var pool = getPool();
  if (pool) {
    smtpSend(pool, mc);
  } else {
    devModeSend(mc);
  }
};
