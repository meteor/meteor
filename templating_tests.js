
Tinytest.add("templating - assembly", function (test) {

  // Test for a bug that made it to production -- after a replacement,
  // we need to also check the newly replaced node for replacements
  var frag = Meteor.render(Template.test_assembly_a0);
  test.equal(canonicalizeHtml(DomUtils.fragmentToHtml(frag)),
               "Hi");

  // Another production bug -- we must use LiveRange to replace the
  // placeholder, or risk breaking other LiveRanges
  Session.set("stuff", true); // XXX bad form to use Session in a test?
  Template.test_assembly_b1.stuff = function () {
    return Session.get("stuff");
  };
  var onscreen = DIV({style: "display: none"}, [
    Meteor.render(Template.test_assembly_b0)]);
  document.body.appendChild(onscreen);
  test.equal(canonicalizeHtml(onscreen.innerHTML), "xyhi");
  Session.set("stuff", false);
  Deps.flush();
  test.equal(canonicalizeHtml(onscreen.innerHTML), "xhi");
  document.body.removeChild(onscreen);
  Deps.flush();
});

// Test that if a template throws an error, then pending_partials is
// cleaned up properly (that template rendering doesn't break..)






Tinytest.add("templating - table assembly", function(test) {
  var childWithTag = function(node, tag) {
    return _.find(node.childNodes, function(n) {
      return n.nodeName === tag;
    });
  };

  var table;

  table = childWithTag(Meteor.render(Template.test_table_a0), "TABLE");

  // table.rows is a great test, as it fails not only when TR/TD tags are
  // stripped due to improper html-to-fragment, but also when they are present
  // but don't show up because we didn't create a TBODY for IE.
  test.equal(table.rows.length, 3);

  // this time with an explicit TBODY
  table = childWithTag(Meteor.render(Template.test_table_b0), "TABLE");
  test.equal(table.rows.length, 3);

  var c = new LocalCollection();
  c.insert({bar:'a'});
  c.insert({bar:'b'});
  c.insert({bar:'c'});
  var onscreen = DIV({style: "display: none;"});
  onscreen.appendChild(
    Meteor.render(_.bind(Template.test_table_each, null, {foo: c.find()})));
  document.body.appendChild(onscreen);
  table = childWithTag(onscreen, "TABLE");

  test.equal(table.rows.length, 3, table.parentNode.innerHTML);
  var tds = onscreen.getElementsByTagName("TD");
  test.equal(tds.length, 3);
  test.equal(tds[0].innerHTML, "a");
  test.equal(tds[1].innerHTML, "b");
  test.equal(tds[2].innerHTML, "c");


  document.body.removeChild(onscreen);
  Deps.flush();
});

Tinytest.add("templating - event handler this", function(test) {

  Template.test_event_data_with.ONE = {str: "one"};
  Template.test_event_data_with.TWO = {str: "two"};
  Template.test_event_data_with.THREE = {str: "three"};

  Template.test_event_data_with.events({
    'click': function(event, template) {
      test.isTrue(this.str);
      test.equal(template.data.str, "one");
      event_buf.push(this.str);
    }
  });

  var event_buf = [];
  var tmpl = OnscreenDiv(
    Meteor.render(function () {
      return Template.test_event_data_with(
        Template.test_event_data_with.ONE);
    }));

  var divs = tmpl.node().getElementsByTagName("div");
  test.equal(3, divs.length);

  clickElement(divs[0]);
  test.equal(event_buf, ['one']);
  event_buf.length = 0;

  clickElement(divs[1]);
  test.equal(event_buf, ['two']);
  event_buf.length = 0;

  clickElement(divs[2]);
  test.equal(event_buf, ['three']);
  event_buf.length = 0;

  tmpl.kill();
  Deps.flush();
});

Tinytest.add("templating - safestring", function(test) {

  Template.test_safestring_a.foo = function() {
    return "1<2";
  };
  Template.test_safestring_a.bar = function() {
    return new Handlebars.SafeString("3<4");
  };

  var obj = {fooprop: "1<2",
             barprop: new Handlebars.SafeString("3<4")};

  test.equal(Template.test_safestring_a(obj).replace(/\s+/g, ' '),
             "1&lt;2 1<2 3<4 3<4 1<2 3<4 "+
             "1&lt;2 1<2 3<4 3<4 1<2 3<4");

});

