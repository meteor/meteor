Package.describe({
  summary: "Test package with a binary npm dependency",
  version: "1.0.0",
  documentation: null
});

// bcrypt is an npm package that
// has different binaries for differnet architectures.
Npm.depends({
  bcrypt: '0.7.7'
});
