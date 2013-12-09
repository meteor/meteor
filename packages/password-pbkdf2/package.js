Package.describe({
  summary: "PBKDF2 support for password accounts",
  internal: true
});

Package.on_use(function (api) {
  api.add_files('password-pbkdf2.js');
  api.export('PasswordPBKDF2');
});
