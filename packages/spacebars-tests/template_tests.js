var renderToDiv = function (comp) {
  var div = document.createElement("DIV");
  UI.materialize(comp, div);
  return div;
};

// strip empty comments created by DomRange on IE
var stripComments = function (str) {
  return str.replace(/\<\!--IE--\>/g, '');
};

var trim = function (str) {
  return str.replace(/^\s+|\s+$/g, '');
};

var trimAndRemoveSpaces = function (str) {
  return trim(str).replace(/ /g, '');
};

var divRendersTo = function (test, div, html) {
  Deps.flush();
  var actual = div.innerHTML.replace(/\s/g, '');
  test.equal(actual, html);
};

Tinytest.add("spacebars - templates - simple helper", function (test) {
  var tmpl = Template.spacebars_template_test_simple_helper;
  var R = ReactiveVar(1);
  tmpl.foo = function (x) {
    return x + R.get();
  };
  tmpl.bar = function () {
    return 123;
  };
  var div = renderToDiv(tmpl);

  test.equal(stripComments(div.innerHTML), "124");
  R.set(2);
  Deps.flush();
  test.equal(stripComments(div.innerHTML), "125");

  // Test that `{{foo bar}}` throws if `foo` is missing or not a function.
  tmpl.foo = 3;
  test.throws(function () {
    renderToDiv(tmpl);
  });

  delete tmpl.foo;
  // We'd like this to throw, but it doesn't because of how self.lookup
  // works.  D'oh.  Fix this as part of "new this".
  //test.throws(function () {
    renderToDiv(tmpl);
  //});

  tmpl.foo = function () {};
  // doesn't throw
  var div = renderToDiv(tmpl);
  test.equal(trim(stripComments(div.innerHTML)), '');
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
  test.equal(stripComments(div.innerHTML), "aaa");

  R.set('bbb');
  Deps.flush();

  test.equal(stripComments(div.innerHTML), "bbb");
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

  var R2 = ReactiveVar({x: "X"});
  var R3 = ReactiveVar('selected');
  tmpl.attrsObj = function () { return R2.get(); };
  tmpl.singleAttr = function () { return R3.get(); };

  var div = renderToDiv(tmpl);
  var span = $(div).find('span')[0];
  test.equal(span.innerHTML, 'hi');
  test.isTrue(span.selected);
  test.equal(span.getAttribute('x'), 'X');

  R2.set({y: "Y", z: "Z"});
  R3.set('');
  Deps.flush();
  test.equal(stripComments(span.innerHTML), 'hi');
  test.isFalse(span.selected);
  test.isFalse(span.hasAttribute('x'));
  test.equal(span.getAttribute('y'), 'Y');
  test.equal(span.getAttribute('z'), 'Z');
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
  test.equal(stripComments(div.innerHTML), 'asdf');

  R.set('<span class="hi">blah</span>');
  Deps.flush();
  elems = $(div).find("> *");
  test.equal(elems.length, 1);
  test.equal(elems[0].nodeName, 'SPAN');
  span = elems[0];
  test.equal(span.className, 'hi');
  test.equal(stripComments(span.innerHTML), 'blah');
});

Tinytest.add("spacebars - templates - inclusion args", function (test) {
  var tmpl = Template.spacebars_template_test_inclusion_args;

  var R = ReactiveVar(Template.spacebars_template_test_aaa);
  tmpl.foo = function () { return R.get(); };

  var div = renderToDiv(tmpl);
  // `{{> foo bar}}`, with `foo` resolving to Template.aaa,
  // which consists of "aaa"
  test.equal(stripComments(div.innerHTML), 'aaa');
  R.set(Template.spacebars_template_test_bbb);
  Deps.flush();
  test.equal(stripComments(div.innerHTML), 'bbb');

  ////// Ok, now `foo` *is* Template.aaa
  tmpl.foo = Template.spacebars_template_test_aaa;
  div = renderToDiv(tmpl);
  test.equal(stripComments(div.innerHTML), 'aaa');

  ////// Ok, now `foo` is a template that takes an argument; bar is a string.
  tmpl.foo = Template.spacebars_template_test_bracketed_this;
  tmpl.bar = 'david';
  div = renderToDiv(tmpl);
  test.equal(stripComments(div.innerHTML), '[david]');

  ////// Now `foo` is a template that takes an arg; bar is a function.
  tmpl.foo = Template.spacebars_template_test_bracketed_this;
  R = ReactiveVar('david');
  tmpl.bar = function () { return R.get(); };
  div = renderToDiv(tmpl);
  test.equal(stripComments(div.innerHTML), '[david]');
  R.set('avi');
  Deps.flush();
  test.equal(stripComments(div.innerHTML), '[avi]');
});

