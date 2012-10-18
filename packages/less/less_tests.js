
Tinytest.add("less - presence", function(test) {

  var d = OnscreenDiv(Meteor.render(function() {
    return '<p class="less-dashy-left-border"></p>'; }));
  d.node().style.display = 'block';

  var p = d.node().firstChild;
  var leftBorder = getStyleProperty(p, 'border-left-style');
  test.equal(leftBorder, "dashed");

  d.kill();
});
