Tinytest.add("domutils - setElementValue", function (test) {
  var div = OnscreenDiv();
  div.node().appendChild(DomUtils.htmlToFragment(
    ("<select><option>Foo</option><option value='Bar'>Baz</option>" +
     "<option selected value='Quux'>Quux</option></select>")));

  var select = DomUtils.find(div.node(), 'select');
  test.equal(DomUtils.getElementValue(select), "Quux");
  _.each(["Foo", "Bar", "Quux"], function (value) {
    DomUtils.setElementValue(select, value);
    test.equal(DomUtils.getElementValue(select), value);
  });
});