Tinytest.add("templating - helpers and dots", function(test) {
  Handlebars.registerHelper("platypus", function() {
    return "eggs";
  });
  Handlebars.registerHelper("watermelon", function() {
    return "seeds";
  });

  Handlebars.registerHelper("daisygetter", function() {
    return this.daisy;
  });

  // XXX for debugging
  Handlebars.registerHelper("debugger", function() {
    debugger;
  });

  var getFancyObject = function() {
    return {
      foo: 'bar',
      apple: {banana: 'smoothie'},
      currentFruit: function() {
        return 'guava';
      },
      currentCountry: function() {
        return {name: 'Iceland',
                _pop: 321007,
                population: function() {
                  return this._pop;
                },
                unicorns: 0, // falsy value
                daisyGetter: function() {
                  return this.daisy;
                }
               };
      }
    };
  };

  Handlebars.registerHelper("fancyhelper", getFancyObject);

  Template.test_helpers_a.platypus = 'bill';
  Template.test_helpers_a.warthog = function() {
    return 'snout';
  };

  var listFour = function(a, b, c, d, options) {
    var keywordArgs = _.map(_.keys(options.hash), function(k) {
      return k+':'+options.hash[k];
    });
    return [a, b, c, d].concat(keywordArgs).join(' ');
  };

  var dataObj = {
    zero: 0,
    platypus: 'weird',
    watermelon: 'rind',
    daisy: 'petal',
    tree: function() { return 'leaf'; },
    thisTest: function() { return this.tree(); },
    getNull: function() { return null; },
    getUndefined: function () { return; },
    fancy: getFancyObject(),
    methodListFour: listFour
  };

  test.equal(Template.test_helpers_a(dataObj).match(/\S+/g), [
    'platypus=bill', // helpers on Template object take first priority
    'watermelon=seeds', // global helpers take second priority
    'daisy=petal', // unshadowed object property
    'tree=leaf', // function object property
    'warthog=snout' // function Template property
  ]);

  test.equal(Template.test_helpers_b(dataObj).match(/\S+/g), [
    // unknown properties silently fail
    'unknown=',
    // falsy property comes through
    'zero=0'
  ]);

  test.equal(Template.test_helpers_c(dataObj).match(/\S+/g), [
    // property gets are supposed to silently fail
    'platypus.X=',
    'watermelon.X=',
    'daisy.X=',
    'tree.X=',
    'warthog.X=',
    'getNull.X=',
    'getUndefined.X=',
    'getUndefined.X.Y='
  ]);

  test.equal(Template.test_helpers_d(dataObj).match(/\S+/g), [
    // helpers should get current data context in `this`
    'daisygetter=petal',
    // object methods should get object in `this`
    'thisTest=leaf',
    // nesting inside {{#with fancy}} shouldn't affect
    // method
    '../thisTest=leaf',
    // combine .. and .
    '../fancy.currentFruit=guava'
  ]);

  test.equal(Template.test_helpers_e(dataObj).match(/\S+/g), [
    'fancy.foo=bar',
    'fancy.apple.banana=smoothie',
    'fancy.currentFruit=guava',
    'fancy.currentCountry.name=Iceland',
    'fancy.currentCountry.population=321007',
    'fancy.currentCountry.unicorns=0'
  ]);

  test.equal(Template.test_helpers_f(dataObj).match(/\S+/g), [
    'fancyhelper.foo=bar',
    'fancyhelper.apple.banana=smoothie',
    'fancyhelper.currentFruit=guava',
    'fancyhelper.currentCountry.name=Iceland',
    'fancyhelper.currentCountry.population=321007',
    'fancyhelper.currentCountry.unicorns=0'
  ]);

  // test significance of 'this', which prevents helper from
  // shadowing property
  test.equal(Template.test_helpers_g(dataObj).match(/\S+/g), [
    'platypus=eggs',
    'this.platypus=weird'
  ]);

  // test interpretation of arguments

  Template.test_helpers_h.helperListFour = listFour;

  var trials =
        Template.test_helpers_h(dataObj).match(/\(.*?\)/g);
  test.equal(trials[0],
             '(methodListFour 6 7 8 9=6 7 8 9)');
  test.equal(trials[1],
             '(methodListFour platypus thisTest fancyhelper.currentFruit fancyhelper.currentCountry.unicorns=eggs leaf guava 0)');
  test.equal(trials[2],
             '(methodListFour platypus thisTest fancyhelper.currentFruit fancyhelper.currentCountry.unicorns a=platypus b=thisTest c=fancyhelper.currentFruit d=fancyhelper.currentCountry.unicorns=eggs leaf guava 0 a:eggs b:leaf c:guava d:0)');
  test.equal(trials[3],
             '(helperListFour platypus thisTest fancyhelper.currentFruit fancyhelper.currentCountry.unicorns=eggs leaf guava 0)');
  test.equal(trials[4],
             '(helperListFour platypus thisTest fancyhelper.currentFruit fancyhelper.currentCountry.unicorns a=platypus b=thisTest c=fancyhelper.currentFruit d=fancyhelper.currentCountry.unicorns=eggs leaf guava 0 a:eggs b:leaf c:guava d:0)');
  test.equal(trials.length, 5);

  // test interpretation of block helper invocation

  Template.test_helpers_i.uppercase = function(fn) {
    return fn().toUpperCase();
  };
  Template.test_helpers_i.tr = function(options) {
    var str = options.fn();
    _.each(options.hash, function(v,k) {
      str = str.replace(new RegExp(k, 'g'), v);
    });
    return str;
  };
  Template.test_helpers_i.arg_and_dict = function(arg, options) {
    if (typeof options.hash !== "object")
      throw new Error();
    return _.keys(options.hash).length;
  };
  Template.test_helpers_i.get_arg = function(arg) {
    return arg;
  };
  Template.test_helpers_i.two_args = function(arg1, arg2) {
    return [typeof arg1 === "string",
            typeof arg2 === "string"].join();
  };
  Template.test_helpers_i.helperListFour = listFour;

  trials =
        Template.test_helpers_i(dataObj).match(/\(.*?\)/g);
  test.equal(trials[0], "(uppercase apple=APPLE)");
  test.equal(trials[1], "(altered banana=bododo)");
  // presence of arg should prevent keyword arguments from
  // being passed to block helper, whether or not the arg
  // is a function.
  test.equal(trials[2], "(nokeys=0)");
  test.equal(trials[3], "(nokeys=0)");
  test.equal(trials[4],
             '(biggie=eggs leaf guava 0 a:eggs b:leaf c:guava d:0)');
  // can't pass > 1 positional arg to block helper
  test.equal(trials[5], "(twoArgBlock=true,false)");
  test.equal(trials.length, 6);
});


