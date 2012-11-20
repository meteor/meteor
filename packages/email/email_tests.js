streamBuffers = __meteor_bootstrap__.require('stream-buffers');

Tinytest.add("email - dev mode smoke test", function (test) {
  // This only tests dev mode, so don't run the test if this is deployed.
  if (process.env.MAIL_URL) return;

  var old_stream = Email._output_stream;
  try {
    var stream = new streamBuffers.WritableStreamBuffer;
    Email._output_stream = stream;
    Email._next_devmode_mail_id = 0;
    Email.send({
      from: "foo@example.com",
      to: "bar@example.com",
      cc: ["friends@example.com", "enemies@example.com"],
      subject: "This is the subject",
      text: "This is the body\nof the message\nFrom us."
    });
    // Note that we use the local "stream" here rather than Email._output_stream
    // in case a concurrent test run mutates Email._output_stream too.
    // XXX brittle if mailcomposer changes header order, etc
    test.equal(stream.getContentsAsString("utf8"),
               "====== BEGIN MAIL #0 ======\n" + 
               "MIME-Version: 1.0\r\n" +
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
  } finally {
    Email._output_stream = old_stream;
  }
});
