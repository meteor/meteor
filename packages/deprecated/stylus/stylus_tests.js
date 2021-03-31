
Tinytest.add("stylus - presence", function(test) {

  var div = document.createElement('div');
  Blaze.render(Template.stylus_test_presence, div);
  div.style.display = 'block';
  document.body.appendChild(div);

  var p = div.querySelector('p');
  var leftBorder = getStyleProperty(p, 'border-left-style');
  test.equal(leftBorder, "dashed");

  document.body.removeChild(div);
});

Tinytest.add("stylus - @import", function(test) {
  var div = document.createElement('div');
  Blaze.render(Template.stylus_test_import, div);
  div.style.display = 'block';
  document.body.appendChild(div);

  var p = div.querySelector('p');
  test.equal(getStyleProperty(p, 'font-size'), "20px");
  test.equal(getStyleProperty(p, 'border-left-style'), "dashed");

  document.body.removeChild(div);
});
