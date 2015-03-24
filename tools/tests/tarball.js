var selftest = require('../selftest.js');
var files = require('../files.js');
var expectEqual = selftest.expectEqual;

selftest.define("create and extract tarball with long paths", function () {
  var STAMP = "stamp";

  // Create a directory with a single file in a long subdirectory, to
  // be turned into a tarball.
  var tarballInputDir = files.mkdtemp("tarball-input");
  var longDir = tarballInputDir;
  while (longDir.length < 300) {
    longDir = files.pathJoin(longDir, "subdirectory");
  }
  files.mkdir_p(longDir);
  var inputStampedFile = files.pathJoin(longDir, "file");
  files.writeFile(inputStampedFile, STAMP);

  // Make the tarball
  var tarballOutputDir = files.mkdtemp("tarball");
  var tarballOutputFile = files.pathJoin(tarballOutputDir, "out.tar.gz");
  files.createTarball(tarballInputDir, tarballOutputFile);

  // Extract the tarball and verify that the single file we created is
  // present with the expected contents.
  var tarballExtractedDir = files.mkdtemp("tarball-extracted");
  files.extractTarGz(files.readFile(tarballOutputFile), tarballExtractedDir);
  var extractedStampedFile = inputStampedFile.replace(tarballInputDir, tarballExtractedDir);
  expectEqual(files.readFile(extractedStampedFile, "utf-8"), STAMP);
});
