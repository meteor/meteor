
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
  var childWithTag = function(node, tag) {
    return _.find(node.childNodes, function(n) {
      return n.nodeName === tag;
    });
  };

  var table;

  table = childWithTag(Template.test_table_a0(), "TABLE");

  // table.rows is a great test, as it fails not only when TR/TD tags are
  // stripped due to improper html-to-fragment, but also when they are present
  // but don't show up because we didn't create a TBODY for IE.
  assert.equal(table.rows.length, 3);

  // this time with an explicit TBODY
  table = childWithTag(Template.test_table_b0(), "TABLE");
  assert.equal(table.rows.length, 3);

  var c = Meteor.Collection();
  c.insert({bar:'a'});
  c.insert({bar:'b'});
  c.insert({bar:'c'});
  var onscreen = DIV({style: "display: none;"});
  onscreen.appendChild(Template.test_table_each({foo: c.find()}));
  document.body.appendChild(onscreen);
  table = childWithTag(onscreen, "TABLE");

  assert.equal(table.rows.length, 3);
  var tds = onscreen.getElementsByTagName("TD");
  assert.equal(tds.length, 3);
  assert.equal(tds[0].innerHTML, "a");
  assert.equal(tds[1].innerHTML, "b");
  assert.equal(tds[2].innerHTML, "c");


  document.body.removeChild(onscreen);
});
