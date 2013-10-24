var renderToDiv = function (comp) {
  var div = document.createElement("DIV");
  UI.insert(UI.render(comp), div);
  return div;
};

var trim = function (str) {
  return str.replace(/^\s+|\s+$/g, '');
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

  tmpl.foo = function (a, options) {
    return UI.Text.withData(a + options.q);
  };
  var R1 = ReactiveVar(3);
  var R2 = ReactiveVar(4);
  tmpl.bar = function () { return R1.get(); };
  tmpl.baz = function () { return R2.get(); };
  var div = renderToDiv(tmpl);
  test.equal(div.innerHTML, '7');
  R1.set(11);
  R2.set(13);
  Deps.flush();
  test.equal(div.innerHTML, '24');

  tmpl.foo = UI.Component.extend({
    render: function (buf) {
      // note: weird to assume this.data() is a function rather than
      // calling-if-function.  But what's the best way to write that
      // in component code?  Probably `this.get()`, and likewise for
      // `this.get('q')`.
      buf.write(String(this.data() + this.q()));
    }
  });
  R1 = ReactiveVar(20);
  R2 = ReactiveVar(23);
  div = renderToDiv(tmpl);
  test.equal(div.innerHTML, '43');
  R1.set(10);
  R2.set(17);
  Deps.flush();
  test.equal(div.innerHTML, '27');
});

Tinytest.add("spacebars - templates - inclusion dotted args", function (test) {
  // `{{> foo bar.baz}}`
  var tmpl = Template.spacebars_template_test_inclusion_dotted_args;

  var initCount = 0;
  tmpl.foo = Template.spacebars_template_test_bracketed_this.extend({
    init: function () { initCount++; }
  });
  var R = ReactiveVar('david');
  tmpl.bar = function () {
    // make sure `this` is bound correctly
    return { baz: this.symbol + R.get() };
  };

  var div = renderToDiv(tmpl.withData({symbol:'%'}));
  test.equal(initCount, 1);
  test.equal(div.innerHTML, '[%david]');

  R.set('avi');
  Deps.flush();
  test.equal(div.innerHTML, '[%avi]');
  // check that invalidating the argument to `foo` doesn't require
  // creating a new `foo`.
  test.equal(initCount, 1);
});

Tinytest.add("spacebars - templates - inclusion slashed args", function (test) {
  // `{{> foo bar/baz}}`
  var tmpl = Template.spacebars_template_test_inclusion_dotted_args;

  var initCount = 0;
  tmpl.foo = Template.spacebars_template_test_bracketed_this.extend({
    init: function () { initCount++; }
  });
  var R = ReactiveVar('david');
  tmpl.bar = function () {
    // make sure `this` is bound correctly
    return { baz: this.symbol + R.get() };
  };

  var div = renderToDiv(tmpl.withData({symbol:'%'}));
  test.equal(initCount, 1);
  test.equal(div.innerHTML, '[%david]');
});

Tinytest.add("spacebars - templates - block helper", function (test) {
  var tmpl = Template.spacebars_template_test_block_helper;
  var R = ReactiveVar(Template.spacebars_template_test_content);
  tmpl.foo = function () {
    return R.get();
  };
  var div = renderToDiv(tmpl);
  test.equal(div.innerHTML.trim(), "bar");

  R.set(Template.spacebars_template_test_elsecontent);
  Deps.flush();
  test.equal(div.innerHTML.trim(), "baz");
});

Tinytest.add("spacebars - templates - block helper function with one string arg", function (test) {
  var tmpl = Template.spacebars_template_test_block_helper_function_one_string_arg;
  tmpl.foo = function (x) {
    if (x === "bar")
      return Template.spacebars_template_test_content;
    else
      return null;
  };
  var div = renderToDiv(tmpl);
  test.equal(div.innerHTML.trim(), "content");
});

Tinytest.add("spacebars - templates - block helper function with one helper arg", function (test) {
  var tmpl = Template.spacebars_template_test_block_helper_function_one_helper_arg;
  var R = ReactiveVar("bar");
  tmpl.bar = function () { return R.get(); };
  tmpl.foo = function (x) {
    if (x === "bar")
      return Template.spacebars_template_test_content;
    else
      return null;
  };
  var div = renderToDiv(tmpl);
  test.equal(div.innerHTML.trim(), "content");

  R.set("baz");
  Deps.flush();
  test.equal(div.innerHTML.trim(), "");
});

Tinytest.add("spacebars - templates - block helper component with one helper arg", function (test) {
  var tmpl = Template.spacebars_template_test_block_helper_component_one_helper_arg;
  var R = ReactiveVar(true);
  tmpl.bar = function () { return R.get(); };
  var div = renderToDiv(tmpl);
  test.equal(div.innerHTML.trim(), "content");

  R.set(false);
  Deps.flush();
  test.equal(div.innerHTML.trim(), "");
});