Tinytest.add("templating - rendered template", function(test) {
  var R = ReactiveVar('foo');
  Template.test_render_a.foo = function() {
    R.get();
    return this.x + 1;
  };

  Template.test_render_a.preserve(['br']);

  var div = OnscreenDiv(
    Meteor.render(function () {
      return Template.test_render_a({ x: 123 });
    }));

  test.equal(div.text().match(/\S+/)[0], "124");

  var br1 = div.node().getElementsByTagName('br')[0];
  var hr1 = div.node().getElementsByTagName('hr')[0];
  test.isTrue(br1);
  test.isTrue(hr1);

  R.set('bar');
  Deps.flush();
  var br2 = div.node().getElementsByTagName('br')[0];
  var hr2 = div.node().getElementsByTagName('hr')[0];
  test.isTrue(br2);
  test.isTrue(br1 === br2);
  test.isTrue(hr2);
  test.isFalse(hr1 === hr2);

  div.kill();
  Deps.flush();

  /////

  R = ReactiveVar('foo');

  Template.test_render_b.foo = function() {
    R.get();
    return (+this) + 1;
  };
  Template.test_render_b.preserve(['br']);

  div = OnscreenDiv(
    Meteor.render(function () {
      return Template.test_render_b({ x: 123 });
    }));

  test.equal(div.text().match(/\S+/)[0], "201");

  var br1 = div.node().getElementsByTagName('br')[0];
  var hr1 = div.node().getElementsByTagName('hr')[0];
  test.isTrue(br1);
  test.isTrue(hr1);

  R.set('bar');
  Deps.flush();
  var br2 = div.node().getElementsByTagName('br')[0];
  var hr2 = div.node().getElementsByTagName('hr')[0];
  test.isTrue(br2);
  test.isTrue(br1 === br2);
  test.isTrue(hr2);
  test.isFalse(hr1 === hr2);

  div.kill();
  Deps.flush();

  /////

  var stuff = new LocalCollection();
  stuff.insert({foo:'bar'});

  Template.test_render_c.preserve(['br']);

  div = OnscreenDiv(
    Meteor.renderList(
      stuff.find(), function (data) {
        return Template.test_render_c(data, 'blah');
      }));

  var br1 = div.node().getElementsByTagName('br')[0];
  var hr1 = div.node().getElementsByTagName('hr')[0];
  test.isTrue(br1);
  test.isTrue(hr1);

  stuff.update({foo:'bar'}, {$set: {foo: 'baz'}});
  Deps.flush();
  var br2 = div.node().getElementsByTagName('br')[0];
  var hr2 = div.node().getElementsByTagName('hr')[0];
  test.isTrue(br2);
  test.isTrue(br1 === br2);
  test.isTrue(hr2);
  test.isFalse(hr1 === hr2);

  div.kill();
  Deps.flush();

  /////

  var stuff = new LocalCollection();
  stuff.insert({foo:'bar'});

  Template.test_render_c.preserve(['br']);

  div = OnscreenDiv(Meteor.renderList(stuff.find(),
                                      Template.test_render_c));

  var br1 = div.node().getElementsByTagName('br')[0];
  var hr1 = div.node().getElementsByTagName('hr')[0];
  test.isTrue(br1);
  test.isTrue(hr1);

  stuff.update({foo:'bar'}, {$set: {foo: 'baz'}});
  Deps.flush();
  var br2 = div.node().getElementsByTagName('br')[0];
  var hr2 = div.node().getElementsByTagName('hr')[0];
  test.isTrue(br2);
  test.isTrue(br1 === br2);
  test.isTrue(hr2);
  test.isFalse(hr1 === hr2);

  div.kill();
  Deps.flush();

});

