
Tinytest.add("templating - assembly", function (test) {

  // Test for a bug that made it to production -- after a replacement,
  // we need to also check the newly replaced node for replacements
  var frag = Meteor.ui.render(Template.test_assembly_a0);
  test.equal(canonicalizeHtml(Meteor.ui._fragmentToHtml(frag)),
               "Hi");

  // Another production bug -- we must use LiveRange to replace the
  // placeholder, or risk breaking other LiveRanges
  Session.set("stuff", true); // XXX bad form to use Session in a test?
  Template.test_assembly_b1.stuff = function () {
    return Session.get("stuff");
  };
  var onscreen = DIV({style: "display: none"}, [
    Meteor.ui.render(Template.test_assembly_b0)]);
  document.body.appendChild(onscreen);
  test.equal(canonicalizeHtml(onscreen.innerHTML), "xyhi");
  Session.set("stuff", false);
  Meteor.flush();
  test.equal(canonicalizeHtml(onscreen.innerHTML), "xhi");
  document.body.removeChild(onscreen);
});

// Test that if a template throws an error, then pending_partials is
// cleaned up properly (that template rendering doesn't break..)






Tinytest.add("templating - table assembly", function(test) {
  var childWithTag = function(node, tag) {
    return _.find(node.childNodes, function(n) {
      return n.nodeName === tag;
    });
  };

  var table;

  table = childWithTag(Meteor.ui.render(Template.test_table_a0), "TABLE");

  // table.rows is a great test, as it fails not only when TR/TD tags are
  // stripped due to improper html-to-fragment, but also when they are present
  // but don't show up because we didn't create a TBODY for IE.
  test.equal(table.rows.length, 3);

  // this time with an explicit TBODY
  table = childWithTag(Meteor.ui.render(Template.test_table_b0), "TABLE");
  test.equal(table.rows.length, 3);

  var c = new LocalCollection();
  c.insert({bar:'a'});
  c.insert({bar:'b'});
  c.insert({bar:'c'});
  var onscreen = DIV({style: "display: none;"});
  onscreen.appendChild(
    Meteor.ui.render(_.bind(Template.test_table_each, null, {foo: c.find()})));
  document.body.appendChild(onscreen);
  table = childWithTag(onscreen, "TABLE");

  test.equal(table.rows.length, 3, table.parentNode.innerHTML);
  var tds = onscreen.getElementsByTagName("TD");
  test.equal(tds.length, 3);
  test.equal(tds[0].innerHTML, "a");
  test.equal(tds[1].innerHTML, "b");
  test.equal(tds[2].innerHTML, "c");


  document.body.removeChild(onscreen);
});

Tinytest.add("templating - event handler this", function(test) {

  Template.test_event_data_with.ONE = {str: "one"};
  Template.test_event_data_with.TWO = {str: "two"};
  Template.test_event_data_with.THREE = {str: "three"};

  var event_buf = [];
  var tmpl = OnscreenDiv(
    Meteor.ui.render(
      function() {
        return Template.test_event_data_with(
          Template.test_event_data_with.ONE);
      },
      { events: { 'click': function() {
        test.isTrue(this.str);
        event_buf.push(this.str);
      } }}));

  var divs = tmpl.node().getElementsByTagName("div");
  test.equal(3, divs.length);

  clickElement(divs[0]);
  test.equal(event_buf, ['one']);
  event_buf.length = 0;

  clickElement(divs[1]);
  test.equal(event_buf, ['two']);
  event_buf.length = 0;

  clickElement(divs[2]);
  test.equal(event_buf, ['three']);
  event_buf.length = 0;

  tmpl.kill();
  Meteor.flush();
});
