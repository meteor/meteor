Tinytest.add("ecmascript-compiler - bare files work", function (test) {
  // This is defined in bare-file.js
  test.equal(exportedFromBareFile, "Yes");
});