Tinytest.add("templating - branch labels", function(test) {
  var R = ReactiveVar('foo');
  Template.test_branches_a['var'] = function () {
    return R.get();
  };

  var elems = [];

  // use constant landmarks to test that each
  // block helper invocation gets a different label
  Template.test_branches_a.myConstant = function (options) {
    var data = this;
    var firstRender = true;
    return Spark.createLandmark({ constant: true,
                                  rendered: function () {
                                    if (! firstRender)
                                      return;
                                    firstRender = false;
                                    var hr = this.find('hr');
                                    hr.myIndex = elems.length;
                                    elems.push(this.find('hr'));
                                  }},
                                function () {
                                  return options.fn(data);
                                });
  };

  var div = OnscreenDiv(Meteor.render(Template.test_branches_a));
  Deps.flush();
  test.equal(DomUtils.find(div.node(), 'span').innerHTML, 'foo');
  test.equal(elems.length, 3);

  R.set('bar');
  Deps.flush();
  var elems2 = DomUtils.findAll(div.node(), 'hr');
  elems2.sort(function(a, b) { return a.myIndex - b.myIndex; });
  test.equal(elems[0], elems2[0]);
  test.equal(elems[1], elems2[1]);
  test.equal(elems[2], elems2[2]);
  test.equal(DomUtils.find(div.node(), 'span').innerHTML, 'bar');

  div.kill();
  Deps.flush();
});

Tinytest.add("templating - matching in list", function (test) {
  var c = new LocalCollection();
  c.insert({letter:'a'});
  c.insert({letter:'b'});
  c.insert({letter:'c'});

  _.extend(Template.test_listmatching_a0, {
    'var': function () { return R.get(); },
    c: function () { return c.find(); }
  });

  var buf = [];
  _.extend(Template.test_listmatching_a1, {
    created: function () { buf.push('+'); },
    rendered: function () {
      var letter = canonicalizeHtml(
        DomUtils.rangeToHtml(this.firstNode,
                             this.lastNode).match(/\S+/)[0]);
      buf.push('*'+letter);
    },
    destroyed: function () { buf.push('-'); }
  });

  var R = ReactiveVar('foo');
  var div = OnscreenDiv(Spark.render(Template.test_listmatching_a0));
  Deps.flush();

  test.equal(DomUtils.find(div.node(), 'span').innerHTML, 'foo');
  test.equal(div.html().match(/<p>(.*?)<\/p>/)[1].match(/\S+/g), ['a','b','c']);
  test.equal(buf.join(''), '+++*a*b*c');

  buf.length = 0;
  R.set('bar');
  Deps.flush();
  test.equal(DomUtils.find(div.node(), 'span').innerHTML, 'bar');
  test.equal(div.html().match(/<p>(.*?)<\/p>/)[1].match(/\S+/g), ['a','b','c']);
  test.equal(buf.join(''), '*a*b*c');

  div.kill();
  Deps.flush();

});

