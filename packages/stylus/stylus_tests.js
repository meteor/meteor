
Tinytest.add("stylus - presence", function(test) {
  var d = OnscreenDiv(Meteor.render(function() {
    return '<p class="stylus-dashy-left-border"></p>'; }));
  d.node().style.display = 'block';

  var p = d.node().firstChild;
  var leftBorder = getStyleProperty(p, 'border-left-style');
  test.equal(leftBorder, "dashed");

  d.kill();
});

Tinytest.add("stylus - @import", function(test) {
  var d = OnscreenDiv(Meteor.render(function() {
    return '<p class="stylus-import-dashy-border stylus-overwrite-color"></p>';
  }));
  d.node().style.display = 'block';

  var p = d.node().firstChild;
  test.equal(getStyleProperty(p, 'font-size'), "20px");
  test.equal(getStyleProperty(p, 'border-left-style'), "dashed");

  d.kill();
});
