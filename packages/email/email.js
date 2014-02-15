var Future = Npm.require('fibers/future');
var urlModule = Npm.require('url');
var MailComposer = Npm.require('mailcomposer').MailComposer;

Email = {};
EmailTest = {};

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

// We construct smtpPool at the first call to Email.send, so that
// Meteor.startup code can set $MAIL_URL.
var smtpPoolFuture = new Future;;
var configured = false;

var getPool = function () {
  // We check MAIL_URL in case someone else set it in Meteor.startup code.
  if (!configured) {
    configured = true;
    AppConfig.configurePackage('email', function (config) {
      // XXX allow reconfiguration when the app config changes
      if (smtpPoolFuture.isResolved())
        return;
      var url = config.url || process.env.MAIL_URL;
      var pool = null;
      if (url)
        pool = makePool(url);
      smtpPoolFuture.return(pool);
    });
  }

  return smtpPoolFuture.wait();
};

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

  // Make sure we use whatever stream was set at the time of the Email.send
  // call even in the 'end' callback, in case there are multiple concurrent
  // test runs.
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
Email.send = function (options) {
  for (var i = 0; i < sendHooks.length; i++)
    if (! sendHooks[i](options))
      return;

  var mc = new MailComposer();

  // setup message data
  // XXX support attachments (once we have a client/server-compatible binary
  //     Buffer class)
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

  var pool = getPool();
  if (pool) {
    smtpSend(pool, mc);
  } else {
    devModeSend(mc);
  }
};