Tinytest.add("templating - isolate helper", function (test) {
  var Rs = _.map(_.range(4), function () { return ReactiveVar(1); });
  var touch = function (n) { Rs[n-1].get(); };
  var bump = function (n) { Rs[n-1].set(Rs[n-1].get() + 1); };
  var counts = _.map(_.range(4), function () { return 0; });
  var tally = function (n) { return ++counts[n-1]; };

  _.extend(Template.test_isolate_a, {
    helper: function (n) {
      touch(n);
      return tally(n);
    }
  });

  var div = OnscreenDiv(Meteor.render(Template.test_isolate_a));

  var getTallies = function () {
    return _.map(div.html().match(/\S+/g), Number);
  };
  var expect = function(str) {
    test.equal(getTallies().join(','), str);
  };

  Deps.flush();
  expect("1,1,1,1");
  bump(1);  Deps.flush();  expect("2,2,2,2");
  bump(2);  Deps.flush();  expect("2,3,3,3");
  bump(3);  Deps.flush();  expect("2,3,4,4");
  bump(4);  Deps.flush();  expect("2,3,4,5");
  Deps.flush(); expect("2,3,4,5");
  bump(3);  Deps.flush();  expect("2,3,5,6");
  bump(2);  Deps.flush();  expect("2,4,6,7");
  bump(1);  Deps.flush();  expect("3,5,7,8");

  div.kill();
  Deps.flush();

});

Tinytest.add("templating - template arg", function (test) {
  Template.test_template_arg_a.events({
    click: function (event, template) {
      template.firstNode.innerHTML = 'Hello';
      template.lastNode.innerHTML = 'World';
      template.find('i').innerHTML =
        (template.findAll('*').length)+"-element";
      template.lastNode.innerHTML += ' (the secret is '+
        template.secret+')';
    }
  });

  Template.test_template_arg_a.created = function() {
    var self = this;
    test.isFalse(self.firstNode);
    test.isFalse(self.lastNode);
    test.throws(function () { return self.find("*"); });
    test.throws(function () { return self.findAll("*"); });
  };

  Template.test_template_arg_a.rendered = function () {
    var template = this;
    template.firstNode.innerHTML = 'Greetings';
    template.lastNode.innerHTML = 'Line';
    template.find('i').innerHTML =
      (template.findAll('b').length)+"-bold";
    template.secret = "strawberry "+template.data.food;
  };

  Template.test_template_arg_a.destroyed = function() {
    var self = this;
    test.isFalse(self.firstNode);
    test.isFalse(self.lastNode);
    test.throws(function () { return self.find("*"); });
    test.throws(function () { return self.findAll("*"); });
  };

  var div = OnscreenDiv(Spark.render(function () {
    return Template.test_template_arg_a({food: "pie"});
  }));

  test.equal(div.text(), "Foo Bar Baz");
  Deps.flush();
  test.equal(div.text(), "Greetings 1-bold Line");
  clickElement(DomUtils.find(div.node(), 'i'));
  test.equal(div.text(), "Hello 3-element World (the secret is strawberry pie)");

  div.kill();
  Deps.flush();
});

Tinytest.add("templating - preserve", function (test) {
  var R = ReactiveVar('foo');

  var tmpl = Template.test_template_preserve_a;
  tmpl.preserve(['.b']);
  tmpl.preserve(['.c']);
  tmpl.preserve({'.d': true});
  tmpl.preserve({'span': function (n) {
    return _.contains(['e','f'], n.className) && n.className;
  }});
  tmpl.preserve(['span.a']);
  tmpl['var'] = function () { return R.get(); };

  var div = OnscreenDiv(Meteor.render(tmpl));
  Deps.flush();
  test.equal(DomUtils.find(div.node(), 'u').firstChild.nodeValue.match(
      /\S+/)[0], 'foo');
  var spans1 = {};
  _.each(DomUtils.findAll(div.node(), 'span'), function (sp) {
    spans1[sp.className] = sp;
  });

  R.set('bar');
  Deps.flush();
  test.equal(DomUtils.find(div.node(), 'u').firstChild.nodeValue.match(
      /\S+/)[0], 'bar');
  var spans2 = {};
  _.each(DomUtils.findAll(div.node(), 'span'), function (sp) {
    spans2[sp.className] = sp;
  });

  test.isTrue(spans1.a === spans2.a);
  test.isTrue(spans1.b === spans2.b);
  test.isTrue(spans1.c === spans2.c);
  test.isTrue(spans1.d === spans2.d);
  test.isTrue(spans1.e === spans2.e);
  test.isTrue(spans1.f === spans2.f);
  test.isFalse(spans1.y === spans2.y);
  test.isFalse(spans1.z === spans2.z);

  div.kill();
  Deps.flush();
});

