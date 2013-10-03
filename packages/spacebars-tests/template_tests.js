Tinytest.add("spacebars - templates - simple helper", function (test) {
  var tmpl = Template.spacebars_template_test_simple_helper;
  tmpl.foo = function (x) {
    return x+1;
  };
  tmpl.bar = function () {
    return 123;
  };
  var div = document.createElement("DIV");
  UI.insert(UI.render(tmpl), div);

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
  var div = document.createElement("DIV");
  UI.insert(UI.render(tmpl), div);

  test.equal(div.innerHTML, "aaa");

  R.set('bbb');
  Deps.flush();

  test.equal(div.innerHTML, "bbb");
});
