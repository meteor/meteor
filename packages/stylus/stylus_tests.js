// based on packages/less/less_tests.js
Tinytest.add("stylus - presence", function(test) {

  // find the .styl stylesheet, whose first rule contains "stylus-tests"
  // in the selector
  var sheet = _.find(document.styleSheets, function(sh) {
    var rules = sh.cssRules || sh.rules;
    return /stylus-tests/.test(rules[0].selectorText);
  });

  test.isTrue(sheet);

  // `cssRules` is the W3C name, but isn't supported in IE until
  // version 9.  IE<=8 has `rules`.  We prefer `cssRules` as
  // it is less likely to have quirks if both are present.
  var rules = sheet.cssRules || sheet.rules;

  test.equal(rules[1].style.borderLeftWidth, "13px");
});