Tinytest.add("spacebars - templates - inclusion args 2", function (test) {
  // `{{> foo bar q=baz}}`
  var tmpl = Template.spacebars_template_test_inclusion_args2;

  tmpl.foo = function (a, options) {
    return UI.Component.extend({
      render: function () {
        return String(a + options.hash.q);
      }
    });
  };
  var R1 = ReactiveVar(3);
  var R2 = ReactiveVar(4);
  tmpl.bar = function () { return R1.get(); };
  tmpl.baz = function () { return R2.get(); };
  var div = renderToDiv(tmpl);
  test.equal(stripComments(div.innerHTML), '7');
  R1.set(11);
  R2.set(13);
  Deps.flush();
  test.equal(stripComments(div.innerHTML), '24');

  tmpl.foo = UI.Component.extend({
    render: function () {
      var self = this;
      return function () {
        return String(self.data() + self.q());
      };
    }
  });
  R1 = ReactiveVar(20);
  R2 = ReactiveVar(23);
  div = renderToDiv(tmpl);
  test.equal(stripComments(div.innerHTML), '43');
  R1.set(10);
  R2.set(17);
  Deps.flush();
  test.equal(stripComments(div.innerHTML), '27');

  // helpers can be scalars. still get put on to the component as methods.
  tmpl.bar = 3;
  tmpl.baz = 8;
  div = renderToDiv(tmpl);
  test.equal(stripComments(div.innerHTML), '11');
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
  test.equal(stripComments(div.innerHTML), '[%david]');

  R.set('avi');
  Deps.flush();
  test.equal(stripComments(div.innerHTML), '[%avi]');
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
  test.equal(stripComments(div.innerHTML), '[%david]');
});

Tinytest.add("spacebars - templates - block helper", function (test) {
  var tmpl = Template.spacebars_template_test_block_helper;
  var R = ReactiveVar(Template.spacebars_template_test_content);
  tmpl.foo = function () {
    return R.get();
  };
  var div = renderToDiv(tmpl);
  test.equal(trim(stripComments(div.innerHTML)), "bar");

  R.set(Template.spacebars_template_test_elsecontent);
  Deps.flush();
  test.equal(trim(stripComments(div.innerHTML)), "baz");
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
  test.equal(trim(stripComments(div.innerHTML)), "content");
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
  test.equal(trim(stripComments(div.innerHTML)), "content");

  R.set("baz");
  Deps.flush();
  test.equal(trim(stripComments(div.innerHTML)), "");
});

