var appWithPublic = path.join(__dirname, 'app-with-public');

lib = new library.Library({
  localPackageDirs: [ path.join(files.getCurrentToolsDir(), 'packages') ]
});

console.log("Bundle app with public/ directory");
assert.doesNotThrow(function () {
  var tmpOutputDir = tmpDir();
  var result = bundler.bundle(appWithPublic, tmpOutputDir, {
    nodeModulesMode: 'skip',
    library: lib,
    releaseStamp: 'none'
  });
  var testTxtPath = path.join(tmpOutputDir, "programs",
                              "client", "static", "test.txt");
  var nestedTxtPath = path.join(tmpOutputDir, "programs",
                                "client", "static", "nested", "nested.txt");
  assert.strictEqual(result.errors, false, result.errors && result.errors[0]);
  assert(fs.existsSync(testTxtPath));
  assert(fs.existsSync(nestedTxtPath));
  assert.strictEqual(fs.readFileSync(testTxtPath, "utf8").trim(),
                     "Test");
  assert.strictEqual(fs.readFileSync(nestedTxtPath, "utf8").trim(),
                     "Nested");
});
