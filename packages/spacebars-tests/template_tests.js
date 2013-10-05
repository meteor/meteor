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

Tinytest.add("spacebars - templates - triple", function (test) {
  var tmpl = Template.spacebars_template_test_triple;

  var R = ReactiveVar('<span class="hi">blah</span>');
  tmpl.html = function () { return R.get(); };

  var div = renderToDiv(tmpl);
  var elems = $(div).find("> *");
  test.equal(elems.length, 1);
  test.equal(elems[0].nodeName, 'SPAN');
  var span = elems[0];
  test.equal(span.className, 'hi');
  test.equal(span.innerHTML, 'blah');

  R.set('asdf');
  Deps.flush();
  elems = $(div).find("> *");
  test.equal(elems.length, 0);
  test.equal(div.innerHTML, 'asdf');

  R.set('<span class="hi">blah</span>');
  Deps.flush();
  elems = $(div).find("> *");
  test.equal(elems.length, 1);
  test.equal(elems[0].nodeName, 'SPAN');
  span = elems[0];
  test.equal(span.className, 'hi');
  test.equal(span.innerHTML, 'blah');
});

Tinytest.add("spacebars - templates - inclusion args", function (test) {
  var tmpl = Template.spacebars_template_test_inclusion_args;

  var R = ReactiveVar(Template.spacebars_template_test_aaa);
  tmpl.foo = function () { return R.get(); };

  var div = renderToDiv(tmpl);
  // `{{> foo bar}}`, with `foo` resolving to Template.aaa,
  // which consists of "aaa"
  test.equal(div.innerHTML, 'aaa');
  R.set(Template.spacebars_template_test_bbb);
  Deps.flush();
  test.equal(div.innerHTML, 'bbb');

  ////// Ok, now `foo` *is* Template.aaa
  tmpl.foo = Template.spacebars_template_test_aaa;
  div = renderToDiv(tmpl);
  test.equal(div.innerHTML, 'aaa');

  ////// Ok, now `foo` is a template that takes an argument; bar is a string.
  tmpl.foo = Template.spacebars_template_test_bracketed_this;
  tmpl.bar = 'david';
  div = renderToDiv(tmpl);
  test.equal(div.innerHTML, '[david]');

  ////// Now `foo` is a template that takes an arg; bar is a function.
  tmpl.foo = Template.spacebars_template_test_bracketed_this;
  R = ReactiveVar('david');
  tmpl.bar = function () { return R.get(); };
  div = renderToDiv(tmpl);
  test.equal(div.innerHTML, '[david]');
  R.set('avi');
  Deps.flush();
  test.equal(div.innerHTML, '[avi]');
});

Tinytest.add("spacebars - templates - inclusion args 2", function (test) {
  ///// `foo` is a function in `{{> foo bar baz}}`.
  // `bar` and `baz` should be called and passed as an arg to it.
  var tmpl = Template.spacebars_template_test_inclusion_args2;
  tmpl.foo = function (x, y) {
    return y === 999 ? Template.spacebars_template_test_aaa :
      Template.spacebars_template_test_bracketed_this.withData(x + y);
  };
  var R = ReactiveVar(3);
  tmpl.bar = 4;
  tmpl.baz = function () { return R.get(); };
  var div = renderToDiv(tmpl);
  test.equal(div.innerHTML, '[7]');
  R.set(11);
  Deps.flush();
  test.equal(div.innerHTML, '[15]');
  R.set(999);
  Deps.flush();
  test.equal(div.innerHTML, 'aaa');
});

Tinytest.add("spacebars - templates - inclusion args 3", function (test) {
  // `{{> foo bar q=baz}}`
  var tmpl = Template.spacebars_template_test_inclusion_args3;

  // XXX
});

Tinytest.add("spacebars - templates - inclusion dotted args", function (test) {
  // `{{> foo bar.baz}}`
  var tmpl = Template.spacebars_template_test_inclusion_dotted_args;

  // XXX

  // This test should fail when `foo` is `bracketed_this` and `bar` is
  // a function by detecting that when the return value of `bar` changes
  // reactively, the whole `bracketed_this` is re-rendered even though
  // a `data` change shouldn't cause that.  Or something.
});