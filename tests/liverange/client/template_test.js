var dump_html = function (frag) {
  var container = document.createElement("DIV");
  container.appendChild(frag);
  var ret = container.innerHTML;
  while (container.firstChild)
    frag.appendChild(container.firstChild);
  return ret;
};

test("template assembly", function () {
  // Test for a bug that made it to production -- after a replacement,
  // we need to also check the newly replaced node for replacements
  var frag = Template.test_assembly_a0();
  assert.equal(dump_html(frag), "Hi");

  // Another production bug -- we must use LiveRange to replace the
  // placeholder, or risk breaking other LiveRanges
  Session.set("stuff", true); // XXX bad form to use Session in a test?
  Template.test_assembly_b1.stuff = function () {
    return Session.get("stuff");
  };
  var onscreen = DIV({style: "display: none"}, [Template.test_assembly_b0()]);
  document.body.appendChild(onscreen);
  assert.equal(onscreen.innerHTML, "xyhi");
  Session.set("stuff", false);
  Sky.flush();
  assert.equal(onscreen.innerHTML, "xhi");
  document.body.removeChild(onscreen);
});



// Test that if a template throws an error, then pending_partials is
// cleaned up properly (that template rendering doesn't break..)