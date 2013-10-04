var renderToDiv = function (comp) {
  var div = document.createElement("DIV");
  UI.insert(UI.render(comp), div);
  return div;
};

Tinytest.add("spacebars - templates - simple helper", function (test) {
  var tmpl = Template.spacebars_template_test_simple_helper;
  tmpl.foo = function (x) {
    return x+1;
  };
  tmpl.bar = function () {
    return 123;
  };
  var div = renderToDiv(tmpl);

  test.equal(div.innerHTML, "124");
});

Tinytest.add("spacebars - templates - dynamic template", function (test) {
  var tmpl = Template.spacebars_template_test_dynamic_template;
  var aaa = Template.spacebars_template_test_aaa;
  var bbb = Template.spacebars_template_test_bbb;
  var R = ReactiveVar("aaa");
  tmpl.foo = function () {
    return R.get() === 'aaa' ? aaa : bbb;
  };
  var div = renderToDiv(tmpl);
  test.equal(div.innerHTML, "aaa");

  R.set('bbb');
  Deps.flush();

  test.equal(div.innerHTML, "bbb");
});

Tinytest.add("spacebars - templates - interpolate attribute", function (test) {
  var tmpl = Template.spacebars_template_test_interpolate_attribute;
  tmpl.foo = function (x) {
    return x+1;
  };
  tmpl.bar = function () {
    return 123;
  };
  var div = renderToDiv(tmpl);

  test.equal($(div).find('div')[0].className, "aaa124zzz");
});

Tinytest.add("spacebars - templates - dynamic attrs", function (test) {
  var tmpl = Template.spacebars_template_test_dynamic_attrs;

  var R1 = ReactiveVar('');
  var R2 = ReactiveVar('n=1');
  var R3 = ReactiveVar('selected');
  tmpl.attrs1 = function () { return R1.get(); };
  tmpl.attrs2 = function () { return R2.get(); };
  tmpl.k = 'x';
  tmpl.v = 'y';
  tmpl.x = function () { return R3.get(); };
  var div = renderToDiv(tmpl);
  var span = $(div).find('span')[0];
  test.equal(span.innerHTML, 'hi');
  test.equal(span.getAttribute('n'), "1");
  test.equal(span.getAttribute('x'), 'y');
  test.isTrue(span.hasAttribute('selected'));

  R1.set('zanzibar="where the heart is"');
  R2.set('');
  R3.set('');
  Deps.flush();
  test.equal(span.innerHTML, 'hi');
  test.isFalse(span.hasAttribute('n'));
  test.isFalse(span.hasAttribute('selected'));
  test.equal(span.getAttribute('zanzibar'), 'where the heart is');
});