Tinytest.add("templating - helpers", function (test) {
  var tmpl = Template.test_template_helpers_a;

  tmpl.foo = 'z';
  tmpl.helpers({bar: 'b'});
  // helpers(...) takes precendence of assigned helper
  tmpl.helpers({foo: 'a', baz: function() { return 'c'; }});

  var div = OnscreenDiv(Meteor.render(tmpl));
  test.equal(div.text().match(/\S+/)[0], 'abc');
  div.kill();
  Deps.flush();

  tmpl = Template.test_template_helpers_b;

  tmpl.helpers({
    'name': 'A',
    'arity': 'B',
    'toString': 'C',
    'length': 4,
    'var': 'D'
  });

  div = OnscreenDiv(Meteor.render(tmpl));
  var txt = div.text().match(/\S+/)[0];
  test.isTrue(txt.match(/^ABC?4D$/));
  // We don't get 'C' (the ability to name a helper {{toString}})
  // in IE < 9 because of the famed DontEnum bug.  This could be
  // fixed but it would require making all the code that handles
  // the dictionary of helpers be DontEnum-aware.  In practice,
  // the Object prototype method names (toString, hasOwnProperty,
  // isPropertyOf, ...) make poor helper names and are unlikely
  // to be used in apps.
  test.expect_fail();
  test.equal(txt, 'ABC4D');
  div.kill();
  Deps.flush();

  // test that helpers don't "leak"
  tmpl = Template.test_template_helpers_c;
  div = OnscreenDiv(Meteor.render(tmpl));
  test.equal(div.text(), 'x');
  div.kill();
  Deps.flush();
});

Tinytest.add("templating - events", function (test) {
  var tmpl = Template.test_template_events_a;

  var buf = [];

  // old style
  tmpl.events = {
    'click b': function () { buf.push('b'); }
  };

  var div = OnscreenDiv(Meteor.render(tmpl));
  clickElement(DomUtils.find(div.node(), 'b'));
  test.equal(buf, ['b']);
  div.kill();
  Deps.flush();

  ///

  tmpl = Template.test_template_events_b;
  buf = [];
  // new style
  tmpl.events({
    'click u': function () { buf.push('u'); }
  });
  tmpl.events({
    'click i': function () { buf.push('i'); }
  });

  var div = OnscreenDiv(Meteor.render(tmpl));
  clickElement(DomUtils.find(div.node(), 'u'));
  clickElement(DomUtils.find(div.node(), 'i'));
  test.equal(buf, ['u', 'i']);
  div.kill();
  Deps.flush();

  //Test for identical callbacks for issue #650
  tmpl = Template.test_template_events_c;
  buf = [];
  tmpl.events({
    'click u': function () { buf.push('a'); }
  });
  tmpl.events({
    'click u': function () { buf.push('b'); }
  });

  div = OnscreenDiv(Meteor.render(tmpl));
  clickElement(DomUtils.find(div.node(), 'u'));
  test.equal(buf.length, 2);
  test.isTrue(_.contains(buf, 'a'));
  test.isTrue(_.contains(buf, 'b'));
  div.kill();
  Deps.flush();
});

