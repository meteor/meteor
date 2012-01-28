
test("htmljs", function() {

  // Make sure "style" works, which has to be special-cased for IE.
  assert.equal(DIV({style:"display:none"}).style.display, "none");
});