var streamBuffers = Npm.require('stream-buffers');

var devWarningBanner = "(Mail not sent; to enable " +
  "sending, set the MAIL_URL environment variable.)\n";

function smokeEmailTest(testFunction) {
  // This only tests dev mode, so don't run the test if this is deployed.
  if (process.env.MAIL_URL) return;

  try {
    var stream = new streamBuffers.WritableStreamBuffer;
    EmailTest.overrideOutputStream(stream);

    testFunction(stream);

  } finally {
    EmailTest.restoreOutputStream();
  }
}

Tinytest.add("email - fully customizable", function (test) {
  smokeEmailTest(function(stream) {
    Email.send({
      from: "foo@example.com",
      to: "bar@example.com",
      cc: ["friends@example.com", "enemies@example.com"],
      subject: "This is the subject",
      text: "This is the body\nof the message\nFrom us.",
      headers: {
        'X-Meteor-Test': 'a custom header',
        'Date': 'dummy',
      },
    });
    // XXX brittle if mailcomposer changes header order, etc
    test.equal(stream.getContentsAsString("utf8"),
               "====== BEGIN MAIL #0 ======\n" +
               devWarningBanner +
               "MIME-Version: 1.0\r\n" +
               "X-Meteor-Test: a custom header\r\n" +
               "Date: dummy\r\n" +
               "From: foo@example.com\r\n" +
               "To: bar@example.com\r\n" +
               "Cc: friends@example.com, enemies@example.com\r\n" +
               "Subject: This is the subject\r\n" +
               "Content-Type: text/plain; charset=utf-8\r\n" +
               "Content-Transfer-Encoding: quoted-printable\r\n" +
               "\r\n" +
               "This is the body\r\n" +
               "of the message\r\n" +
               "From us.\r\n" +
               "====== END MAIL #0 ======\n");
  });
});

Tinytest.add("email - undefined headers sends properly", function (test) {
  smokeEmailTest(function (stream) {
    Email.send({
      from: "foo@example.com",
      to: "bar@example.com",
      subject: "This is the subject",
      text: "This is the body\nof the message\nFrom us.",
    });

    test.matches(stream.getContentsAsString("utf8"),
      /^====== BEGIN MAIL #0 ======$[\s\S]+^To: bar@example.com$/m);
  });
});

Tinytest.add("email - multiple e-mails same stream", function (test) {
  smokeEmailTest(function (stream) {
    // Test if date header is automaticall generated, if not specified
    Email.send({
      from: "foo@example.com",
      to: "bar@example.com",
      subject: "This is the subject",
      text: "This is the body\nof the message\nFrom us.",
    });

    var contents;

    contents = stream.getContentsAsString("utf8");
    test.matches(contents, /^====== BEGIN MAIL #0 ======$/m);
    test.matches(contents, /^From: foo@example.com$/m);
    test.matches(contents, /^To: bar@example.com$/m);

    Email.send({
      from: "qux@example.com",
      to: "baz@example.com",
      subject: "This is important",
      text: "This is another message\nFrom Qux.",
    });

    contents = stream.getContentsAsString("utf8");
    test.matches(contents, /^====== BEGIN MAIL #1 ======$/m);
    test.matches(contents, /^From: qux@example.com$/m);
    test.matches(contents, /^To: baz@example.com$/m);

  });
});

Tinytest.add("email - using mail composer", function (test) {
  smokeEmailTest(function (stream) {
    // Test direct MailComposer usage.
    var mc = new EmailInternals.NpmModules.mailcomposer.module.MailComposer;
    mc.setMessageOption({
      from: "a@b.com",
      text: "body"
    });
    Email.send({mailComposer: mc});
    test.equal(stream.getContentsAsString("utf8"),
               "====== BEGIN MAIL #0 ======\n" +
               devWarningBanner +
               "MIME-Version: 1.0\r\n" +
               "From: a@b.com\r\n" +
               "Content-Type: text/plain; charset=utf-8\r\n" +
               "Content-Transfer-Encoding: quoted-printable\r\n" +
               "\r\n" +
               "body\r\n" +
               "====== END MAIL #0 ======\n");
  });
});

Tinytest.add("email - date auto generated", function (test) {
  smokeEmailTest(function (stream) {
    // Test if date header is automaticall generated, if not specified
    Email.send({
      from: "foo@example.com",
      to: "bar@example.com",
      subject: "This is the subject",
      text: "This is the body\nof the message\nFrom us.",
      headers: {
        'X-Meteor-Test': 'a custom header',
      },
    });

    test.matches(stream.getContentsAsString("utf8"),
                 /^Date: .+$/m);
  });
});