Tinytest.add("spacebars - templates - block helper component with one helper arg", function (test) {
  var tmpl = Template.spacebars_template_test_block_helper_component_one_helper_arg;
  var R = ReactiveVar(true);
  tmpl.bar = function () { return R.get(); };
  var div = renderToDiv(tmpl);
  test.equal(trim(stripComments(div.innerHTML)), "content");

  R.set(false);
  Deps.flush();
  test.equal(trim(stripComments(div.innerHTML)), "");
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
  test.equal(trim(stripComments(div.innerHTML)), "content");

  R.set("baz");
  Deps.flush();
  test.equal(trim(stripComments(div.innerHTML)), "");
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
  test.equal(stripComments(stripComments(div.innerHTML)), "[111]");
  test.equal(initCount, 1);

  R1.set(2);
  Deps.flush();
  test.equal(stripComments(div.innerHTML), "[112]");
  test.equal(initCount, 1);

  R2.set(20);
  Deps.flush();
  test.equal(stripComments(div.innerHTML), "[122]");
  test.equal(initCount, 1);

  R3.set(200);
  Deps.flush();
  test.equal(stripComments(div.innerHTML), "[222]");
  test.equal(initCount, 1);

  R2.set(30);
  Deps.flush();
  test.equal(stripComments(div.innerHTML), "[232]");
  test.equal(initCount, 1);

  R1.set(3);
  Deps.flush();
  test.equal(stripComments(div.innerHTML), "[233]");
  test.equal(initCount, 1);

  R3.set(300);
  Deps.flush();
  test.equal(stripComments(div.innerHTML), "[333]");
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
  test.equal(trim(stripComments(div.innerHTML)), 'hello');
  R.set(false);
  Deps.flush();
  test.equal(trim(stripComments(div.innerHTML)), 'world');
  R.set(true);
  Deps.flush();
  test.equal(trim(stripComments(div.innerHTML)), 'hello');

  // Also test that `{{> content}}` in a custom block helper works.
  tmpl = Template.spacebars_template_test_nested_content2;
  R = ReactiveVar(true);
  tmpl.x = function () {
    return R.get();
  };
  div = renderToDiv(tmpl);
  test.equal(trim(stripComments(div.innerHTML)), 'hello');
  R.set(false);
  Deps.flush();
  test.equal(trim(stripComments(div.innerHTML)), 'world');
  R.set(true);
  Deps.flush();
  test.equal(trim(stripComments(div.innerHTML)), 'hello');
});

Tinytest.add("spacebars - template - if", function (test) {
  var tmpl = Template.spacebars_template_test_if;
  var R = ReactiveVar(true);
  tmpl.foo = function () {
    return R.get();
  };
  tmpl.bar = 1;
  tmpl.baz = 2;

  var div = renderToDiv(tmpl);
  var rendersTo = function (html) { divRendersTo(test, div, html); };

  rendersTo("1");
  R.set(false);
  rendersTo("2");
});

Tinytest.add("spacebars - template - if in with", function (test) {
  var tmpl = Template.spacebars_template_test_if_in_with;
  tmpl.foo = {bar: "bar"};

  var div = renderToDiv(tmpl);
  divRendersTo(test, div, "barbar");
});

Tinytest.add("spacebars - templates - each on cursor", function (test) {
  var tmpl = Template.spacebars_template_test_each;
  var coll = new Meteor.Collection(null);
  tmpl.items = function () {
    return coll.find({}, {sort: {pos: 1}});
  };

  var div = renderToDiv(tmpl);
  var rendersTo = function (html) { divRendersTo(test, div, html); };

  rendersTo("else-clause");
  coll.insert({text: "one", pos: 1});
  rendersTo("one");
  coll.insert({text: "two", pos: 2});
  rendersTo("onetwo");
  coll.update({text: "two"}, {$set: {text: "three"}});
  rendersTo("onethree");
  coll.update({text: "three"}, {$set: {pos: 0}});
  rendersTo("threeone");
  coll.remove({});
  rendersTo("else-clause");
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

  // XXX this is disgusting, i know.
  var htmlWithWhitespace = div.innerHTML.replace(/\<\!--IE--\>/g, ' ');
  var lines = _.filter(trim(htmlWithWhitespace).split(/\s/), function (line) {
    return line !== "";
  });
  test.equal(lines.join(" "), [
    "A", "B", "C", "D",
    // {{> spacebars_template_test_dots_subtemplate}}
    "TITLE", "1item", "2item", "3bar", "4foo", "GETTITLE", "5item", "6bar", "7foo",
    // {{> spacebars_template_test_dots_subtemplate ..}}
    "TITLE", "1bar", "2bar", "3item", "4bar", "GETTITLE", "5bar", "6item", "7bar"].join(" "));
});

