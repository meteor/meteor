streamBuffers = __meteor_bootstrap__.require('stream-buffers');

Tinytest.add("email - dev mode smoke test", function (test) {
  var old_stream = Email._output_stream;
  try {
    Email._output_stream = new streamBuffers.WritableStreamBuffer;
    Email._next_devmode_mail_id = 0;
    Email.send({
      from: "foo@example.com",
      to: "bar@example.com",
      cc: ["friends@example.com", "enemies@example.com"],
      subject: "This is the subject",
      text: "This is the body\nof the message\nFrom us."
    });
    // XXX brittle if mailcomposer changes header order, etc
    test.equal(Email._output_stream.getContentsAsString("utf8"),
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