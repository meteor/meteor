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

function canonicalize(string) {
  // Remove generated content for test.equal to succeed.
  return string.replace(/Message-ID: <[^<>]*>\r\n/, "Message-ID: <...>\r\n")
               .replace(/Date: (?!dummy).*\r\n/, "Date: ...\r\n")
               .replace(/(boundary="|^--)--[^\s"]+?(-Part|")/mg, "$1--...$2");
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
    test.equal(canonicalize(stream.getContentsAsString("utf8")),
               "====== BEGIN MAIL #0 ======\n" +
               devWarningBanner +
               "Content-Type: text/plain\r\n" +
               "X-Meteor-Test: a custom header\r\n" +
               "Date: dummy\r\n" +
               "From: foo@example.com\r\n" +
               "To: bar@example.com\r\n" +
               "Cc: friends@example.com, enemies@example.com\r\n" +
               "Subject: This is the subject\r\n" +
               "Message-ID: <...>\r\n" +
               "Content-Transfer-Encoding: 7bit\r\n" +
               "MIME-Version: 1.0\r\n" +
               "\r\n" +
               "This is the body\n" +
               "of the message\n" +
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

    test.matches(canonicalize(stream.getContentsAsString("utf8")),
      /^====== BEGIN MAIL #0 ======$[\s\S]+^To: bar@example.com$/m);
  });
});

Tinytest.add("email - multiple e-mails same stream", function (test) {
  smokeEmailTest(function (stream) {
    Email.send({
      from: "foo@example.com",
      to: "bar@example.com",
      subject: "This is the subject",
      text: "This is the body\nof the message\nFrom us.",
    });

    var contents;

    contents = canonicalize(stream.getContentsAsString("utf8"));
    test.matches(contents, /^====== BEGIN MAIL #0 ======$/m);
    test.matches(contents, /^From: foo@example.com$/m);
    test.matches(contents, /^To: bar@example.com$/m);

    Email.send({
      from: "qux@example.com",
      to: "baz@example.com",
      subject: "This is important",
      text: "This is another message\nFrom Qux.",
    });

    contents = canonicalize(stream.getContentsAsString("utf8"));
    test.matches(contents, /^====== BEGIN MAIL #1 ======$/m);
    test.matches(contents, /^From: qux@example.com$/m);
    test.matches(contents, /^To: baz@example.com$/m);

  });
});

Tinytest.add("email - using mail composer", function (test) {
  smokeEmailTest(function (stream) {
    // Test direct MailComposer usage.
    var mc = new EmailInternals.NpmModules.mailcomposer.module({
      from: "a@b.com",
      text: "body"
    });
    Email.send({mailComposer: mc});
    test.equal(canonicalize(stream.getContentsAsString("utf8")),
               "====== BEGIN MAIL #0 ======\n" +
               devWarningBanner +
               "Content-Type: text/plain\r\n" +
               "From: a@b.com\r\n" +
               "Message-ID: <...>\r\n" +
               "Content-Transfer-Encoding: 7bit\r\n" +
               "Date: ...\r\n" +
               "MIME-Version: 1.0\r\n" +
               "\r\n" +
               "body\r\n" +
               "====== END MAIL #0 ======\n");
  });
});

Tinytest.add("email - date auto generated", function (test) {
  smokeEmailTest(function (stream) {
    // Test if date header is automatically generated, if not specified
    Email.send({
      from: "foo@example.com",
      to: "bar@example.com",
      subject: "This is the subject",
      text: "This is the body\nof the message\nFrom us.",
      headers: {
        'X-Meteor-Test': 'a custom header',
      },
    });

    test.matches(canonicalize(stream.getContentsAsString("utf8")),
                 /^Date: .+$/m);
  });
});

Tinytest.add("email - long lines", function (test) {
  smokeEmailTest(function (stream) {
    // Test that long header lines get wrapped with single leading whitespace,
    // and that long body lines get wrapped with quoted-printable conventions.
    Email.send({
      from: "foo@example.com",
      to: "bar@example.com",
      subject: "This is a very very very very very very very very very very very very long subject",
      text: "This is a very very very very very very very very very very very very long text",
    });

    test.equal(canonicalize(stream.getContentsAsString("utf8")),
               "====== BEGIN MAIL #0 ======\n" +
               devWarningBanner +
               "Content-Type: text/plain\r\n" +
               "From: foo@example.com\r\n" +
               "To: bar@example.com\r\n" +
               "Subject: This is a very very very very very very very very " +
               "very very very\r\n very long subject\r\n" +
               "Message-ID: <...>\r\n" +
               "Content-Transfer-Encoding: quoted-printable\r\n" +
               "Date: ...\r\n" +
               "MIME-Version: 1.0\r\n" +
               "\r\n" +
               "This is a very very very very very very very very very very " +
               "very very long =\r\ntext\r\n" +
               "====== END MAIL #0 ======\n");
  });
});

Tinytest.add("email - unicode", function (test) {
  smokeEmailTest(function (stream) {
    // Test that unicode characters in header and body get encoded.
    Email.send({
      from: "foo@example.com",
      to: "bar@example.com",
      subject: "\u263a",
      text: "I \u2665 Meteor",
    });

    test.equal(canonicalize(stream.getContentsAsString("utf8")),
               "====== BEGIN MAIL #0 ======\n" +
               devWarningBanner +
               "Content-Type: text/plain; charset=utf-8\r\n" +
               "From: foo@example.com\r\n" +
               "To: bar@example.com\r\n" +
               "Subject: =?UTF-8?B?4pi6?=\r\n" +
               "Message-ID: <...>\r\n" +
               "Content-Transfer-Encoding: quoted-printable\r\n" +
               "Date: ...\r\n" +
               "MIME-Version: 1.0\r\n" +
               "\r\n" +
               "I =E2=99=A5 Meteor\r\n" +
               "====== END MAIL #0 ======\n");
  });
});

Tinytest.add("email - text and html", function (test) {
  smokeEmailTest(function (stream) {
    // Test including both text and HTML versions of message.
    Email.send({
      from: "foo@example.com",
      to: "bar@example.com",
      text: "*Cool*, man",
      html: "<i>Cool</i>, man",
    });

    test.equal(canonicalize(stream.getContentsAsString("utf8")),
               "====== BEGIN MAIL #0 ======\n" +
               devWarningBanner +
               "Content-Type: multipart/alternative;\r\n" +
               ' boundary="--...-Part_1"\r\n' +
               "From: foo@example.com\r\n" +
               "To: bar@example.com\r\n" +
               "Message-ID: <...>\r\n" +
               "Date: ...\r\n" +
               "MIME-Version: 1.0\r\n" +
               "\r\n" +
               "----...-Part_1\r\n" +
               "Content-Type: text/plain\r\n" +
               "Content-Transfer-Encoding: 7bit\r\n" +
               "\r\n" +
               "*Cool*, man\r\n" +
               "----...-Part_1\r\n" +
               "Content-Type: text/html\r\n" +
               "Content-Transfer-Encoding: 7bit\r\n" +
               "\r\n" +
               "<i>Cool</i>, man\r\n" +
               "----...-Part_1--\r\n" +
               "====== END MAIL #0 ======\n");
  });
});
