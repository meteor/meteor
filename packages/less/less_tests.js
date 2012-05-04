
Tinytest.add("less - presence", function(test) {

  // find the .less stylesheet, whose first rule contains "less-tests"
  // in the selector
  var sheet = _.find(document.styleSheets, function(sh) {
    var rules = sh.cssRules || sh.rules;
    return /less-tests/.test(rules[0].selectorText);
  });

  test.isTrue(sheet);

  // `cssRules` is the W3C name, but isn't supported in IE until
  // version 9.  IE<=8 has `rules`.  We prefer `cssRules` as
  // it is less likely to have quirks if both are present.
  var rules = sheet.cssRules || sheet.rules;

  test.equal(rules[1].style.borderLeftWidth, "13px");
});

