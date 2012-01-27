
test("template assembly", function () {
  var minusEmptyComments = function(s) {
    return String(s).replace(/<!---->/g, '');
  };

  // Test for a bug that made it to production -- after a replacement,
  // we need to also check the newly replaced node for replacements
  var frag = Template.test_assembly_a0();
  assert.equal(minusEmptyComments(Meteor._fragmentToHtml(frag)), "Hi");

  // Another production bug -- we must use LiveRange to replace the
  // placeholder, or risk breaking other LiveRanges
  Session.set("stuff", true); // XXX bad form to use Session in a test?
  Template.test_assembly_b1.stuff = function () {
    return Session.get("stuff");
  };
  var onscreen = DIV({style: "display: none"}, [Template.test_assembly_b0()]);
  document.body.appendChild(onscreen);
  assert.equal(minusEmptyComments(onscreen.innerHTML), "xyhi");
  Session.set("stuff", false);
  Meteor.flush();
  assert.equal(minusEmptyComments(onscreen.innerHTML), "xhi");
  document.body.removeChild(onscreen);
});

// Test that if a template throws an error, then pending_partials is
// cleaned up properly (that template rendering doesn't break..)






test("template table assembly", function() {
  var frag = Template.test_table_a0();
  var table = _.find(frag.childNodes, function(n) {
    return n.nodeName == "TABLE";
  });
  assert.isTrue(table);

  // This will accurately detect whether TRs in a TABLE in Internet Explorer
  // are considered "not really there" for lack of an explicit TBODY.
  assert.equal(table.rows.length, 3);
});
