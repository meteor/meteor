var Future = Npm.require('fibers/future');
var urlModule = Npm.require('url');

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

var MailComposer = EmailInternals.NpmModules.mailcomposer.module.MailComposer;

var makePool = function (mailUrlString) {
  var mailUrl = urlModule.parse(mailUrlString);
  if (mailUrl.protocol !== 'smtp:')
    throw new Error("Email protocol in $MAIL_URL (" +
                    mailUrlString + ") must be 'smtp'");

  var port = +(mailUrl.port);
  var auth = false;
  if (mailUrl.auth) {
    var parts = mailUrl.auth.split(':', 2);
    auth = {user: parts[0] && decodeURIComponent(parts[0]),
            pass: parts[1] && decodeURIComponent(parts[1])};
  }

  var simplesmtp = Npm.require('simplesmtp');
  var pool = simplesmtp.createClientPool(
    port,  // Defaults to 25
    mailUrl.hostname,  // Defaults to "localhost"
    { secureConnection: (port === 465),
      // XXX allow maxConnections to be configured?
      auth: auth });

  pool._future_wrapped_sendMail = _.bind(Future.wrap(pool.sendMail), pool);
  return pool;
};

var getPool = _.once(function () {
  // We delay this check until the first call to Email.send, in case someone
  // set process.env.MAIL_URL in startup code.
  var url = process.env.MAIL_URL;
  if (! url)
    return null;
  return makePool(url);
});

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
  mc.streamMessage();
  mc.pipe(stream, {end: false});
  var future = new Future;
  mc.on('end', function () {
    stream.write("====== END MAIL #" + devmode_mail_id + " ======\n");
    future['return']();
  });
  future.wait();
};

var smtpSend = function (pool, mc) {
  pool._future_wrapped_sendMail(mc).wait();
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
 * Note that this package is based on mailcomposer version `0.1.15`, so make
 * sure to refer to the documentation for that version if using the
 * `attachments` or `mailComposer` options.
 * [Click here to read the mailcomposer 0.1.15 docs](https://github.com/andris9/mailcomposer/blob/7c0422b2de2dc61a60ba27cfa3353472f662aeb5/README.md).
 *
 * @locus Server
 * @param {Object} options
 * @param {String} options.from "From:" address (required)
 * @param {String|String[]} options.to,cc,bcc,replyTo
 *   "To:", "Cc:", "Bcc:", and "Reply-To:" addresses
 * @param {String} [options.subject]  "Subject:" line
 * @param {String} [options.text|html] Mail body (in plain text and/or HTML)
 * @param {Object} [options.headers] Dictionary of custom headers
 * @param {Object[]} [options.attachments] Array of attachment objects, as
 * described in the [mailcomposer documentation](https://github.com/andris9/mailcomposer/blob/7c0422b2de2dc61a60ba27cfa3353472f662aeb5/README.md#add-attachments).
 * @param {MailComposer} [options.mailComposer] A [MailComposer](https://github.com/andris9/mailcomposer)
 * object representing the message to be sent. Overrides all other options. You
 * can access the `mailcomposer` npm module at
 * `EmailInternals.NpmModules.mailcomposer.module`.
 */
Email.send = function (options) {
  for (var i = 0; i < sendHooks.length; i++)
    if (! sendHooks[i](options))
      return;

  var mc;
  if (options.mailComposer) {
    mc = options.mailComposer;
  } else {
    mc = new MailComposer();

    // setup message data
    mc.setMessageOption({
      from: options.from,
      to: options.to,
      cc: options.cc,
      bcc: options.bcc,
      replyTo: options.replyTo,
      subject: options.subject,
      text: options.text,
      html: options.html
    });

    _.each(options.headers, function (value, name) {
      mc.addHeader(name, value);
    });

    _.each(options.attachments, function(attachment){
      mc.addAttachment(attachment);
    });
  }

  var pool = getPool();
  if (pool) {
    smtpSend(pool, mc);
  } else {
    devModeSend(mc);
  }
};
