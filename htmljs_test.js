
Tinytest.add("htmljs", function (test) {
  console.log("HI")
  console.log(DIV)
  // Make sure "style" works, which has to be special-cased for IE.
  test.equal(DIV({style:"display:none"}).style.display, "none");
});
