
Tinytest.add("less - presence", function(test) {

  var div = document.createElement('div');
  UI.materialize(Template.less_test_presence, div);
  div.style.display = 'block';
  document.body.appendChild(div);

  var p = div.querySelector('p');
  test.equal(getStyleProperty(p, 'border-left-style'), "dashed");

  // test @import
  test.equal(getStyleProperty(p, 'border-right-style'), "dotted");
  test.equal(getStyleProperty(p, 'border-bottom-style'), "double");

  document.body.removeChild(div);
});
