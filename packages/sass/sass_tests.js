Tinytest.add("sass - presence", function(test) {

  var d = OnscreenDiv(Meteor.render(function() {
    return '<div class="sass-test"><p class="dashy-left-border"></p></div>'; }));
  d.node().style.display = 'block';

  var p = d.node().firstChild.firstChild
  var leftBorder = getStyleProperty(p, 'border-left-style');
  test.equal(leftBorder, "dashed");

  d.kill();

});
