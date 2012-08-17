Email = {};

(function () {
  var Future = __meteor_bootstrap__.require('fibers/future');
  // js2-mode AST blows up when parsing 'future.return()', so alias.
  Future.prototype.ret = Future.prototype.return;
  var urlModule = __meteor_bootstrap__.require('url');
  var MailComposer = __meteor_bootstrap__.require('mailcomposer').MailComposer;

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

    var simplesmtp = __meteor_bootstrap__.require('simplesmtp');
    return simplesmtp.createClientPool(
      port,  // Defaults to 25
      mailUrl.hostname,  // Defaults to "localhost"
      { secureConnection: (port === 465),
        // XXX allow maxConnections to be configured?
        auth: auth });
  };

  var smtpPool = null;
  if (process.env.MAIL_URL) {
    smtpPool = makePool(process.env.MAIL_URL);
  };

  Email._next_devmode_mail_id = 0;

  // Overridden by tests.
  Email._output_stream = process.stdout;

  var devModeSend = function (mc) {
    var devmode_mail_id = Email._next_devmode_mail_id++;

    // This approach does not prevent other writers to stdout from interleaving.
    Email._output_stream.write("====== BEGIN MAIL #" + devmode_mail_id +
                               " ======\n");
    mc.streamMessage();
    mc.pipe(Email._output_stream, {end: false});
    var future = new Future;
    mc.on('end', function () {
      Email._output_stream.write("====== END MAIL #" + devmode_mail_id +
                                 " ======\n");
      future.ret();
    });
    future.wait();
  };

  var smtpSend = function (mc) {
    var future = new Future;
    smtpPool.sendMail(mc, function (err, responseObj) {
      future.ret([err, responseObj]);
    });
    var errAndResponse = future.wait();
    // XXX figure out error handling
    if (errAndResponse[0])
      throw errAndResponse[0];
    console.log(errAndResponse[1]);
  };

  /**
   * Send an email.
   *
   * Connects to the mail server configured via the MAIL_URL environment
   * variable. If unset, prints formatted message to stdout. May yield.
   *
   * @param options
   * @param options.from {String} RFC5322 "From:" address
   * @param options.to {String|String[]} RFC5322 "To:" address[es]
   * @param options.cc {String|String[]} RFC5322 "Cc:" address[es]
   * @param options.bcc {String|String[]} RFC5322 "Bcc:" address[es]
   * @param options.replyTo {String|String[]} RFC5322 "Reply-To:" address[es]
   * @param options.subject {String} RFC5322 "Subject:" line
   * @param options.text {String} RFC5322 mail body (plain text)
   */
  Email.send = function (options) {
    var mc = new MailComposer();

    // setup message data
    // XXX support HTML body
    // XXX support attachments
    // XXX support arbitrary headers
    mc.setMessageOption({
      from: options.from,
      to: options.to,
      cc: options.cc,
      bcc: options.bcc,
      replyTo: options.replyTo,
      subject: options.subject,
      text: options.text
    });

    if (smtpPool) {
      smtpSend(mc);
    } else {
      devModeSend(mc);
    }
  };

})();
