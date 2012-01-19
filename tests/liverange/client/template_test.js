test("template assembly", function () {
  // Test for a bug that made it to production -- after a replacement,
  // also check the newly replaced node for replacements
  var x = Template.test_assembly_0();
  assert.lengthIs(x.childNodes, 1);
});


// Test that if a template throws an error, then pending_partials is
// cleaned up properly (that template rendering doesn't break..)