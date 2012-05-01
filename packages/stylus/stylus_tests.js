
Tinytest.add("stylus - presence", function(test) {

  var d = OnscreenDiv(Meteor.ui.render(function() {
    return '<p class="stylus-unlucky-left-border"></p>'; }));
  d.node().style.display = 'block';

  var p = d.node().firstChild;
  var leftBorder = getStyleProperty(p, 'border-left-width');
  test.equal(leftBorder, "13px");

  d.kill();

});
