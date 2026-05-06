Package.describe({
  summary: "Send email messages",
  version: "3.2.0",
});

Npm.depends({
  nodemailer: "7.0.11",
  "stream-buffers": "3.0.2",
  "@types/nodemailer": "6.4.14",
  openpgp: "5.11.3",
});

Package.onUse(function (api) {
  api.use(["ecmascript", "logging", "callback-hook"], "server");
  api.addAssets("email.d.ts", "server");
  api.mainModule("email.js", "server");
  api.export(["Email", "EmailInternals"], "server");
  api.export("EmailTest", "server", { testOnly: true });
});

Package.onTest(function (api) {
  api.use("email", "server");
  api.use(["tinytest", "ecmascript"]);
  api.addAssets(
    [
      "test/fixtures/test_private_2048bit.key",
      "test/fixtures/test_private_1024bit.key",
      "test/fixtures/test_public.pem",
    ],
    "server"
  );
  api.addFiles(["email_tests.js", "email_openpgp_tests.js"], "server");
});
