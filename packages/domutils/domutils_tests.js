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

  div.kill();
});

Tinytest.add("domutils - form id expando", function (test) {
  // See https://github.com/meteor/meteor/issues/604

  var div = OnscreenDiv();
  div.node().appendChild(DomUtils.htmlToFragment(
    ('<form><input name="id"></form>')));
  var theInput = DomUtils.find(div.node(), 'input');
  var theForm = theInput.parentNode;
  var theDiv = theForm.parentNode;

  // test that this call doesn't throw an exception
  test.equal(DomUtils.matchesSelector(theForm, theDiv, 'form'), true);

  div.kill();
});