Tinytest.add("spacebars - templates - block helper component with three helper args", function (test) {
  var tmpl = Template.spacebars_template_test_block_helper_component_three_helper_args;
  var R = ReactiveVar("bar");
  tmpl.bar_or_baz = function () {
    return R.get();
  };
  tmpl.equals = function (x, y) {
    return x === y;
  };
  var div = renderToDiv(tmpl);
  test.equal(div.innerHTML.trim(), "content");

  R.set("baz");
  Deps.flush();
  test.equal(div.innerHTML.trim(), "");
});

Tinytest.add("spacebars - templates - block helper with dotted arg", function (test) {
  var tmpl = Template.spacebars_template_test_block_helper_dotted_arg;
  var R1 = ReactiveVar(1);
  var R2 = ReactiveVar(10);
  var R3 = ReactiveVar(100);

  var initCount = 0;
  tmpl.foo = Template.spacebars_template_test_bracketed_this.extend({
    init: function () { initCount++; }
  });
  tmpl.bar = function () {
    return {
      r1: R1.get(),
      baz: function (r3) {
        return this.r1 + R2.get() + r3;
      }
    };
  };
  tmpl.qux = function () { return R3.get(); };

  var div = renderToDiv(tmpl);
  test.equal(div.innerHTML, "[111]");
  test.equal(initCount, 1);

  R1.set(2);
  Deps.flush();
  test.equal(div.innerHTML, "[112]");
  test.equal(initCount, 1);

  R2.set(20);
  Deps.flush();
  test.equal(div.innerHTML, "[122]");
  test.equal(initCount, 1);

  R3.set(200);
  Deps.flush();
  test.equal(div.innerHTML, "[222]");
  test.equal(initCount, 1);

  R2.set(30);
  Deps.flush();
  test.equal(div.innerHTML, "[232]");
  test.equal(initCount, 1);

  R1.set(3);
  Deps.flush();
  test.equal(div.innerHTML, "[233]");
  test.equal(initCount, 1);

  R3.set(300);
  Deps.flush();
  test.equal(div.innerHTML, "[333]");
  test.equal(initCount, 1);
});

Tinytest.add("spacebars - templates - nested content", function (test) {
  // Test that `{{> content}}` in an `{{#if}}` works.

  // ```
  // <template name="spacebars_template_test_iftemplate">
  //   {{#if condition}}
  //     {{> content}}
  //   {{else}}
  //     {{> elseContent}}
  //   {{/if}}
  // </template>
  // ```

  // ```
  //  {{#spacebars_template_test_iftemplate flag}}
  //    hello
  //  {{else}}
  //    world
  //  {{/spacebars_template_test_iftemplate}}
  // ```

  var tmpl = Template.spacebars_template_test_nested_content;
  var R = ReactiveVar(true);
  tmpl.flag = function () {
    return R.get();
  };
  var div = renderToDiv(tmpl);
  test.equal(trim(div.innerHTML), 'hello');
  R.set(false);
  Deps.flush();
  test.equal(trim(div.innerHTML), 'world');
  R.set(true);
  Deps.flush();
  test.equal(trim(div.innerHTML), 'hello');

  // Also test that `{{> content}}` in a custom block helper works.
  tmpl = Template.spacebars_template_test_nested_content2;
  R = ReactiveVar(true);
  tmpl.x = function () {
    return R.get();
  };
  div = renderToDiv(tmpl);
  test.equal(trim(div.innerHTML), 'hello');
  R.set(false);
  Deps.flush();
  test.equal(trim(div.innerHTML), 'world');
  R.set(true);
  Deps.flush();
  test.equal(trim(div.innerHTML), 'hello');
});

Tinytest.add("spacebars - templates - ..", function (test) {
  var tmpl = Template.spacebars_template_test_dots;
  tmpl.getTitle = function (from) {
    return from.title;
  };

  tmpl.foo = {title: "foo"};
  tmpl.foo.bar = {title: "bar"};
  tmpl.foo.bar.items = [{title: "item"}];
  var div = renderToDiv(tmpl);

  test.equal(
    div.innerHTML.replace(/ |^(\s)+|(\s)+$/g, '').split('\n'),
    [
      // {{> spacebars_template_test_dots_subtemplate}}
      "item", "item", "bar", "foo", "item", "bar", "foo",
      // {{> spacebars_template_test_dots_subtemplate ..}}
      "bar", "bar", "item", "bar", "bar", "item", "bar"]);
});

