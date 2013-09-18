Tinytest.add("html5 - basic", function (test) {
  var parser = new HTML5.Parser();
  parser.parse("<b>Hello");
  test.equal(parser.tree.document.nodeName, '#document');
});
