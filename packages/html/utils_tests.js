Tinytest.add("html - utils", function (test) {

  test.notEqual("\u00c9".toLowerCase(), "\u00c9");
  test.equal(HTML.asciiLowerCase("\u00c9"), "\u00c9");

  test.equal(HTML.asciiLowerCase("Hello There"), "hello there");

  test.isTrue(HTML.isVoidElement("br"));
  test.isTrue(HTML.isVoidElement("Br"));
  test.isTrue(HTML.isVoidElement("BR"));
  test.isTrue(HTML.isVoidElement("bR"));

  test.isFalse(HTML.isVoidElement("div"));
  test.isFalse(HTML.isVoidElement("DIV"));


  test.isTrue(HTML.isKnownElement("div"));
  test.isTrue(HTML.isKnownElement("DIV"));
  test.isFalse(HTML.isKnownElement("asdf"));
  test.isFalse(HTML.isKnownElement("ASDF"));

});