Tinytest.add("xmlbuilder - XmlBuilder is exported and defined", (test) => {
  test.isTrue(typeof XmlBuilder === "object" || typeof XmlBuilder === "function");
});

Tinytest.add("xmlbuilder - create returns an object with methods", (test) => {
  const root = XmlBuilder.create("root");
  test.isTrue(typeof root === "object");
  test.isTrue(typeof root.end === "function");
});

Tinytest.add("xmlbuilder - simple element generation", (test) => {
  const xml = XmlBuilder.create("root")
    .ele("child", "hello")
    .end({ pretty: false });

  test.matches(xml, /<root>/);
  test.matches(xml, /<child>hello<\/child>/);
  test.matches(xml, /<\/root>/);
});

Tinytest.add("xmlbuilder - element with attributes", (test) => {
  const xml = XmlBuilder.create("item")
    .att("id", "42")
    .att("type", "test")
    .end({ pretty: false });

  test.matches(xml, /id="42"/);
  test.matches(xml, /type="test"/);
});

Tinytest.add("xmlbuilder - nested elements", (test) => {
  const xml = XmlBuilder.create("parent")
    .ele("child")
      .ele("grandchild", "value")
    .end({ pretty: false });

  test.matches(xml, /<parent>/);
  test.matches(xml, /<child>/);
  test.matches(xml, /<grandchild>value<\/grandchild>/);
});

Tinytest.add("xmlbuilder - XML declaration is included by default", (test) => {
  const xml = XmlBuilder.create("root").end();
  test.matches(xml, /^<\?xml version="1\.0"\?>/);
});

Tinytest.add("xmlbuilder - empty element", (test) => {
  const xml = XmlBuilder.create("empty").end({ pretty: false });
  test.matches(xml, /<empty\/>/);
});