Tinytest.add("templating - #each rendered callback", function (test) {
  // test that any list modification triggers a rendered callback on the
  // enclosing template

  var entries = new LocalCollection();
  entries.insert({x:'a'});
  entries.insert({x:'b'});
  entries.insert({x:'c'});

  var buf = [];

  var tmpl = Template.test_template_eachrender_a;
  tmpl.helpers({entries: function() {
    return entries.find({}, {sort: ['x']}); }});
  tmpl.rendered = function () {
    buf.push(canonicalizeHtml(
      DomUtils.rangeToHtml(this.firstNode, this.lastNode)).replace(/\s/g, ''));
  };
  var div = OnscreenDiv(Meteor.render(tmpl));
  Deps.flush();
  test.equal(buf, ['<div>a</div><div>b</div><div>c</div>']);
  buf.length = 0;

  // added
  entries.insert({x:'d'});
  test.equal(buf, []);
  Deps.flush();
  test.equal(buf, ['<div>a</div><div>b</div><div>c</div><div>d</div>']);
  buf.length = 0;

  // removed
  entries.remove({x:'a'});
  test.equal(buf, []);
  Deps.flush();
  test.equal(buf, ['<div>b</div><div>c</div><div>d</div>']);
  buf.length = 0;

  // moved/changed
  entries.update({x:'b'}, {$set: {x: 'z'}});
  test.equal(buf, []);
  Deps.flush();
  test.equal(buf, ['<div>c</div><div>d</div><div>z</div>',
                   '<div>c</div><div>d</div><div>z</div>']);
  buf.length = 0;

  div.kill();
  Deps.flush();

  // test pure "moved"

  tmpl = Template.test_template_eachrender_b;
  var cbks = [];
  var xs = ['a','b','c'];
  tmpl.helpers({entries: function() {
    return { observeChanges: function (callbacks) {
      cbks.push(callbacks);
      _.each(xs, function(x) {
        callbacks.addedBefore(x, {x:x}, null);
      });
      return {
        stop: function () {
          cbks = _.without(cbks, callbacks);
        }
      };
    }};
  }});
  tmpl.rendered = function () {
    buf.push(canonicalizeHtml(
      DomUtils.rangeToHtml(this.firstNode, this.lastNode)).replace(/\s/g, ''));
  };
  buf = [];
  var div = OnscreenDiv(Meteor.render(tmpl));
  test.equal(buf, []);
  Deps.flush();
  test.equal(buf, ['<div>a</div><div>b</div><div>c</div>']);
  buf.length = 0;

  _.each(cbks, function (callbacks) {
    callbacks.movedBefore('a', null);
  });
  test.equal(buf, []);
  Deps.flush();
  test.equal(div.html().replace(/\s/g, ''),
             '<div>b</div><div>c</div><div>a</div>');
  test.equal(buf, ['<div>b</div><div>c</div><div>a</div>']);
  buf.length = 0;

  div.kill();
  Deps.flush();
});

Tinytest.add("templating - landmarks in helpers", function (test) {
  var buf = [];

  var R = ReactiveVar('foo');

  var tmpl = Template.test_template_landmarks_a;
  tmpl.LM = function () {
    return new Handlebars.SafeString(
      Spark.createLandmark({created: function () { buf.push('c'); },
                            rendered: function () { buf.push('r'); },
                            destroyed: function () { buf.push('d'); }},
                           function () { return 'x'; }));
  };
  tmpl.v = function () {
    return R.get();
  };

  var div = OnscreenDiv(Meteor.render(tmpl));
  test.equal(div.text().match(/\S+/)[0], 'xxxxfoo');
  Deps.flush();
  buf.sort();
  test.equal(buf.join(''), 'ccccrrrr');
  buf.length = 0;

  R.set('bar');
  Deps.flush();
  test.equal(div.text().match(/\S+/)[0], 'xxxxbar');
  test.equal(buf.join(''), 'rrrr');
  buf.length = 0;

  div.kill();
  Deps.flush();
  test.equal(buf.join(''), 'dddd');
});

Tinytest.add("templating - bare each has no matching", function (test) {
  var buf = [];

  var R = ReactiveVar('foo');

  var tmpl = Template.test_template_bare_each_a;
  tmpl.abc = [{}, {}, {}];
  tmpl.LM = function () {
    return new Handlebars.SafeString(
      Spark.createLandmark({created: function () { buf.push('c'); },
                            rendered: function () { buf.push('r'); },
                            destroyed: function () { buf.push('d'); }},
                           function () { return 'x'; }));
  };
  tmpl.v = function () {
    return R.get();
  };

  var div = OnscreenDiv(Meteor.render(tmpl));
  Deps.flush();
  buf.sort();
  test.equal(buf.join(''), 'cccrrr');
  buf.length = 0;

  R.set('bar');
  Deps.flush();
  buf.sort();
  test.equal(buf.join(''), 'cccdddrrr');
  buf.length = 0;

  div.kill();
  Deps.flush();
  test.equal(buf.join(''), 'ddd');
});

Tinytest.add("templating - templates are labeled", function (test) {
  var buf = [];

  var R = ReactiveVar('foo');

  var tmpls = _.map([0,1,2,3], function (n) {
    return Template['test_template_labels_a'+n];
  });
  tmpls[0].stuff = function () {
    return tmpls[1]() + tmpls[2]() + tmpls[3]() + R.get();
  };
  _.each([tmpls[1], tmpls[2], tmpls[3]], function (tmpl) {
    tmpl.preserve(['hr']);
    tmpl.created = function () { buf.push('c'); };
    tmpl.rendered = function () { buf.push('r'); };
    tmpl.destroyed = function () { buf.push('d'); };
  });

  var div = OnscreenDiv(Meteor.render(tmpls[0]));
  Deps.flush();
  test.equal(div.html(), "<hr><hr><hr>foo");
  buf.sort();
  test.equal(buf.join(''), 'cccrrr');
  buf.length = 0;

  R.set('bar');
  Deps.flush();
  test.equal(div.html(), "<hr><hr><hr>bar");
  buf.sort();
  test.equal(buf.join(''), 'rrr');
  buf.length = 0;

  div.kill();
  Deps.flush();
  test.equal(buf.join(''), 'ddd');
});

