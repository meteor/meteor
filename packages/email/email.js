Email = {};

var Future = Npm.require('fibers/future');
var urlModule = Npm.require('url');
var MailComposer = Npm.require('mailcomposer').MailComposer;

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
var smtpPool = null;
var maybeMakePool = function () {
  if (!smtpPool && process.env.MAIL_URL) {
    smtpPool = makePool(process.env.MAIL_URL);
  }
};

Email._next_devmode_mail_id = 0;

// Overridden by tests.
Email._output_stream = process.stdout;

var devModeSend = function (mc) {
  var devmode_mail_id = Email._next_devmode_mail_id++;

  // Make sure we use whatever stream was set at the time of the Email.send
  // call even in the 'end' callback, in case there are multiple concurrent
  // test runs.
  var stream = Email._output_stream;
  
  // This approach does not prevent other writers to stdout from interleaving.
  stream.write("====== BEGIN MAIL #" + devmode_mail_id + " ======\n");
  mc.streamMessage();
  mc.pipe(stream, {end: false});
  var future = new Future;
  mc.on('end', function () {
    stream.write("====== END MAIL #" + devmode_mail_id + " ======\n");
    future.ret();
  });
  future.wait();
};

var smtpSend = function (mc) {
  smtpPool._future_wrapped_sendMail(mc).wait();
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
 * @param options.attachments {Object[]} Array of attachment objects, with
 *        required key "contents" (String of attachment contents,
 *        base64-encoded) and optional keys "fileName" (the filename the
 *        client should save the attachment as), "contentType" (MIME type for
 *        the file; if unspecified and fileName is specified, will derive from
 *        fileName), and "cid" (the Content-Id which can be referenced from
 *        HTML IMG tags).
 */
Email.send = function (options) {
  var mc = new MailComposer();

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

  _.each(options.attachments, function (attachment) {
    var mcAttachment = _.pick(attachment, 'fileName', 'contentType', 'cid');
    // TODO: Now that we have EJSON binary,
    // we should support binary attachments
    mcAttachment.contents = new Buffer(attachment.contents, 'base64');
    mc.addAttachment(mcAttachment);

  maybeMakePool();

  if (smtpPool) {
    smtpSend(mc);
  } else {
    devModeSend(mc);
  }
};