Tinytest.add("spacebars - templates - select tags", function (test) {
  var tmpl = Template.spacebars_template_test_select_tag;

  // {label: (string)}
  var optgroups = new Meteor.Collection(null);

  // {optgroup: (id), value: (string), selected: (boolean), label: (string)}
  var options = new Meteor.Collection(null);

  tmpl.optgroups = function () { return optgroups.find(); };
  tmpl.options = function () { return options.find({optgroup: this._id}); };
  tmpl.selectedAttr = function () { return this.selected ? "selected" : ""; };

  var div = renderToDiv(tmpl);
  var selectEl = $(div).find('select')[0];

  // returns canonicalized contents of `div` in the form eg
  // ["<select>", "</select>"]. strip out selected attributes -- we
  // verify correctness by observing the `selected` property
  var divContent = function () {
    var lines = trim(canonicalizeHtml(
      div.innerHTML.replace(/selected="[^"]*"/g, '').replace(/selected/g, '')))
          .replace(/\>\s*\</g, '>\n<')
          .split('\n');
    return trimmedLines = _.filter(
      _.map(lines, trim),
      function (x) { return x !== ""; });
  };

  test.equal(divContent(), ["<select>", "</select>"]);

  var optgroup1 = optgroups.insert({label: "one"});
  var optgroup2 = optgroups.insert({label: "two"});
  test.equal(divContent(), [
    '<select>',
    '<optgroup label="one">',
    '</optgroup>',
    '<optgroup label="two">',
    '</optgroup>',
    '</select>'
  ]);

  options.insert({optgroup: optgroup1, value: "value1", selected: false, label: "label1"});
  options.insert({optgroup: optgroup1, value: "value2", selected: true, label: "label2"});
  test.equal(divContent(), [
    '<select>',
    '<optgroup label="one">',
    '<option value="value1">label1</option>',
    '<option value="value2">label2</option>',
    '</optgroup>',
    '<optgroup label="two">',
    '</optgroup>',
    '</select>'
  ]);
  test.equal(selectEl.value, "value2");
  test.equal($(selectEl).find('option')[0].selected, false);
  test.equal($(selectEl).find('option')[1].selected, true);

  // swap selection
  options.update({value: "value1"}, {$set: {selected: true}});
  options.update({value: "value2"}, {$set: {selected: false}});
  Deps.flush();

  test.equal(divContent(), [
    '<select>',
    '<optgroup label="one">',
    '<option value="value1">label1</option>',
    '<option value="value2">label2</option>',
    '</optgroup>',
    '<optgroup label="two">',
    '</optgroup>',
    '</select>'
  ]);
  test.equal(selectEl.value, "value1");
  test.equal($(selectEl).find('option')[0].selected, true);
  test.equal($(selectEl).find('option')[1].selected, false);

  // change value and label
  options.update({value: "value1"}, {$set: {value: "value1.0"}});
  options.update({value: "value2"}, {$set: {label: "label2.0"}});
  Deps.flush();

  test.equal(divContent(), [
    '<select>',
    '<optgroup label="one">',
    '<option value="value1.0">label1</option>',
    '<option value="value2">label2.0</option>',
    '</optgroup>',
    '<optgroup label="two">',
    '</optgroup>',
    '</select>'
  ]);
  test.equal(selectEl.value, "value1.0");
  test.equal($(selectEl).find('option')[0].selected, true);
  test.equal($(selectEl).find('option')[1].selected, false);

  // unselect and then select both options. normally, the second is
  // selected (since it got selected later). then switch to <select
  // multiple="">. both should be selected.
  options.update({}, {$set: {selected: false}}, {multi: true});
  Deps.flush();
  options.update({}, {$set: {selected: true}}, {multi: true});
  Deps.flush();
  test.equal($(selectEl).find('option')[0].selected, false);
  test.equal($(selectEl).find('option')[1].selected, true);

  selectEl.multiple = true; // allow multiple selection
  options.update({}, {$set: {selected: false}}, {multi: true});
  Deps.flush();
  options.update({}, {$set: {selected: true}}, {multi: true});
  window.avital = true;
  Deps.flush();
  test.equal($(selectEl).find('option')[0].selected, true);
  test.equal($(selectEl).find('option')[1].selected, true);
});

Tinytest.add('spacebars - templates - {{#with}} falsy; issue #770', function (test) {
  Template.test_template_issue770.value1 = function () { return "abc"; };
  Template.test_template_issue770.value2 = function () { return false; };
  var div = renderToDiv(Template.test_template_issue770);
  test.equal(canonicalizeHtml(trimAndRemoveSpaces(div.innerHTML)),
             "abcxxxabc");
});

Tinytest.add("spacebars - templates - tricky attrs", function (test) {
  var tmpl = Template.spacebars_template_test_tricky_attrs;
  tmpl.theType = function () { return 'text'; };
  var R = ReactiveVar('foo');
  tmpl.theClass = function () { return R.get(); };

  var div = renderToDiv(tmpl);
  test.equal(trim(canonicalizeHtml(div.innerHTML)).slice(0, 30),
             '<input type="text"><input class="foo" type="checkbox">'.slice(0, 30));

  R.set('bar');
  Deps.flush();
  test.equal(trim(canonicalizeHtml(div.innerHTML)),
             '<input type="text"><input class="bar" type="checkbox">');

});

Tinytest.add('spacebars - templates - no data context', function (test) {
  var tmpl = Template.spacebars_template_test_no_data;

  // failure is if an exception is thrown here
  var div = renderToDiv(tmpl);
  test.equal(canonicalizeHtml(div.innerHTML), 'asdf');
});

// test that #isolate is a no-op, for back compat
Tinytest.add('spacebars - templates - isolate', function (test) {
  var tmpl = Template.spacebars_template_test_isolate;

  var div = renderToDiv(tmpl);
  test.equal(canonicalizeHtml(div.innerHTML), 'hello');

});

// test that #constant is a no-op, for back compat
Tinytest.add('spacebars - templates - constant', function (test) {
  var tmpl = Template.spacebars_template_test_constant;

  var div = renderToDiv(tmpl);
  test.equal(canonicalizeHtml(div.innerHTML), 'hello');

});

Tinytest.add('spacebars - templates - textarea', function (test) {
  var tmpl = Template.spacebars_template_test_textarea;

  var R = ReactiveVar('hello');

  tmpl.foo = function () {
    return R.get();
  };

  var div = renderToDiv(tmpl);
  var textarea = div.querySelector('textarea');
  test.equal(textarea.value, 'hello');

  R.set('world');
  Deps.flush();
  test.equal(textarea.value, 'world');

});

Tinytest.add('spacebars - templates - textarea 2', function (test) {
  var tmpl = Template.spacebars_template_test_textarea2;

  var R = ReactiveVar(true);

  tmpl.foo = function () {
    return R.get();
  };

  var div = renderToDiv(tmpl);
  var textarea = div.querySelector('textarea');
  test.equal(textarea.value, '</not a tag>');

  R.set(false);
  Deps.flush();
  test.equal(textarea.value, '<also not a tag>');

  R.set(true);
  Deps.flush();
  test.equal(textarea.value, '</not a tag>');

});

Tinytest.add('spacebars - templates - textarea each', function (test) {
  var tmpl = Template.spacebars_template_test_textarea_each;

  var R = ReactiveVar(['APPLE', 'BANANA']);

  tmpl.foo = function () {
    return R.get();
  };

  var div = renderToDiv(tmpl);
  var textarea = div.querySelector('textarea');
  test.equal(textarea.value, '<not a tag APPLE <not a tag BANANA ');

  R.set([]);
  Deps.flush();
  test.equal(textarea.value, '<>');

  R.set(['CUCUMBER']);
  Deps.flush();
  test.equal(textarea.value, '<not a tag CUCUMBER ');

});

// Ensure that one can call `Meteor.defer` within a rendered callback
// triggered by a document insertion that happend in a method stub.
testAsyncMulti('spacebars - template - defer in rendered callbacks', [function (test, expect) {
  var tmpl = Template.spacebars_template_test_defer_in_rendered;
  var coll = new Meteor.Collection("test-defer-in-rendered--client-only");
  tmpl.items = function () {
    return coll.find();
  };

  var subtmpl = Template.spacebars_template_test_defer_in_rendered_subtemplate;
  subtmpl.rendered = expect(function () {
    // will throw if called in a method stub
    Meteor.defer(function () {
    });
  });

  var div = renderToDiv(tmpl);

  // `coll` is not defined on the server so we'll get an error.  We
  // can't make this a client-only collection since then we won't be
  // running in a stub and the error won't fire.
  Meteor._suppress_log(1);
  // cause a new instance of `subtmpl` to be placed in the DOM. verify
  // that it's not fired directly within a method stub, in which
  // `Meteor.defer` is not allowed.
  coll.insert({});
}]);

// Test that in:
//
// ```
// {{#with someData}}
//   {{foo}} {{bar}}
// {{/with}}
// ```
//
// ... we run `someData` once even if `foo` re-renders.
Tinytest.add('spacebars - templates - with someData', function (test) {
  var tmpl = Template.spacebars_template_test_with_someData;

  var foo = ReactiveVar('AAA');
  var someDataRuns = 0;

  tmpl.someData = function () {
    someDataRuns++;
    return {};
  };
  tmpl.foo = function () {
    return foo.get();
  };
  tmpl.bar = function () {
    return 'YO';
  };

  var div = renderToDiv(tmpl);

  test.equal(someDataRuns, 1);
  test.equal(trim(stripComments(div.innerHTML)), 'AAA YO');

  foo.set('BBB');
  Deps.flush();
  test.equal(someDataRuns, 1);
  test.equal(trim(stripComments(div.innerHTML)), 'BBB YO');

  foo.set('CCC');
  Deps.flush();
  test.equal(someDataRuns, 1);
  test.equal(trim(stripComments(div.innerHTML)), 'CCC YO');
});

Tinytest.add('spacebars - template - #each stops when rendered element is removed', function (test) {
  var tmpl = Template.spacebars_template_test_each_stops;
  var coll = new Meteor.Collection(null);
  coll.insert({});
  tmpl.items = function () { return coll.find(); };

  var div = renderToDiv(tmpl);
  divRendersTo(test, div, 'x');

  // trigger #each component destroyed
  $(div).remove();

  // insert another document. cursor should no longer be observed so
  // should have no effect.
  coll.insert({});
  divRendersTo(test, div, 'x');
});

Tinytest.add('spacebars - templates - block helpers in attribute', function (test) {
  var tmpl = Template.spacebars_template_test_block_helpers_in_attribute;

  var coll = new Meteor.Collection(null);
  tmpl.classes = function () {
    return coll.find({}, {sort: {name: 1}});
  };
  tmpl.startsLowerCase = function (name) {
    return /^[a-z]/.test(name);
  };
  coll.insert({name: 'David'});
  coll.insert({name: 'noodle'});
  coll.insert({name: 'donut'});
  coll.insert({name: 'frankfurter'});
  coll.insert({name: 'Steve'});

  var containerDiv = renderToDiv(tmpl);
  var div = containerDiv.querySelector('div');

  var shouldBe = function (className) {
    Deps.flush();
    test.equal(div.innerHTML, "Hello");
    test.equal(div.className, className);
    test.equal(canonicalizeHtml(containerDiv.innerHTML), '<div class="' + className + '">Hello</div>');
  };

  shouldBe('donut frankfurter noodle');
  coll.remove({name: 'frankfurter'}); // (it was kind of a mouthful)
  shouldBe('donut noodle');
  coll.remove({name: 'donut'});
  shouldBe('noodle');
  coll.remove({name: 'noodle'});
  shouldBe(''); // 'David' and 'Steve' appear in the #each but fail the #if
  coll.remove({});
  shouldBe('none'); // now the `{{else}}` case kicks in
  coll.insert({name: 'bubblegum'});
  shouldBe('bubblegum');
});

Tinytest.add('spacebars - templates - block helpers in attribute 2', function (test) {
  var tmpl = Template.spacebars_template_test_block_helpers_in_attribute_2;

  var R = ReactiveVar(true);

  tmpl.foo = function () { return R.get(); };

  var div = renderToDiv(tmpl);
  var input = div.querySelector('input');

  test.equal(input.value, '"');
  R.set(false);
  Deps.flush();
  test.equal(input.value, '&<></x>');
});