Tinytest.add("templating - unlabeled cursor", function (test) {
  var R = ReactiveVar("foo");

  var div = OnscreenDiv(Meteor.render(function () {
    R.get(); // create dependency
    return Template.test_unlabeled_cursor_a0(
      {observeChanges: function (callbacks) {
        callbacks.addedBefore('0', {}, null);
        callbacks.addedBefore('1', {}, null);
        callbacks.addedBefore('2', {}, null);
        return { stop: function () {} };
      }}
    );
  }));

  R.set("bar");
  // This will fail with "can't create second landmark in branch"
  // unless _id-less objects returned from a cursor are given
  // unique branch labels in an {{#each}}.
  Deps.flush();

  div.kill();
  Deps.flush();
});

Tinytest.add("templating - constant text patching", function (test) {
  // Issue #323.

  var tmpl = Template.test_constant_text_a0;

  var R = ReactiveVar("foo");

  tmpl.preserve(['p']);
  tmpl.v = function () {
    return R.get();
  };

  var div = OnscreenDiv(Meteor.render(tmpl));
  Deps.flush();

  R.set("bar");
  // This flush will fail if we can't patch the constant region,
  // which starts with a text node, after preserving the preceding
  // paragraph.
  Deps.flush();

  div.kill();
  Deps.flush();
});


Tinytest.add('templating - helper typecast Issue #617', function (test) {

  Handlebars.registerHelper('testTypeCasting', function (/*arguments*/) {
    // Return a string representing the arguments passed to this
    // function, including types. eg:
    // (1, true) -> "[number,1][boolean,true]"
    return _.reduce(_.toArray(arguments), function (memo, arg) {
      if (typeof arg === 'object')
        return memo + "[object]";
      return memo + "[" + typeof arg + "," + arg + "]";
    }, "");
    return x;
  });

  var frag = Meteor.render(Template.test_type_casting);
  var result = canonicalizeHtml(DomUtils.fragmentToHtml(frag));
  test.equal(
    result,
    // This corresponds to entries in templating_tests.html.
    // true/faslse
    "[string,true][string,false][boolean,true][boolean,false]" +
      // numbers
      "[number,0][number,1][number,-1][number,10][number,-10]" +
      // errors
      "[undefined,undefined][undefined,undefined]" +
      // handlebars 'options' argument. appended to args of all helpers.
      "[object]");
});

Tinytest.add("templating - tricky branch labels", function (test) {
  // regression test for issue #724

  var loading = ReactiveVar(true);
  var v = ReactiveVar(1);

  var x = [];

  Template.test_template_trickylabels_a0.loading = function () {
    return loading.get();
  };

  Template.test_template_trickylabels_a1.v = function () {
    return v.get();
  };

  _.extend(Template.test_template_trickylabels_a2, {
    created: function () { x.push('c'); },
    rendered: function () { x.push('r'); },
    destroyed: function () { x.push('d'); }
  });

  var div = OnscreenDiv(Meteor.render(Template.test_template_trickylabels_a0));
  Deps.flush();
  loading.set(false);
  Deps.flush();
  x.length = 0;

  v.set(2);
  Deps.flush();
  test.equal(x.join(''), 'r'); // no 'c' or 'd'
  test.equal(div.html().replace(/\s+/g, ''), '<div>foo</div>2<div>bar</div>');

  div.kill();
  Deps.flush();
});

Tinytest.add('templating - each falsy Issue #801', function (test) {
  //Minor test for issue #801
  Template.test_template_issue801.values = function() { return [1,2,null,undefined]; };
  var frag = Meteor.render(Template.test_template_issue801);
  test.equal(canonicalizeHtml(DomUtils.fragmentToHtml(frag)), "12null");
});

Tinytest.add('templating - with falsy Issue #770', function (test) {
  Template.test_template_issue770.value1 = function () { return "abc"; };
  Template.test_template_issue770.value2 = function () { return false; };
  var frag = Meteor.render(Template.test_template_issue770);
  test.equal(canonicalizeHtml(DomUtils.fragmentToHtml(frag)), "abcxxxabc");
});
