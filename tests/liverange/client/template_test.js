test("template assembly", function () {
  // Test for a bug that made it to production -- after a replacement,
  // also check the newly replaced node for replacements
  var x = Template.test_assembly_3();
  assert.lengthIs(x.childNodes, 1);
});
