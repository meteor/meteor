// XXX make sure that when tests use id="..." to trigger patching, "preserve" happens
// XXX test that events inside constant regions still work after patching
// XXX test arguments to landmark rendered callback
// XXX test variable wrapping (eg TR vs THEAD) inside each branch of Spark.list?


Spark._checkIECompliance = true;

(function () {

// Tests can use {preserve: idNameLabels} or renderWithPreservation
// to cause any element with an id or name to be preserved.  This effect
// is similar to what the preserve-inputs package does, though it applies
// to all elements, not just inputs.

var idNameLabels = {
  '*[id], *[name]': Spark._labelFromIdOrName
};

var renderWithPreservation = function (htmlFunc) {
  return Meteor.render(function () {
    return Spark.createLandmark({ preserve: idNameLabels}, htmlFunc);
  });
};

var eventmap = function (/*args*/) {
  // support event_buf as final argument
  var event_buf = null;
  if (arguments.length && _.isArray(arguments[arguments.length-1])) {
    event_buf = arguments[arguments.length-1];
    arguments.length--;
  }
  var events = {};
  _.each(arguments, function (esel) {
    var etyp = esel.split(' ')[0];
    events[esel] = function (evt) {
      if (evt.type !== etyp)
        throw new Error(etyp+" event arrived as "+evt.type);
      (event_buf || this).push(esel);
    };
  });
  return events;
};

var nodesToArray = function (array) {
  // Starting in underscore 1.4, _.toArray does not work right on a node
  // list in IE8. This is a workaround to support IE8.
  return _.map(array, _.identity);
};

Tinytest.add("spark - assembly", function (test) {

  var furtherCanon = function(str) {
    // further canonicalize innerHTML in IE by adding close
    // li tags to "<ul><li>one<li>two<li>three</li></ul>"
    return str.replace(/<li>(\w*)(?=<li>)/g, function(s) {
      return s+"</li>";
    });
  };

  var doTest = function (calc) {
    var frag = Spark.render(function () {
      return calc(function (str, expected) {
        return Spark.setDataContext(null, str);
      });
    });
    var groups = [];
    var html = calc(function (str, expected, noRange) {
      if (arguments.length > 1)
        str = expected;
      if (! noRange)
        groups.push(str);
      return str;
    });
    var f = WrappedFrag(frag);
    test.equal(furtherCanon(f.html()), html);

    var actualGroups = [];
    var tempRange = new LiveRange(Spark._TAG, frag);
    tempRange.visit(function (isStart, rng) {
      if (! isStart && rng.type === Spark._ANNOTATION_DATA)
        actualGroups.push(furtherCanon(canonicalizeHtml(
          DomUtils.rangeToHtml(rng.firstNode(), rng.lastNode()))));
    });
    test.equal(actualGroups.join(','), groups.join(','));
  };

  doTest(function (A) { return "<p>Hello</p>"; });
  doTest(function (A) { return "<td>Hello</td><td>World</td>"; });
  doTest(function (A) { return "<td>"+A("Hello")+"</td>"; });
  doTest(function (A) { return A("<td>"+A("Hello")+"</td>"); });
  doTest(function (A) { return A(A(A(A(A(A("foo")))))); });
  doTest(
    function (A) { return "<div>Yo"+A("<p>Hello "+A(A("World")),"<p>Hello World</p>")+
                  "</div>"; });
  doTest(function (A) {
    return A("<ul>"+A("<li>one","<li>one</li>")+
             A("<li>two","<li>two</li>")+
             A("<li>three","<li>three</li>"),
             "<ul><li>one</li><li>two</li><li>three</li></ul>"); });

  doTest(function (A) {
    return A("<table>"+A("<tr>"+A("<td>"+A("Hi")+"</td>")+"</tr>")+"</table>",
             "<table><tbody><tr><td>Hi</td></tr></tbody></table>");
  });

  test.throws(function () {
    doTest(function (A) {
      var z = A("Hello");
      return z+z;
    });
  });

  var frag = Spark.render(function () {
    return '<div foo="abc' +
      Spark.setDataContext(null, "bar") +
      'xyz">Hello</div>';
  });
  var div = frag.firstChild;
  test.equal(div.nodeName, "DIV");
  var attrValue = div.getAttribute('foo');
  test.isTrue(attrValue.indexOf('abc<!--') === 0, attrValue);
  test.isTrue(attrValue.indexOf('-->xyz') >= 0, attrValue);
});


Tinytest.add("spark - repeat inclusion", function(test) {
  test.throws(function() {
    var frag = Spark.render(function() {
      var x = Spark.setDataContext({}, "abc");
      return x + x;
    });
  });
});


Tinytest.add("spark - replace tag contents", function (test) {

  // adapted from nateps / metamorph

  var do_onscreen = function (f) {
    var div = OnscreenDiv();
    var stuff = {
      div: div,
      node: _.bind(div.node, div),
      render: function (rfunc) {
        div.node().appendChild(Meteor.render(rfunc));
      }
    };

    f.call(stuff);

    div.kill();
  };

  var R, div;

  // basic text replace

  do_onscreen(function () {
    R = ReactiveVar("one two three");
    this.render(function () {
      return R.get();
    });
    R.set("three four five six");
    Meteor.flush();
    test.equal(this.div.html(), "three four five six");
  });

  // work inside a table

  do_onscreen(function () {
    R = ReactiveVar("<tr><td>HI!</td></tr>");
    this.render(function () {
      return "<table id='morphing'>" + R.get() + "</table>";
    });

    test.equal($(this.node()).find("#morphing td").text(), "HI!");
    R.set("<tr><td>BUH BYE!</td></tr>");
    Meteor.flush();
    test.equal($(this.node()).find("#morphing td").text(), "BUH BYE!");
  });

  // work inside a tbody

  do_onscreen(function () {
    R = ReactiveVar("<tr><td>HI!</td></tr>");
    this.render(function () {
      return "<table id='morphing'><tbody>" + R.get() + "</tbody></table>";
    });

    test.equal($(this.node()).find("#morphing td").text(), "HI!");
    R.set("<tr><td>BUH BYE!</td></tr>");
    Meteor.flush();
    test.equal($(this.node()).find("#morphing td").text(), "BUH BYE!");
  });

  // work inside a tr

  do_onscreen(function () {
    R = ReactiveVar("<td>HI!</td>");
    this.render(function () {
      return "<table id='morphing'><tr>" + R.get() + "</tr></table>";
    });

    test.equal($(this.node()).find("#morphing td").text(), "HI!");
    R.set("<td>BUH BYE!</td>");
    Meteor.flush();
    test.equal($(this.node()).find("#morphing td").text(), "BUH BYE!");
  });

  // work inside a ul

  do_onscreen(function () {
    R = ReactiveVar("<li>HI!</li>");
    this.render(function () {
      return "<ul id='morphing'>" + R.get() + "</ul>";
    });

    test.equal($(this.node()).find("#morphing li").text(), "HI!");
    R.set("<li>BUH BYE!</li>");
    Meteor.flush();
    test.equal($(this.node()).find("#morphing li").text(), "BUH BYE!");
  });

  // work inside a select

  do_onscreen(function () {
    R = ReactiveVar("<option>HI!</option>");
    this.render(function () {
      return "<select id='morphing'>" + R.get() + "</select>";
    });

    test.equal($(this.node()).find("#morphing option").text(), "HI!");
    R.set("<option>BUH BYE!</option>");
    Meteor.flush();
    test.equal($(this.node()).find("#morphing option").text(), "BUH BYE!");
  });

  // list of select options

  do_onscreen(function () {
    var c = new LocalCollection();
    c.insert({name: 'Hamburger', value: 1});
    c.insert({name: 'Cheeseburger', value: 2});
    this.render(function () {
      return "<select id='morphing' name='fred'>" +
        Spark.list(c.find({}, {sort: ['value']}), function (doc) {
          return '<option value="' + doc.value + '">' + doc.name + '</option>';
        }) +
        "</select>";
    });

    var furtherCanon = function (html) {
      return html.replace(/\s*selected="selected"/g, '');
    };

    test.equal(furtherCanon(this.div.html()),
               '<select id="morphing" name="fred">' +
               '<option value="1">Hamburger</option>' +
               '<option value="2">Cheeseburger</option>' +
               '</select>');
    c.insert({name: 'Chicken Snickers', value: 8});
    Meteor.flush();
    test.equal(furtherCanon(this.div.html()),
               '<select id="morphing" name="fred">' +
               '<option value="1">Hamburger</option>' +
               '<option value="2">Cheeseburger</option>' +
               '<option value="8">Chicken Snickers</option>' +
               '</select>');
    c.remove({value: 1});
    c.remove({value: 2});
    Meteor.flush();
    test.equal(furtherCanon(this.div.html()),
               '<select id="morphing" name="fred">' +
               '<option value="8">Chicken Snickers</option>' +
               '</select>');
    c.remove({});
    Meteor.flush();
    test.equal(furtherCanon(this.div.html()),
               '<select id="morphing" name="fred">' +
               '<!---->' +
               '</select>');
    c.insert({name: 'Hamburger', value: 1});
    c.insert({name: 'Cheeseburger', value: 2});
    Meteor.flush();
    test.equal(furtherCanon(this.div.html()),
               '<select id="morphing" name="fred">' +
               '<option value="1">Hamburger</option>' +
               '<option value="2">Cheeseburger</option>' +
               '</select>');
  });

});


Tinytest.add("spark - basic isolate", function (test) {

  var R = ReactiveVar('foo');

  var div = OnscreenDiv(Spark.render(function () {
    return '<div>' + Spark.isolate(function () {
      return '<span>' + R.get() + '</span>';
    }) + '</div>';
  }));

  test.equal(div.html(), '<div><span>foo</span></div>');
  R.set('bar');
  test.equal(div.html(), '<div><span>foo</span></div>');
  Meteor.flush();
  test.equal(div.html(), '<div><span>bar</span></div>');
  R.set('baz');
  Meteor.flush();
  test.equal(div.html(), '<div><span>baz</span></div>');

  div.kill();
  Meteor.flush();
});

Tinytest.add("spark - one render", function (test) {

  var R = ReactiveVar("foo");

  var frag = WrappedFrag(Meteor.render(function () {
    return R.get();
  })).hold();

  test.equal(R.numListeners(), 1);

  // frag should be "foo" initially
  test.equal(frag.html(), "foo");
  R.set("bar");
  // haven't flushed yet, so update won't have happened
  test.equal(frag.html(), "foo");
  Meteor.flush();
  // flushed now, frag should say "bar"
  test.equal(frag.html(), "bar");
  frag.release(); // frag is now considered offscreen
  Meteor.flush();
  R.set("baz");
  Meteor.flush();
  // no update should have happened, offscreen range dep killed
  test.equal(frag.html(), "bar");

  // should be back to no listeners
  test.equal(R.numListeners(), 0);

  // empty return value should work, and show up as a comment
  frag = WrappedFrag(Meteor.render(function () {
    return "";
  }));
  test.equal(frag.html(), "<!---->");

  // nodes coming and going at top level of fragment
  R.set(true);
  frag = WrappedFrag(Meteor.render(function () {
    return R.get() ? "<div>hello</div><div>world</div>" : "";
  })).hold();
  test.equal(frag.html(), "<div>hello</div><div>world</div>");
  R.set(false);
  Meteor.flush();
  test.equal(frag.html(), "<!---->");
  R.set(true);
  Meteor.flush();
  test.equal(frag.html(), "<div>hello</div><div>world</div>");
  test.equal(R.numListeners(), 1);
  frag.release();
  Meteor.flush();
  test.equal(R.numListeners(), 0);

  // more complicated changes
  R.set(1);
  frag = WrappedFrag(Meteor.render(function () {
    var result = [];
    for(var i=0; i<R.get(); i++) {
      result.push('<div id="x'+i+'" class="foo" name="bar"><p><b>'+
                  R.get()+'</b></p></div>');
    }
    return result.join('');
  })).hold();
  test.equal(frag.html(),
               '<div class="foo" id="x0" name="bar"><p><b>1</b></p></div>');
  R.set(3);
  Meteor.flush();
  test.equal(frag.html(),
               '<div class="foo" id="x0" name="bar"><p><b>3</b></p></div>'+
               '<div class="foo" id="x1" name="bar"><p><b>3</b></p></div>'+
               '<div class="foo" id="x2" name="bar"><p><b>3</b></p></div>');
  R.set(2);
  Meteor.flush();
  test.equal(frag.html(),
               '<div class="foo" id="x0" name="bar"><p><b>2</b></p></div>'+
               '<div class="foo" id="x1" name="bar"><p><b>2</b></p></div>');
  frag.release();
  Meteor.flush();
  test.equal(R.numListeners(), 0);

  // caller violating preconditions
  test.equal(WrappedFrag(Meteor.render("foo")).html(), "foo");
});

Tinytest.add("spark - heuristic finalize", function (test) {

  var R = ReactiveVar(123);

  var div = OnscreenDiv(Meteor.render(function () {
    return "<p>The number is "+R.get()+".</p><hr><br><br><u>underlined</u>";
  }));

  test.equal(div.html(), "<p>The number is 123.</p><hr><br><br><u>underlined</u>");
  test.equal(R.numListeners(), 1);
  Meteor.flush();
  R.set(456); // won't take effect until flush()
  test.equal(div.html(), "<p>The number is 123.</p><hr><br><br><u>underlined</u>");
  test.equal(R.numListeners(), 1);
  Meteor.flush();
  test.equal(div.html(), "<p>The number is 456.</p><hr><br><br><u>underlined</u>");
  test.equal(R.numListeners(), 1);

  div.remove();
  R.set(789); // update should force div dependency to be GCed when div is updated
  Meteor.flush();
  test.equal(R.numListeners(), 0);
});

Tinytest.add("spark - isolate", function (test) {

  var inc = function (v) {
    v.set(v.get() + 1); };

  var R1 = ReactiveVar(0);
  var R2 = ReactiveVar(0);
  var R3 = ReactiveVar(0);
  var count1 = 0, count2 = 0, count3 = 0;

  var frag = WrappedFrag(Meteor.render(function () {
    return R1.get() + "," + (count1++) + " " +
      Spark.isolate(function () {
        return R2.get() + "," + (count2++) + " " +
          Spark.isolate(function () {
            return R3.get() + "," + (count3++);
          });
      });
  })).hold();

  test.equal(frag.html(), "0,0 0,0 0,0");

  inc(R1); Meteor.flush();
  test.equal(frag.html(), "1,1 0,1 0,1");

  inc(R2); Meteor.flush();
  test.equal(frag.html(), "1,1 1,2 0,2");

  inc(R3); Meteor.flush();
  test.equal(frag.html(), "1,1 1,2 1,3");

  inc(R2); Meteor.flush();
  test.equal(frag.html(), "1,1 2,3 1,4");

  inc(R1); Meteor.flush();
  test.equal(frag.html(), "2,2 2,4 1,5");

  frag.release();
  Meteor.flush();
  test.equal(R1.numListeners(), 0);
  test.equal(R2.numListeners(), 0);
  test.equal(R3.numListeners(), 0);

  R1.set(0);
  R2.set(0);
  R3.set(0);

  frag = WrappedFrag(Meteor.render(function () {
    var buf = [];
    buf.push('<div class="foo', R1.get(), '">');
    buf.push(Spark.isolate(function () {
      var buf = [];
      for(var i=0; i<R2.get(); i++) {
        buf.push(Spark.isolate(function () {
          return '<div>'+R3.get()+'</div>';
        }));
      }
      return buf.join('');
    }));
    buf.push('</div>');
    return buf.join('');
  })).hold();

  test.equal(frag.html(), '<div class="foo0"><!----></div>');
  R2.set(3); Meteor.flush();
  test.equal(frag.html(), '<div class="foo0">'+
               '<div>0</div><div>0</div><div>0</div>'+
               '</div>');

  R3.set(5); Meteor.flush();
  test.equal(frag.html(), '<div class="foo0">'+
               '<div>5</div><div>5</div><div>5</div>'+
               '</div>');

  R1.set(7); Meteor.flush();
  test.equal(frag.html(), '<div class="foo7">'+
               '<div>5</div><div>5</div><div>5</div>'+
               '</div>');

  R2.set(1); Meteor.flush();
  test.equal(frag.html(), '<div class="foo7">'+
               '<div>5</div>'+
               '</div>');

  R1.set(11); Meteor.flush();
  test.equal(frag.html(), '<div class="foo11">'+
               '<div>5</div>'+
               '</div>');

  R2.set(2); Meteor.flush();
  test.equal(frag.html(), '<div class="foo11">'+
               '<div>5</div><div>5</div>'+
               '</div>');

  R3.set(4); Meteor.flush();
  test.equal(frag.html(), '<div class="foo11">'+
               '<div>4</div><div>4</div>'+
               '</div>');

  frag.release();

  // calling isolate() outside of render mode
  test.equal(Spark.isolate(function () { return "foo"; }), "foo");

  // caller violating preconditions

  test.throws(function () {
    Meteor.render(function () {
      return Spark.isolate("foo");
    });
  });


  // unused isolate

  var Q = ReactiveVar("foo");
  Meteor.render(function () {
    // create an isolate, in render mode,
    // but don't use it.
    Spark.isolate(function () {
      return Q.get();
    });
    return "";
  });
  Q.set("bar");
  // might get an error on flush() if implementation
  // deals poorly with unused isolates, or a listener
  // still existing after flush.
  Meteor.flush();
  test.equal(Q.numListeners(), 0);

  // nesting

  var stuff = ReactiveVar(true);
  var div = OnscreenDiv(Meteor.render(function () {
    return Spark.isolate(function () {
      return "x"+(stuff.get() ? 'y' : '') + Spark.isolate(function () {
        return "hi";
      });
    });
  }));
  test.equal(div.html(), "xyhi");
  stuff.set(false);
  Meteor.flush();
  test.equal(div.html(), "xhi");
  div.kill();
  Meteor.flush();

  // more nesting

  var num1 = ReactiveVar(false);
  var num2 = ReactiveVar(false);
  var num3 = ReactiveVar(false);
  var numset = function (n) {
    _.each([num1, num2, num3], function (v, i) {
      v.set((i+1) === n);
    });
  };
  numset(1);

  var div = OnscreenDiv(Meteor.render(function () {
    return Spark.isolate(function () {
      return (num1.get() ? '1' : '')+
        Spark.isolate(function () {
          return (num2.get() ? '2' : '')+
            Spark.isolate(function () {
              return (num3.get() ? '3' : '')+'x';
            });
        });
    });
  }));
  test.equal(div.html(), "1x");
  numset(2);
  Meteor.flush();
  test.equal(div.html(), "2x");
  numset(3);
  Meteor.flush();
  test.equal(div.html(), "3x");
  numset(1);
  Meteor.flush();
  test.equal(div.html(), "1x");
  numset(3);
  Meteor.flush();
  test.equal(div.html(), "3x");
  numset(2);
  Meteor.flush();
  test.equal(div.html(), "2x");
  div.remove();
  Meteor.flush();

  // the real test for slow-path GC finalization:
  num2.set(! num2.get());
  Meteor.flush();
  test.equal(num1.numListeners(), 0);
  test.equal(num2.numListeners(), 0);
  test.equal(num3.numListeners(), 0);
});

Tinytest.add("spark - data context", function (test) {
  var d1 = {x: 1};
  var d2 = {x: 2};
  var d3 = {x: 3};
  var d4 = {x: 4};
  var d5 = {x: 5};

  var traverse = function (frag) {
    var out = '';
    var walkChildren = function (parent) {
      for (var node = parent.firstChild; node; node = node.nextSibling) {
        if (node.nodeType !== 8 /* COMMENT */)  {
          var data = Spark.getDataContext(node);
          out += (data === null) ? "_" : data.x;
        }
        if (node.nodeType === 1 /* ELEMENT */)
          walkChildren(node);
      }
    };
    walkChildren(frag);
    return out;
  };

  var testData = function (serialized, htmlFunc) {
    test.equal(traverse(Spark.render(htmlFunc)), serialized);
  };

  testData("_", function () {
    return "hi";
  });

  testData("__", function () {
    return "<div>hi</div>";
  });

  testData("_1", function () {
    return "<div>" + Spark.setDataContext(d1, "hi") + "</div>";
  });

  testData("21", function () {
    return Spark.setDataContext(
      d2, "<div>" + Spark.setDataContext(d1, "hi") + "</div>");
  });

  testData("21", function () {
    return Spark.setDataContext(
      d2, "<div>" +
        Spark.setDataContext(d3,
                             Spark.setDataContext(d1, "hi")) +
        "</div>");
  });

  testData("23", function () {
    return Spark.setDataContext(
      d2, "<div>" +
        Spark.setDataContext(d1,
                             Spark.setDataContext(d3, "hi")) +
        "</div>");
  });

  testData("23", function () {
    var html = Spark.setDataContext(
      d2, "<div>" +
        Spark.setDataContext(d1,
                             Spark.setDataContext(d3, "hi")) +
        "</div>");
    return Spark.setDataContext(d4, html);
  });

  testData("1_2", function () {
    return Spark.setDataContext(d1, "hi") + "-" +
      Spark.setDataContext(d2, "there");
  });

  testData("_122_3__45", function () {
    return "<div>" +
      Spark.setDataContext(d1, "<div></div>") +
      Spark.setDataContext(d2, "<div><div></div></div>") +
      "<div></div>" +
      Spark.setDataContext(d3, "<div></div>") +
      "<div><div></div></div>" +
      Spark.setDataContext(d4, "<div>" +
                           Spark.setDataContext(d5, "<div></div>") +
                           "</div>");
  });
});

Tinytest.add("spark - tables", function (test) {
  var R = ReactiveVar(0);

  var table = OnscreenDiv(Meteor.render(function () {
    var buf = [];
    buf.push("<table>");
    for(var i=0; i<R.get(); i++)
      buf.push("<tr><td>"+(i+1)+"</td></tr>");
    buf.push("</table>");
    return buf.join('');
  }));

  R.set(1);
  Meteor.flush();
  test.equal(table.html(), "<table><tbody><tr><td>1</td></tr></tbody></table>");

  R.set(10);
  test.equal(table.html(), "<table><tbody><tr><td>1</td></tr></tbody></table>");
  Meteor.flush();
  test.equal(table.html(), "<table><tbody>"+
               "<tr><td>1</td></tr>"+
               "<tr><td>2</td></tr>"+
               "<tr><td>3</td></tr>"+
               "<tr><td>4</td></tr>"+
               "<tr><td>5</td></tr>"+
               "<tr><td>6</td></tr>"+
               "<tr><td>7</td></tr>"+
               "<tr><td>8</td></tr>"+
               "<tr><td>9</td></tr>"+
               "<tr><td>10</td></tr>"+
               "</tbody></table>");

  R.set(0);
  Meteor.flush();
  test.equal(table.html(), "<table></table>");
  table.kill();
  Meteor.flush();
  test.equal(R.numListeners(), 0);

  var div = OnscreenDiv();
  div.node().appendChild(document.createElement("TABLE"));
  div.node().firstChild.appendChild(Meteor.render(function () {
    var buf = [];
    for(var i=0; i<R.get(); i++)
      buf.push("<tr><td>"+(i+1)+"</td></tr>");
    return buf.join('');
  }));
  test.equal(div.html(), "<table><!----></table>");
  R.set(3);
  Meteor.flush();
  test.equal(div.html(), "<table><tbody>"+
               "<tr><td>1</td></tr>"+
               "<tr><td>2</td></tr>"+
               "<tr><td>3</td></tr>"+
               "</tbody></table>");
  test.equal(div.node().firstChild.rows.length, 3);
  R.set(0);
  Meteor.flush();
  test.equal(div.html(), "<table><!----></table>");
  div.kill();
  Meteor.flush();

  test.equal(R.numListeners(), 0);

  div = OnscreenDiv();
  div.node().appendChild(DomUtils.htmlToFragment("<table><tr></tr></table>"));
  R.set(3);
  div.node().getElementsByTagName("tr")[0].appendChild(Meteor.render(
    function () {
      var buf = [];
      for(var i=0; i<R.get(); i++)
        buf.push("<td>"+(i+1)+"</td>");
      return buf.join('');
    }));
  test.equal(div.html(),
               "<table><tbody><tr><td>1</td><td>2</td><td>3</td>"+
               "</tr></tbody></table>");
  R.set(1);
  Meteor.flush();
  test.equal(div.html(),
               "<table><tbody><tr><td>1</td></tr></tbody></table>");
  div.kill();
  Meteor.flush();
  test.equal(R.numListeners(), 0);

  div = OnscreenDiv(renderWithPreservation(function() {
    return '<table id="my-awesome-table">'+R.get()+'</table>';
  }));
  Meteor.flush();
  R.set("<tr><td>Hello</td></tr>");
  Meteor.flush();
  test.equal(
    div.html(),
    '<table id="my-awesome-table"><tbody><tr><td>Hello</td></tr></tbody></table>');
  div.kill();
  Meteor.flush();

  test.equal(R.numListeners(), 0);
});

Tinytest.add("spark - event handling", function (test) {
  var event_buf = [];
  var getid = function (id) {
    return document.getElementById(id);
  };

  var div;

  var chunk = function (htmlFunc, options) {
    var html = Spark.isolate(htmlFunc);
    options = options || {};
    if (options.events)
      html = Spark.attachEvents(options.events, html);
    if (options.event_data)
      html = Spark.setDataContext(options.event_data, html);
    return html;
  };

  var render = function (htmlFunc, options) {
    return Spark.render(function () {
      return chunk(htmlFunc, options);
    });
  };


  // clicking on a div at top level
  event_buf.length = 0;
  div = OnscreenDiv(render(function () {
    return '<div id="foozy">Foo</div>';
  }, {events: eventmap("click"), event_data:event_buf}));
  clickElement(getid("foozy"));
  test.equal(event_buf, ['click']);
  div.kill();
  Meteor.flush();

  // selector that specifies a top-level div
  event_buf.length = 0;
  div = OnscreenDiv(render(function () {
    return '<div id="foozy">Foo</div>';
  }, {events: eventmap("click div"), event_data:event_buf}));
  clickElement(getid("foozy"));
  test.equal(event_buf, ['click div']);
  div.kill();
  Meteor.flush();

  // selector that specifies a second-level span
  event_buf.length = 0;
  div = OnscreenDiv(render(function () {
    return '<div id="foozy"><span>Foo</span></div>';
  }, {events: eventmap("click span"), event_data:event_buf}));
  clickElement(getid("foozy").firstChild);
  test.equal(event_buf, ['click span']);
  div.kill();
  Meteor.flush();

  // replaced top-level elements still have event handlers
  // even if replaced by an isolate above the handlers in the DOM
  var R = ReactiveVar("p");
  event_buf.length = 0;
  div = OnscreenDiv(render(function () {
    return chunk(function () {
      return '<'+R.get()+' id="foozy">Hello</'+R.get()+'>';
    });
  }, {events: eventmap("click"), event_data:event_buf}));
  clickElement(getid("foozy"));
  test.equal(event_buf, ['click']);
  event_buf.length = 0;
  R.set("div"); // change tag, which is sure to replace element
  Meteor.flush();
  clickElement(getid("foozy")); // still clickable?
  test.equal(event_buf, ['click']);
  event_buf.length = 0;
  R.set("p");
  Meteor.flush();
  clickElement(getid("foozy"));
  test.equal(event_buf, ['click']);
  event_buf.length = 0;
  div.kill();
  Meteor.flush();

  // bubbling from event on descendent of element matched
  // by selector
  event_buf.length = 0;
  div = OnscreenDiv(render(function () {
    return '<div id="foozy"><span><u><b>Foo</b></u></span>'+
      '<span>Bar</span></div>';
  }, {events: eventmap("click span"), event_data:event_buf}));
  clickElement(
    getid("foozy").firstChild.firstChild.firstChild);
  test.equal(event_buf, ['click span']);
  div.kill();
  Meteor.flush();

  // bubbling order (for same event, same render node, different selector nodes)
  event_buf.length = 0;
  div = OnscreenDiv(render(function () {
    return '<div id="foozy"><span><u><b>Foo</b></u></span>'+
      '<span>Bar</span></div>';
  }, {events: eventmap("click span", "click b"), event_data:event_buf}));
  clickElement(
    getid("foozy").firstChild.firstChild.firstChild);
  test.equal(event_buf, ['click b', 'click span']);
  div.kill();
  Meteor.flush();

  // "bubbling" order for handlers at same level
  event_buf.length = 0;
  div = OnscreenDiv(render(function () {
    return chunk(function () {
      return chunk(function () {
        return '<span id="foozy" class="a b c">Hello</span>';
      }, {events: eventmap("click .c"), event_data:event_buf});
    }, {events: eventmap("click .b"), event_data:event_buf});
  }, {events: eventmap("click .a"), event_data:event_buf}));
  clickElement(getid("foozy"));
  test.equal(event_buf, ['click .c', 'click .b', 'click .a']);
  event_buf.length = 0;
  div.kill();
  Meteor.flush();

  // stopPropagation doesn't prevent other event maps from
  // handling same node
  event_buf.length = 0;
  div = OnscreenDiv(render(function () {
    return chunk(function () {
      return chunk(function () {
        return '<span id="foozy" class="a b c">Hello</span>';
      }, {events: eventmap("click .c"), event_data:event_buf});
    }, {events: {"click .b": function (evt) {
      event_buf.push("click .b"); evt.stopPropagation();}}});
  }, {events: eventmap("click .a"), event_data:event_buf}));
  clickElement(getid("foozy"));
  test.equal(event_buf, ['click .c', 'click .b', 'click .a']);
  event_buf.length = 0;
  div.kill();
  Meteor.flush();

  // stopImmediatePropagation DOES
  event_buf.length = 0;
  div = OnscreenDiv(render(function () {
    return chunk(function () {
      return chunk(function () {
        return '<span id="foozy" class="a b c">Hello</span>';
      }, {events: eventmap("click .c"), event_data:event_buf});
    }, {events: {"click .b": function (evt) {
      event_buf.push("click .b");
      evt.stopImmediatePropagation();}}});
  }, {events: eventmap("click .a"), event_data:event_buf}));
  clickElement(getid("foozy"));
  test.equal(event_buf, ['click .c', 'click .b']);
  event_buf.length = 0;
  div.kill();
  Meteor.flush();

  // bubbling continues even with DOM change
  event_buf.length = 0;
  R = ReactiveVar(true);
  div = OnscreenDiv(render(function () {
    return chunk(function () {
      return '<div id="blarn">'+(R.get()?'<span id="foozy">abcd</span>':'')+'</div>';
    }, {events: { 'click span': function () {
      event_buf.push('click span');
      R.set(false);
      Meteor.flush(); // kill the span
    }, 'click div': function (evt) {
      event_buf.push('click div');
    }}});
  }));
  // click on span
  clickElement(getid("foozy"));
  test.expect_fail(); // doesn't seem to work in old IE
  test.equal(event_buf, ['click span', 'click div']);
  event_buf.length = 0;
  div.kill();
  Meteor.flush();

  // "deep reach" from high node down to replaced low node.
  // Tests that events are registered correctly to work in
  // old IE.  Also tests change event bubbling
  // and proper interpretation of event maps.
  event_buf.length = 0;
  R = ReactiveVar('foo');
  div = OnscreenDiv(render(function () {
    return '<div><p><span><b>'+
      chunk(function () {
        return '<input type="checkbox">'+R.get();
      }, {events: eventmap('click input'), event_data:event_buf}) +
      '</b></span></p></div>';
  }, { events: eventmap('change b', 'change input'), event_data:event_buf }));
  R.set('bar');
  Meteor.flush();
  // click on input
  clickElement(div.node().getElementsByTagName('input')[0]);
  event_buf.sort(); // don't care about order
  test.equal(event_buf, ['change b', 'change input', 'click input']);
  event_buf.length = 0;
  div.kill();
  Meteor.flush();

  // test that 'click *' fires on bubble
  event_buf.length = 0;
  R = ReactiveVar('foo');
  div = OnscreenDiv(render(function () {
    return '<div><p><span><b>'+
      chunk(function () {
        return '<input type="checkbox">'+R.get();
      }, {events: eventmap('click input'), event_data:event_buf}) +
      '</b></span></p></div>';
  }, { events: eventmap('click *'), event_data:event_buf }));
  R.set('bar');
  Meteor.flush();
  // click on input
  clickElement(div.node().getElementsByTagName('input')[0]);
  test.equal(
    event_buf,
    ['click input', 'click *', 'click *', 'click *', 'click *', 'click *']);
  event_buf.length = 0;
  div.kill();
  Meteor.flush();

  // clicking on a div in a nested chunk (without patching)
  event_buf.length = 0;
  R = ReactiveVar('foo');
  div = OnscreenDiv(render(function () {
    return R.get() + chunk(function () {
      return '<span>ism</span>';
    }, {events: eventmap("click"), event_data:event_buf});
  }));
  test.equal(div.text(), 'fooism');
  clickElement(div.node().getElementsByTagName('SPAN')[0]);
  test.equal(event_buf, ['click']);
  event_buf.length = 0;
  R.set('bar');
  Meteor.flush();
  test.equal(div.text(), 'barism');
  clickElement(div.node().getElementsByTagName('SPAN')[0]);
  test.equal(event_buf, ['click']);
  event_buf.length = 0;
  div.kill();
  Meteor.flush();

  // Test that reactive fragments manually inserted inside
  // a reactive fragment eventually get wired.
  event_buf.length = 0;
  div = OnscreenDiv(render(function () {
    return "<div></div>";
  }, { events: eventmap("click span", event_buf) }));
  Meteor.flush();
  div.node().firstChild.appendChild(render(function () {
    return '<span id="foozy">hello</span>';
  }));
  clickElement(getid("foozy"));
  // implementation has no way to know we've inserted the fragment
  test.equal(event_buf, []);
  event_buf.length = 0;
  Meteor.flush();
  clickElement(getid("foozy"));
  // now should be wired up
  test.equal(event_buf, ['click span']);
  event_buf.length = 0;
  div.kill();
  Meteor.flush();

  // Event data comes from event.currentTarget, not event.target
  var data_buf = [];
  div = OnscreenDiv(render(function () {
    return "<ul>"+chunk(function () {
      return '<li id="funyard">Hello</li>';
    }, { event_data: {x:'listuff'} })+"</ul>";
  }, { event_data: {x:'ulstuff'},
       events: { 'click ul': function () { data_buf.push(this); }}}));
  clickElement(getid("funyard"));
  test.equal(data_buf, [{x:'ulstuff'}]);
  div.kill();
  Meteor.flush();
});


Tinytest.add("spark - list event handling", function(test) {
  var event_buf = [];
  var div;

  // same thing, but with events wired by listChunk "added" and "removed"
  event_buf.length = 0;
  var lst = [];
  lst.observe = function(callbacks) {
    lst.callbacks = callbacks;
    return {
      stop: function() {
        lst.callbacks = null;
      }
    };
  };
  div = OnscreenDiv(Meteor.render(function() {
    var chkbx = function(doc) {
      return '<input type="checkbox">'+(doc ? doc._id : 'else');
    };
    var html = '<div><p><span><b>' +
      Spark.setDataContext(
        event_buf, Spark.attachEvents(
          eventmap('click input', event_buf), Spark.list(lst, chkbx, chkbx))) +
      '</b></span></p></div>';
    html = Spark.setDataContext(event_buf, html);
    html = Spark.attachEvents(eventmap('change b', 'change input', event_buf),
                              html);
    return html;
  }));
  Meteor.flush();
  test.equal(div.text().match(/\S+/)[0], 'else');
  // click on input
  var doClick = function() {
    clickElement(div.node().getElementsByTagName('input')[0]);
    event_buf.sort(); // don't care about order
    test.equal(event_buf, ['change b', 'change input', 'click input']);
    event_buf.length = 0;
  };
  doClick();
  // add item
  lst.push({_id:'foo'});
  lst.callbacks.added(lst[0], 0);
  Meteor.flush();
  test.equal(div.text().match(/\S+/)[0], 'foo');
  doClick();
  // remove item, back to "else" case
  lst.callbacks.removed(lst[0], 0);
  lst.pop();
  Meteor.flush();
  test.equal(div.text().match(/\S+/)[0], 'else');
  doClick();
  // cleanup
  div.kill();
  Meteor.flush();

});


Tinytest.add("spark - basic landmarks", function (test) {
  var R = ReactiveVar("111");
  var x = [];
  var expect = function (what) {
    test.equal(x, what);
    x = [];
  };

  var X = {};

  var div = OnscreenDiv(Spark.render(function () {
    return Spark.isolate(function () {
      return R.get() +
        Spark.createLandmark({
          created: function () {
            x.push("c");
            this.a = X;
          },
          rendered: function () {
            x.push("r", this.a);
          },
          destroyed: function () {
            x.push("d", this.a);
          }
        }, function() { return "hi"; });
    });
  }));

  expect(["c"]);
  Meteor.flush();
  expect(["r", X]);
  Meteor.flush();
  expect([]);
  R.set("222");
  expect([]);
  Meteor.flush();
  expect(["r", X]);
  Meteor.flush();
  expect([]);
  div.remove();
  expect([]);
  Meteor.flush();
  expect([]);
  div.kill();
  Meteor.flush();
  expect(["d", X]);
});

Tinytest.add("spark - labeled landmarks", function (test) {
  var R = [];
  for (var i = 0; i < 10; i++)
    R.push(ReactiveVar(""));

  var x = [];
  var s = [];
  var expect = function (what_x, what_s) {
    test.equal(x, what_x);
    test.equal(s, what_s);
    x = [];
    s = [];
  };

  var excludeLandmarks = [];
  for (var i = 0; i < 6; i++)
    excludeLandmarks.push(ReactiveVar(false));

  var isolateLandmarks = ReactiveVar(false);
  var serial = 1;
  var testLandmark = function (id, htmlFunc) {
    if (excludeLandmarks[id].get())
      return "";

    var f = function () {
      var thisSerial = serial++;

      return Spark.createLandmark({
        created: function () {
          x.push("c", id);
          s.push(thisSerial);
          this.id = id;
        },
        rendered: function () {
          x.push("r", id);
          s.push(thisSerial);
          test.equal(this.id, id);
        },
        destroyed: function () {
          x.push("d", id);
          s.push(thisSerial);
          test.equal(this.id, id);
        }
      }, htmlFunc);
    };

    if (isolateLandmarks.get())
      return Spark.isolate(function () { return f(); });
    else
      return f();
  };

  var label = Spark.labelBranch;

  var dep = function (i) {
    return R[i].get();
  };

  // this frog is pretty well boiled
  var div = OnscreenDiv(Spark.render(function () {
    var html = Spark.isolate(function () {
      return (
        dep(0) +
          testLandmark(1, function () {return "hi" + dep(1); }) +
          label("a", function () {
            return dep(2) +
              testLandmark(2, function () { return "hi" + dep(3);});}) +
          label("b", function () {
            return dep(4) +
              testLandmark(3, function () {
                return "hi" + dep(5) +                                                                     label("c", function () {
                  return dep(6) +
                    testLandmark(4, function () {
                      return "hi" + dep(7) +
                        label("d", function () {
                          return label("e", function () {
                            return dep(8) +
                              label("f", function () {
                                return testLandmark(
                                  5, function () { return "hi" + dep(9);}
                                );});});});});});});}));
    });
    return html;
  }));

  // callback order is not specced
  expect(["c", 1, "c", 2, "c", 3, "c", 4, "c", 5], [1, 2, 3, 4, 5]);
  Meteor.flush();
  expect(["r", 1, "r", 2, "r", 5, "r", 4, "r", 3], [1, 2, 5, 4, 3]);
  for (var i = 0; i < 10; i++) {
    R[i].set(1);
    expect([], []);
    Meteor.flush();
    expect(["r", 1, "r", 2, "r", 5, "r", 4, "r", 3],
           [i*5 + 6, i*5 + 7, i*5 + 10, i*5 + 9, i*5 + 8]);
  };

  excludeLandmarks[2].set(true);
  expect([], []);
  Meteor.flush();
  expect(["d", 2, "r", 1, "r", 5, "r", 4, "r", 3],
         [52, 56, 59, 58, 57]);

  excludeLandmarks[2].set(false);
  excludeLandmarks[3].set(true);
  expect([], []);
  Meteor.flush();
  expect(["c", 2, "d", 3, "d", 4, "d", 5, "r", 1, "r", 2],
         [61, 57, 58, 59, 60, 61]);

  excludeLandmarks[2].set(true);
  excludeLandmarks[3].set(false);
  expect([], []);
  Meteor.flush();
  expect(["c", 3, "c", 4, "c", 5, "d", 2, "r", 1, "r", 5, "r", 4, "r", 3],
         [63, 64, 65, 61, 62, 65, 64, 63]);

  excludeLandmarks[2].set(false);
  expect([], []);
  Meteor.flush();
  expect(["c", 2, "r", 1, "r", 2, "r", 5, "r", 4, "r", 3],
         [67, 66, 67, 70, 69, 68]);

  isolateLandmarks.set(true);
  expect([], []);
  Meteor.flush();
  expect(["r", 1, "r", 2, "r", 5, "r", 4, "r", 3],
         [71, 72, 75, 74, 73]);

  for (var i = 0; i < 10; i++) {
    var expected = [
      [["r", 1, "r", 2, "r", 5, "r", 4, "r", 3], [76, 77, 80, 79, 78]],
      [["r", 1], [81]],
      [["r", 1, "r", 2, "r", 5, "r", 4, "r", 3], [82, 83, 86, 85, 84]],
      [["r", 2], [87]],
      [["r", 1, "r", 2, "r", 5, "r", 4, "r", 3], [88, 89, 92, 91, 90]],
      [["r", 5, "r", 4, "r", 3], [95, 94, 93]],
      [["r", 5, "r", 4, "r", 3], [98, 97, 96]],
      [["r", 5, "r", 4, "r", 3], [100, 99, 96]],
      [["r", 5, "r", 4, "r", 3], [102, 101, 96]],
      [["r", 5, "r", 4, "r", 3], [103, 101, 96]]
    ][i];
    R[i].set(2);
    expect([], []);
    Meteor.flush();
    expect.apply(null, expected);
  };

  excludeLandmarks[4].set(true);
  Meteor.flush();
  expect(["d", 4, "d", 5, "r", 3], [101, 103, 104]);

  excludeLandmarks[4].set(false);
  excludeLandmarks[5].set(true);
  Meteor.flush();
  expect(["c", 4, "r", 4, "r", 3], [106, 106, 105]);

  excludeLandmarks[5].set(false);
  Meteor.flush();
  expect(["c", 5, "r", 5, "r", 4, "r", 3], [108, 108, 107, 105]);

  div.kill();
  Meteor.flush();
});


Tinytest.add("spark - preserve copies attributes", function(test) {
  // make sure attributes are correctly changed (i.e. copied)
  // when preserving old nodes, either because they are labeled
  // or because they are a parent of a labeled node.

  var R1 = ReactiveVar("foo");
  var R2 = ReactiveVar("abcd");

  var frag = WrappedFrag(renderWithPreservation(function() {
    return '<div puppy="'+R1.get()+'"><div><div><div><input name="blah" kittycat="'+
      R2.get()+'"></div></div></div></div>';
  })).hold();
  var node1 = frag.node().firstChild;
  var node2 = frag.node().firstChild.getElementsByTagName("input")[0];
  test.equal(node1.nodeName, "DIV");
  test.equal(node2.nodeName, "INPUT");
  test.equal(node1.getAttribute("puppy"), "foo");
  test.equal(node2.getAttribute("kittycat"), "abcd");

  R1.set("bar");
  R2.set("efgh");
  Meteor.flush();
  test.equal(node1.getAttribute("puppy"), "bar");
  test.equal(node2.getAttribute("kittycat"), "efgh");

  frag.release();
  Meteor.flush();
  test.equal(R1.numListeners(), 0);
  test.equal(R2.numListeners(), 0);

  var R;
  R = ReactiveVar(false);
  frag = WrappedFrag(renderWithPreservation(function() {
    return '<input id="foo" type="checkbox"' + (R.get() ? ' checked="checked"' : '') + '>';
  })).hold();
  var get_checked = function() { return !! frag.node().firstChild.checked; };
  test.equal(get_checked(), false);
  Meteor.flush();
  test.equal(get_checked(), false);
  R.set(true);
  test.equal(get_checked(), false);
  Meteor.flush();
  test.equal(get_checked(), true);
  R.set(false);
  test.equal(get_checked(), true);
  Meteor.flush();
  test.equal(get_checked(), false);
  R.set(true);
  Meteor.flush();
  test.equal(get_checked(), true);
  frag.release();
  R = ReactiveVar(true);
  frag = WrappedFrag(renderWithPreservation(function() {
    return '<input type="checkbox"' + (R.get() ? ' checked="checked"' : '') + '>';
  })).hold();
  test.equal(get_checked(), true);
  Meteor.flush();
  test.equal(get_checked(), true);
  R.set(false);
  test.equal(get_checked(), true);
  Meteor.flush();
  test.equal(get_checked(), false);
  frag.release();


  _.each([false, true], function(with_focus) {
    R = ReactiveVar("apple");
    var div = OnscreenDiv(renderWithPreservation(function() {
      return '<input id="foo" type="text" value="' + R.get() + '">';
    }));
    var maybe_focus = function(div) {
      if (with_focus) {
        div.show();
        focusElement(div.node().firstChild);
      }
    };
    maybe_focus(div);
    var get_value = function() { return div.node().firstChild.value; };
    var set_value = function(v) { div.node().firstChild.value = v; };
    var if_blurred = function(v, v2) {
      return with_focus ? v2 : v; };
    test.equal(get_value(), "apple");
    Meteor.flush();
    test.equal(get_value(), "apple");
    R.set("");
    test.equal(get_value(), "apple");
    Meteor.flush();
    test.equal(get_value(), if_blurred("", "apple"));
    R.set("pear");
    test.equal(get_value(), if_blurred("", "apple"));
    Meteor.flush();
    test.equal(get_value(), if_blurred("pear", "apple"));
    set_value("jerry"); // like user typing
    R.set("steve");
    Meteor.flush();
    // should overwrite user typing if blurred
    test.equal(get_value(), if_blurred("steve", "jerry"));
    div.kill();
    R = ReactiveVar("");
    div = OnscreenDiv(renderWithPreservation(function() {
      return '<input id="foo" type="text" value="' + R.get() + '">';
    }));
    maybe_focus(div);
    test.equal(get_value(), "");
    Meteor.flush();
    test.equal(get_value(), "");
    R.set("tom");
    test.equal(get_value(), "");
    Meteor.flush();
    test.equal(get_value(), if_blurred("tom", ""));
    div.kill();
    Meteor.flush();
  });
});

Tinytest.add("spark - bad labels", function(test) {
  // make sure patching behaves gracefully even when labels violate
  // the rules that would allow preservation of nodes identity.

  var go = function(html1, html2) {
    var R = ReactiveVar(true);
    var frag = WrappedFrag(renderWithPreservation(function() {
      return R.get() ? html1 : html2;
    })).hold();

    R.set(false);
    Meteor.flush();
    test.equal(frag.html(), html2);
    frag.release();
  };

  go('hello', 'world');

  // duplicate IDs (bad developer; but should patch correctly)
  go('<div id="foo">hello</div><b id="foo">world</b>',
     '<div id="foo">hi</div><b id="foo">there</b>');
  go('<div id="foo"><b id="foo">hello</b></div>',
     '<div id="foo"><b id="foo">hi</b></div>');
  go('<div id="foo">hello</div><b id="foo">world</b>',
     '<div id="foo"><b id="foo">hi</b></div>');

  // tag name changes
  go('<div id="foo">abcd</div>',
     '<p id="foo">efgh</p>');

  // parent chain changes at all
  go('<div><div><div><p id="foo">test123</p></div></div></div>',
     '<div><div><p id="foo">test123</p></div></div>');
  go('<div><div><div><p id="foo">test123</p></div></div></div>',
     '<div><ins><div><p id="foo">test123</p></div></ins></div>');

  // ambiguous names
  go('<ul><li name="me">1</li><li name="me">3</li><li name="me">3</li></ul>',
     '<ul><li name="me">4</li><li name="me">5</li></ul>');
});


Tinytest.add("spark - landmark patching", function(test) {

  var rand;

  var randomNodeList = function(optParentTag, depth) {
    var atTopLevel = ! optParentTag;
    var len = rand.nextIntBetween(atTopLevel ? 1 : 0, 6);
    var buf = [];
    for(var i=0; i<len; i++)
      buf.push(randomNode(optParentTag, depth));
    return buf;
  };

  var randomNode = function(optParentTag, depth) {
    var n = {};

    if (rand.nextBoolean()) {
      // text node
      n.text = rand.nextIdentifier(2);
    } else {

      n.tagName = rand.nextChoice((function() {
        switch (optParentTag) {
        case "p": return ['b', 'i', 'u'];
        case "b": return ['i', 'u'];
        case "i": return ['u'];
        case "u": case "span": return ['span'];
        default: return ['div', 'ins', 'center', 'p'];
        }
      })());

      if (rand.nextBoolean())
        n.id = rand.nextIdentifier();
      if (rand.nextBoolean())
        n.name = rand.nextIdentifier();

      if (depth === 0) {
        n.children = [];
      } else {
        n.children = randomNodeList(n.tagName, depth-1);
      }
    }

    var existence = rand.nextChoice([[true, true], [false, true], [true, false]]);
    n.existsBefore = existence[0];
    n.existsAfter = existence[1];

    return n;
  };

  var nodeListToHtml = function(list, is_after, optBuf) {
    var buf = (optBuf || []);
    _.each(list, function(n) {
      if (is_after ? n.existsAfter : n.existsBefore) {
        if (n.text) {
          buf.push(n.text);
        } else {
          buf.push('<', n.tagName);
          if (n.id)
            buf.push(' id="', n.id, '"');
          if (n.name)
            buf.push(' name="', n.name, '"');
          buf.push('>');
          nodeListToHtml(n.children, is_after, buf);
          buf.push('</', n.tagName, '>');
        }
      }
    });
    return optBuf ? null : buf.join('');
  };

  var fillInElementIdentities = function(list, parent, is_after) {
    var elementsInList = _.filter(
      list,
      function(x) {
        return (is_after ? x.existsAfter : x.existsBefore) && x.tagName;
      });
    var elementsInDom = _.filter(parent.childNodes,
                                 function(x) { return x.nodeType === 1; });
    test.equal(elementsInList.length, elementsInDom.length);
    for(var i=0; i<elementsInList.length; i++) {
      elementsInList[i].node = elementsInDom[i];
      fillInElementIdentities(elementsInList[i].children,
                              elementsInDom[i]);
    }
  };

  var getParentChain = function(node) {
    var buf = [];
    while (node) {
      buf.push(node);
      node = node.parentNode;
    }
    return buf;
  };

  var isSameElements = function(a, b) {
    if (a.length !== b.length)
      return false;
    for(var i=0; i<a.length; i++) {
      if (a[i] !== b[i])
        return false;
    }
    return true;
  };

  var collectLabeledNodeData = function(list, optArray) {
    var buf = optArray || [];

    _.each(list, function(x) {
      if (x.tagName && x.existsBefore && x.existsAfter) {
        if (x.name || x.id) {
          buf.push({ node: x.node, parents: getParentChain(x.node) });
        }
        collectLabeledNodeData(x.children, buf);
      }
    });

    return buf;
  };

  for(var i=0; i<5; i++) {
    // Use non-deterministic randomness so we can have a shorter fuzz
    // test (fewer iterations).  For deterministic (fully seeded)
    // randomness, remove the call to Math.random().
    rand = new SeededRandom("preserved nodes "+i+" "+Math.random());

    var R = ReactiveVar(false);
    var structure = randomNodeList(null, 6);
    var frag = WrappedFrag(Meteor.render(function () {
      return Spark.createLandmark({ preserve: idNameLabels }, function () {
        return nodeListToHtml(structure, R.get());
      });
    })).hold();
    test.equal(frag.html(), nodeListToHtml(structure, false) || "<!---->");
    fillInElementIdentities(structure, frag.node());
    var labeledNodes = collectLabeledNodeData(structure);
    R.set(true);
    Meteor.flush();
    test.equal(frag.html(), nodeListToHtml(structure, true) || "<!---->");
    _.each(labeledNodes, function(x) {
      test.isTrue(isSameElements(x.parents, getParentChain(x.node)));
    });

    frag.release();
    Meteor.flush();
    test.equal(R.numListeners(), 0);
  }

});

Tinytest.add("spark - landmark constant", function(test) {

  var R, div;

  // top-level { constant: true }

  R = ReactiveVar(0);
  var states = [];
  div = OnscreenDiv(Meteor.render(function() {
    R.get(); // create dependency
    return Spark.createLandmark({
      constant: true,
      rendered: function() {
        states.push(this);
      }
    }, function() { return '<b/><i/><u/>'; });
  }));

  var nodes = nodesToArray(div.node().childNodes);
  test.equal(nodes.length, 3);
  Meteor.flush();
  test.equal(states.length, 1);
  R.set(1);
  Meteor.flush();
  test.equal(states.length, 1); // no render callback on constant
  var nodes2 = nodesToArray(div.node().childNodes);
  test.equal(nodes2.length, 3);
  test.isTrue(nodes[0] === nodes2[0]);
  test.isTrue(nodes[1] === nodes2[1]);
  test.isTrue(nodes[2] === nodes2[2]);
  div.kill();
  Meteor.flush();
  test.equal(R.numListeners(), 0);

  // non-top-level

  var i = 1;
  // run test with and without matching branch label
  _.each([false, true], function(matchLandmark) {
    // run test with node before or after, or neither or both
    _.each([false, true], function(nodeBefore) {
      _.each([false, true], function(nodeAfter) {
        var hasSpan = true;
        var isConstant = true;

        var crd = null; // [createCount, renderCount, destroyCount]

        R = ReactiveVar('foo');
        div = OnscreenDiv(Meteor.render(function() {
          R.get(); // create unconditional dependency
          var brnch = matchLandmark ? 'myBranch' : ('branch'+(++i));
          return (nodeBefore ? R.get() : '') +
            Spark.labelBranch(
              brnch, function () {
                return Spark.createLandmark(
                  {
                    constant: isConstant,
                    created: function () {
                      this.crd = [0,0,0];
                      if (! crd)
                        crd = this.crd; // capture first landmark's crd
                      this.crd[0]++;
                    },
                    rendered: function () { this.crd[1]++; },
                    destroyed: function () { this.crd[2]++; }
                  },
                  function() { return hasSpan ?
                               '<span>stuff</span>' : 'blah'; });}) +
            (nodeAfter ? R.get() : '');
        }));

        var span = div.node().getElementsByTagName('span')[0];
        hasSpan = false;

        test.equal(div.text(),
                   (nodeBefore ? 'foo' : '')+
                   'stuff'+
                   (nodeAfter ? 'foo' : ''));

        R.set('bar');
        Meteor.flush();

        // only non-matching landmark should cause the constant
        // chunk to be re-rendered
        test.equal(div.text(),
                   (nodeBefore ? 'bar' : '')+
                   (matchLandmark ? 'stuff' : 'blah')+
                   (nodeAfter ? 'bar' : ''));
        // in non-matching case, first landmark is destroyed.
        // otherwise, it is kept (and not re-rendered because
        // it is constant)
        test.equal(crd, matchLandmark ? [1,1,0] : [1,1,1]);

        R.set('baz');
        Meteor.flush();

        // should be repeatable (liveranges not damaged)
        test.equal(div.text(),
                   (nodeBefore ? 'baz' : '')+
                   (matchLandmark ? 'stuff' : 'blah')+
                   (nodeAfter ? 'baz' : ''));

        isConstant = false; // no longer constant:true!
        R.set('qux');
        Meteor.flush();
        test.equal(div.text(),
                   (nodeBefore ? 'qux' : '')+
                   'blah'+
                   (nodeAfter ? 'qux' : ''));

        // turn constant back on
        isConstant = true;
        hasSpan = true;
        R.set('popsicle');
        Meteor.flush();
        // we don't get the span, instead old "blah" is preserved
        test.equal(div.text(),
                   (nodeBefore ? 'popsicle' : '')+
                   (matchLandmark ? 'blah' : 'stuff')+
                   (nodeAfter ? 'popsicle' : ''));

        isConstant = false;
        R.set('hi');
        Meteor.flush();
        // now we get the span!
        test.equal(div.text(),
                   (nodeBefore ? 'hi' : '')+
                   'stuff'+
                   (nodeAfter ? 'hi' : ''));

        div.kill();
        Meteor.flush();
      });
    });
  });

  // test that constant landmark gets rendered callback if it
  // wasn't preserved.

  var renderCount;

  renderCount = 0;
  R = ReactiveVar('div');
  div = OnscreenDiv(Meteor.render(function () {
    return '<' + R.get() + '>' + Spark.createLandmark(
      {constant: true, rendered: function () { renderCount++; }},
      function () {
        return "hi";
      }) +
      '</' + R.get().split(' ')[0] + '>';
  }));
  Meteor.flush();
  test.equal(renderCount, 1);

  R.set('div class="hamburger"');
  Meteor.flush();
  // constant patched around, not re-rendered!
  test.equal(renderCount, 1);

  R.set('span class="hamburger"');
  Meteor.flush();
  // can't patch parent to a different tag
  test.equal(renderCount, 2);

  R.set('span');
  Meteor.flush();
  // can patch here, renderCount stays the same
  test.equal(renderCount, 2);

  div.kill();
  Meteor.flush();
});


Tinytest.add("spark - leaderboard", function(test) {
  // use a simplified, local leaderboard to test some stuff

  var players = new LocalCollection();
  var selected_player = ReactiveVar();

  var scores = OnscreenDiv(renderWithPreservation(function() {
    var html = Spark.list(
      players.find({}, {sort: {score: -1}}),
      function(player) {
        return Spark.labelBranch(player._id, function () {
          return Spark.isolate(function () {
            var style;
            if (selected_player.get() === player._id)
              style = "player selected";
            else
              style = "player";

            var html = '<div class="' + style + '">' +
              '<div class="name">' + player.name + '</div>' +
              '<div name="score">' + player.score + '</div></div>';
            html = Spark.setDataContext(player, html);
            html = Spark.createLandmark(
              {preserve: idNameLabels},
              function() { return html; });
            return html;
          });
        });
      });
    html = Spark.attachEvents({
      "click": function () {
        selected_player.set(this._id);
      }
    }, html);
    return html;
  }));

  // back before we had scientists we had Vancian hussade players
  var names = ["Glinnes Hulden", "Shira Hulden", "Denzel Warhound",
               "Lute Casagave", "Akadie", "Thammas, Lord Gensifer",
               "Ervil Savat", "Duissane Trevanyi", "Sagmondo Bandolio",
               "Rhyl Shermatz", "Yalden Wirp", "Tyran Lucho",
               "Bump Candolf", "Wilmer Guff", "Carbo Gilweg"];
  for (var i = 0; i < names.length; i++)
    players.insert({name: names[i], score: i*5});

  var bump = function() {
    players.update(selected_player.get(), {$inc: {score: 5}});
  };

  var findPlayerNameDiv = function(name) {
    var divs = scores.node().getElementsByTagName('DIV');
    return _.find(divs, function(div) {
      return div.innerHTML === name;
    });
  };

  Meteor.flush();
  var glinnesNameNode = findPlayerNameDiv(names[0]);
  test.isTrue(!! glinnesNameNode);
  var glinnesScoreNode = glinnesNameNode.nextSibling;
  test.equal(glinnesScoreNode.getAttribute("name"), "score");
  clickElement(glinnesNameNode);
  Meteor.flush();
  glinnesNameNode = findPlayerNameDiv(names[0]);
  test.isTrue(!! glinnesNameNode);
  test.equal(glinnesNameNode.parentNode.className, 'player selected');
  var glinnesId = players.findOne({name: names[0]})._id;
  test.isTrue(!! glinnesId);
  test.equal(selected_player.get(), glinnesId);
  test.equal(
    canonicalizeHtml(glinnesNameNode.parentNode.innerHTML),
    '<div class="name">Glinnes Hulden</div><div name="score">0</div>');

  bump();
  Meteor.flush();

  glinnesNameNode = findPlayerNameDiv(names[0], glinnesNameNode);
  var glinnesScoreNode2 = glinnesNameNode.nextSibling;
  test.equal(glinnesScoreNode2.getAttribute("name"), "score");
  // move and patch should leave score node the same, because it
  // has a name attribute!
  test.equal(glinnesScoreNode, glinnesScoreNode2);
  test.equal(glinnesNameNode.parentNode.className, 'player selected');
  test.equal(
    canonicalizeHtml(glinnesNameNode.parentNode.innerHTML),
    '<div class="name">Glinnes Hulden</div><div name="score">5</div>');

  bump();
  Meteor.flush();

  glinnesNameNode = findPlayerNameDiv(names[0], glinnesNameNode);
  test.equal(
    canonicalizeHtml(glinnesNameNode.parentNode.innerHTML),
    '<div class="name">Glinnes Hulden</div><div name="score">10</div>');

  scores.kill();
  Meteor.flush();
  test.equal(selected_player.numListeners(), 0);
});


Tinytest.add("spark - list cursor stop", function(test) {
  // test Spark.list outside of render mode, on custom observable

  var numHandles = 0;
  var observable = {
    observe: function(x) {
      x.added({_id:"123"}, 0);
      x.added({_id:"456"}, 1);
      var handle;
      numHandles++;
      return handle = {
        stop: function() {
          numHandles--;
        }
      };
    }
  };

  test.equal(numHandles, 0);
  var result = Spark.list(observable, function(doc) {
    return "#"+doc._id;
  });
  test.equal(result, "#123#456");
  Meteor.flush();
  // chunk killed because not created inside Spark.render
  test.equal(numHandles, 0);


  var R = ReactiveVar(1);
  var frag = WrappedFrag(Meteor.render(function() {
    if (R.get() > 0)
      return Spark.list(observable, function() { return "*"; });
    return "";
  })).hold();
  test.equal(numHandles, 1);
  Meteor.flush();
  test.equal(numHandles, 1);
  R.set(2);
  Meteor.flush();
  test.equal(numHandles, 1);
  R.set(-1);
  Meteor.flush();
  test.equal(numHandles, 0);

  frag.release();
  Meteor.flush();
});

Tinytest.add("spark - list table", function(test) {
  var c = new LocalCollection();

  c.insert({value: "fudge", order: "A"});
  c.insert({value: "sundae", order: "B"});

  var R = ReactiveVar();

  var table = WrappedFrag(Meteor.render(function() {
    var buf = [];
    buf.push('<table>');
    buf.push(Spark.list(
      c.find({}, {sort: ['order']}),
      function(doc) {
        return Spark.labelBranch(doc._id, function () {
          return Spark.isolate(function () {
            var html = "<tr><td>"+doc.value + (doc.reactive ? R.get() : '')+
              "</td></tr>";
            html = Spark.createLandmark(
              {preserve: idNameLabels},
              function() { return html; });
            return html;
          });
        });
      },
      function() {
        return "<tr><td>(nothing)</td></tr>";
      }));
    buf.push('</table>');
    return buf.join('');
  })).hold();

  var lastHtml;

  var shouldFlushTo = function(html) {
    // same before flush
    test.equal(table.html(), lastHtml);
    Meteor.flush();
    test.equal(table.html(), html);
    lastHtml = html;
  };
  var tableOf = function(/*htmls*/) {
    if (arguments.length === 0) {
      return '<table></table>';
    } else {
      return '<table><tbody><tr><td>' +
        _.toArray(arguments).join('</td></tr><tr><td>') +
        '</td></tr></tbody></table>';
    }
  };

  test.equal(table.html(), lastHtml = tableOf('fudge', 'sundae'));

  // switch order
  c.update({value: "fudge"}, {$set: {order: "BA"}});
  shouldFlushTo(tableOf('sundae', 'fudge'));

  // change text
  c.update({value: "fudge"}, {$set: {value: "hello"}});
  c.update({value: "sundae"}, {$set: {value: "world"}});
  shouldFlushTo(tableOf('world', 'hello'));

  // remove all
  c.remove({});
  shouldFlushTo(tableOf('(nothing)'));

  c.insert({value: "1", order: "A"});
  c.insert({value: "5", order: "B"});
  c.insert({value: "3", order: "AB"});
  c.insert({value: "7", order: "BB"});
  c.insert({value: "2", order: "AA"});
  c.insert({value: "4", order: "ABA"});
  c.insert({value: "6", order: "BA"});
  c.insert({value: "8", order: "BBA"});
  shouldFlushTo(tableOf('1', '2', '3', '4', '5', '6', '7', '8'));

  // make one item newly reactive
  R.set('*');
  c.update({value: "7"}, {$set: {reactive: true}});
  shouldFlushTo(tableOf('1', '2', '3', '4', '5', '6', '7*', '8'));

  R.set('!');
  shouldFlushTo(tableOf('1', '2', '3', '4', '5', '6', '7!', '8'));

  // move it
  c.update({value: "7"}, {$set: {order: "A0"}});
  shouldFlushTo(tableOf('1', '7!', '2', '3', '4', '5', '6', '8'));

  // still reactive?
  R.set('?');
  shouldFlushTo(tableOf('1', '7?', '2', '3', '4', '5', '6', '8'));

  // go nuts
  c.update({value: '1'}, {$set: {reactive: true}});
  c.update({value: '1'}, {$set: {reactive: false}});
  c.update({value: '2'}, {$set: {reactive: true}});
  c.update({value: '2'}, {$set: {order: "BBB"}});
  R.set(';');
  R.set('.');
  shouldFlushTo(tableOf('1', '7.', '3', '4', '5', '6', '8', '2.'));

  for(var i=1; i<=8; i++)
    c.update({value: String(i)},
             {$set: {reactive: true, value: '='+String(i)}});
  R.set('!');
  shouldFlushTo(tableOf('=1!', '=7!', '=3!', '=4!', '=5!', '=6!', '=8!', '=2!'));

  for(var i=1; i<=8; i++)
    c.update({value: '='+String(i)},
             {$set: {order: "A"+i}});
  shouldFlushTo(tableOf('=1!', '=2!', '=3!', '=4!', '=5!', '=6!', '=7!', '=8!'));

  var valueFunc = function(n) { return '<b name="bold">'+n+'</b>'; };
  for(var i=1; i<=8; i++)
    c.update({value: '='+String(i)},
             {$set: {value: valueFunc(i)}});
  shouldFlushTo(tableOf.apply(
    null,
    _.map(_.range(1,9), function(n) { return valueFunc(n)+R.get(); })));

  test.equal(table.node().firstChild.rows.length, 8);

  var bolds = table.node().firstChild.getElementsByTagName('B');
  test.equal(bolds.length, 8);
  _.each(bolds, function(b) {
    b.nifty = {}; // mark the nodes; non-primitive value won't appear in IE HTML
  });

  R.set('...');
  shouldFlushTo(tableOf.apply(
    null,
    _.map(_.range(1,9), function(n) { return valueFunc(n)+R.get(); })));
  var bolds2 = table.node().firstChild.getElementsByTagName('B');
  test.equal(bolds2.length, 8);
  // make sure patching is actually happening
  _.each(bolds2, function(b) {
    test.equal(!! b.nifty, true);
  });

  // change value func, and still we should be patching
  var valueFunc2 = function(n) { return '<b name="bold">'+n+'</b><i>yeah</i>'; };
  for(var i=1; i<=8; i++)
    c.update({value: valueFunc(i)},
             {$set: {value: valueFunc2(i)}});
  shouldFlushTo(tableOf.apply(
    null,
    _.map(_.range(1,9), function(n) { return valueFunc2(n)+R.get(); })));
  var bolds3 = table.node().firstChild.getElementsByTagName('B');
  test.equal(bolds3.length, 8);
  _.each(bolds3, function(b) {
    test.equal(!! b.nifty, true);
  });

  table.release();

});


Tinytest.add("spark - list event data", function(test) {
  // this is based on a bug

  var lastClicked = null;
  var R = ReactiveVar(0);
  var later;
  var div = OnscreenDiv(Meteor.render(function() {
    var html = Spark.list(
      {
        observe: function(observer) {
          observer.added({_id: '1', name: 'Foo'}, 0);
          observer.added({_id: '2', name: 'Bar'}, 1);
          // exercise callback path
          later = function() {
            observer.added({_id: '3', name: 'Baz'}, 2);
            observer.added({_id: '4', name: 'Qux'}, 3);
          };
          return { stop: function() {} };
        }
      },
      function(doc) {
        var html = Spark.isolate(function () {
          R.get(); // depend on R
          return '<div>' + doc.name + '</div>';
        });
        html = Spark.setDataContext(doc, html);
        return html;
      }
    );
    html = Spark.attachEvents({
      'click': function (event) {
        lastClicked = this.name;
        R.set(R.get() + 1); // signal all dependers on R
      }
    }, html);
    return html;
  }));

  var item = function(name) {
    return _.find(div.node().getElementsByTagName('div'), function(d) {
      return d.innerHTML === name; });
  };

  later();
  Meteor.flush();
  test.equal(item("Foo").innerHTML, "Foo");
  test.equal(item("Bar").innerHTML, "Bar");
  test.equal(item("Baz").innerHTML, "Baz");
  test.equal(item("Qux").innerHTML, "Qux");

  var doClick = function(name) {
    clickElement(item(name));
    test.equal(lastClicked, name);
    Meteor.flush();
  };

  doClick("Foo");
  doClick("Bar");
  doClick("Baz");
  doClick("Qux");
  doClick("Bar");
  doClick("Foo");
  doClick("Foo");
  doClick("Foo");
  doClick("Qux");
  doClick("Baz");
  doClick("Baz");
  doClick("Baz");
  doClick("Bar");
  doClick("Baz");
  doClick("Foo");
  doClick("Qux");
  doClick("Foo");

  div.kill();
  Meteor.flush();

});


Tinytest.add("spark - events on preserved nodes", function(test) {
  var count = ReactiveVar(0);
  var demo = OnscreenDiv(renderWithPreservation(function() {
    var html = Spark.isolate(function () {
      return '<div class="button_demo">'+
        '<input type="button" name="press" value="Press this button">'+
        '<div>The button has been pressed '+count.get()+' times.</div>'+
        '</div>';
    });
    html = Spark.attachEvents({
      'click input': function() {
        count.set(count.get() + 1);
      }
    }, html);
    return html;
  }));

  var click = function() {
    clickElement(demo.node().getElementsByTagName('input')[0]);
  };

  test.equal(count.get(), 0);
  for(var i=0; i<10; i++) {
    click();
    Meteor.flush();
    test.equal(count.get(), i+1);
  }

  demo.kill();
  Meteor.flush();
});


Tinytest.add("spark - cleanup", function(test) {

  // more exhaustive clean-up testing
  var stuff = new LocalCollection();

  var add_doc = function() {
    stuff.insert({foo:'bar'}); };
  var clear_docs = function() {
    stuff.remove({}); };
  var remove_one = function() {
    stuff.remove(stuff.findOne()._id); };

  add_doc(); // start the collection with a doc

  var R = ReactiveVar("x");

  var div = OnscreenDiv(Spark.render(function() {
    return Spark.list(
      stuff.find(),
      function() {
        return Spark.isolate(function () { return R.get()+"1"; });
      },
      function() {
        return Spark.isolate(function () { return R.get()+"0"; });
      });
  }));

  test.equal(div.text(), "x1");
  Meteor.flush();
  test.equal(div.text(), "x1");
  test.equal(R.numListeners(), 1);

  clear_docs();
  Meteor.flush();
  test.equal(div.text(), "x0");
  test.equal(R.numListeners(), 1); // test clean-up of doc on remove

  add_doc();
  Meteor.flush();
  test.equal(div.text(), "x1");
  test.equal(R.numListeners(), 1); // test clean-up of "else" listeners

  add_doc();
  Meteor.flush();
  test.equal(div.text(), "x1x1");
  test.equal(R.numListeners(), 2);

  remove_one();
  Meteor.flush();
  test.equal(div.text(), "x1");
  test.equal(R.numListeners(), 1); // test clean-up of doc with other docs

  div.kill();
  Meteor.flush();
  test.equal(R.numListeners(), 0);

  //// list stopped if not materialized

  var observeCount = 0;
  var stopCount = 0;
  var cursor = {
    observe: function (callbacks) {
      observeCount++;
      return {
        stop: function () {
          stopCount++;
        }
      };
    }
  };

  div = OnscreenDiv(Spark.render(function () {
    var html = Spark.list(cursor,
                          function () { return ''; });
    // don't return html
    return 'hi';
  }));
  // we expect that the implementation of Spark.list observed the
  // cursor in order to generate HTML, and then stopped it when
  // it saw that the annotation wasn't materialized.  Other acceptable
  // implementations of Spark.list might avoid observing the cursor
  // altogether, resulting in [0, 0], or might defer the stopping to
  // flush time.
  test.equal([observeCount, stopCount], [1, 1]);

  div.kill();
  Meteor.flush();
});


var make_input_tester = function(render_func, events) {
  var buf = [];

  if (typeof render_func === "string") {
    var render_str = render_func;
    render_func = function() { return render_str; };
  }
  if (typeof events === "string") {
    events = eventmap.apply(null, _.toArray(arguments).slice(1));
  }

  var R = ReactiveVar(0);
  var div = OnscreenDiv(
    renderWithPreservation(function() {
      R.get(); // create dependency
      var html = render_func();
      html = Spark.attachEvents(events, html);
      html = Spark.setDataContext(buf, html);
      return html;
    }));
  div.show(true);

  var getbuf = function() {
    var ret = buf.slice();
    buf.length = 0;
    return ret;
  };

  var self;
  return self = {
    focus: function(optCallback) {
      focusElement(self.inputNode());

      if (optCallback)
        Meteor.defer(function() { optCallback(getbuf()); });
      else
        return getbuf();
    },
    blur: function(optCallback) {
      blurElement(self.inputNode());

      if (optCallback)
        Meteor.defer(function() { optCallback(getbuf()); });
      else
        return getbuf();
    },
    click: function() {
      clickElement(self.inputNode());
      return getbuf();
    },
    kill: function() {
      // clean up
      div.kill();
      Meteor.flush();
    },
    inputNode: function() {
      return div.node().getElementsByTagName("input")[0];
    },
    redraw: function() {
      R.set(R.get() + 1);
      Meteor.flush();
    }
  };
};

// Note:  These tests MAY FAIL if the browser window doesn't have focus
// (isn't frontmost) in some browsers, particularly Firefox.
testAsyncMulti("spark - focus/blur events",
  (function() {

    var textLevel1 = '<input type="text" />';
    var textLevel2 = '<span id="spanOfMurder"><input type="text" /></span>';

    var focus_test = function(render_func, events, expected_results) {
      return function(test, expect) {
        var tester = make_input_tester(render_func, events);
        var callback = expect(expected_results);
        tester.focus(function(buf) {
          tester.kill();
          callback(buf);
        });
      };
    };

    var blur_test = function(render_func, events, expected_results) {
      return function(test, expect) {
        var tester = make_input_tester(render_func, events);
        var callback = expect(expected_results);
        tester.focus();
        tester.blur(function(buf) {
          tester.kill();
          callback(buf);
        });
      };
    };

    return [

      // focus on top-level input
      focus_test(textLevel1, 'focus input', ['focus input']),

      // focus on second-level input
      // issue #108
      focus_test(textLevel2, 'focus input', ['focus input']),

      // focusin
      focus_test(textLevel1, 'focusin input', ['focusin input']),
      focus_test(textLevel2, 'focusin input', ['focusin input']),

      // focusin bubbles
      focus_test(textLevel2, 'focusin span', ['focusin span']),

      // focus doesn't bubble
      focus_test(textLevel2, 'focus span', []),

      // blur works, doesn't bubble
      blur_test(textLevel1, 'blur input', ['blur input']),
      blur_test(textLevel2, 'blur input', ['blur input']),
      blur_test(textLevel2, 'blur span', []),

      // focusout works, bubbles
      blur_test(textLevel1, 'focusout input', ['focusout input']),
      blur_test(textLevel2, 'focusout input', ['focusout input']),
      blur_test(textLevel2, 'focusout span', ['focusout span'])
    ];
  })());


Tinytest.add("spark - change events", function(test) {

  var checkboxLevel1 = '<input type="checkbox" />';
  var checkboxLevel2 = '<span id="spanOfMurder">'+
    '<input type="checkbox" id="checkboxy" /></span>';


  // on top-level
  var checkbox1 = make_input_tester(checkboxLevel1, 'change input');
  test.equal(checkbox1.click(), ['change input']);
  checkbox1.kill();

  // on second-level (should bubble)
  var checkbox2 = make_input_tester(checkboxLevel2,
                                    'change input', 'change span');
  test.equal(checkbox2.click(), ['change input', 'change span']);
  test.equal(checkbox2.click(), ['change input', 'change span']);
  checkbox2.redraw();
  test.equal(checkbox2.click(), ['change input', 'change span']);
  checkbox2.kill();

  checkbox2 = make_input_tester(checkboxLevel2, 'change input');
  test.equal(checkbox2.focus(), []);
  test.equal(checkbox2.click(), ['change input']);
  test.equal(checkbox2.blur(), []);
  test.equal(checkbox2.click(), ['change input']);
  checkbox2.kill();

  var checkbox2 = make_input_tester(
    checkboxLevel2,
    'change input', 'change span', 'change div');
  test.equal(checkbox2.click(), ['change input', 'change span']);
  checkbox2.kill();

});


testAsyncMulti(
  "spark - submit events",
  (function() {
    var hitlist = [];
    var killLater = function(thing) {
      hitlist.push(thing);
    };

    var LIVEUI_TEST_RESPONDER = "/spark_test_responder";
    var IFRAME_URL_1 = LIVEUI_TEST_RESPONDER + "/";
    var IFRAME_URL_2 = "about:blank"; // most cross-browser-compatible
    if (window.opera) // opera doesn't like 'about:blank' form target
      IFRAME_URL_2 = LIVEUI_TEST_RESPONDER+"/blank";

    return [
      function(test, expect) {

        // Submit events can be canceled with preventDefault, which prevents the
        // browser's native form submission behavior.  This behavior takes some
        // work to ensure cross-browser, so we want to test it.  To detect
        // a form submission, we target the form at an iframe.  Iframe security
        // makes this tricky.  What we do is load a page from the server that
        // calls us back on 'load' and 'unload'.  We wait for 'load', set up the
        // test, and then see if we get an 'unload' (due to the form submission
        // going through) or not.
        //
        // This is quite a tricky implementation.

        var withIframe = function(onReady1, onReady2) {
          var frameName = "submitframe"+String(Math.random()).slice(2);
          var iframeDiv = OnscreenDiv(
            Meteor.render(function() {
              return '<iframe name="'+frameName+'" '+
                'src="'+IFRAME_URL_1+'"></iframe>';
            }));
          var iframe = iframeDiv.node().firstChild;

          iframe.loadFunc = function() {
            onReady1(frameName, iframe, iframeDiv);
            onReady2(frameName, iframe, iframeDiv);
          };
          iframe.unloadFunc = function() {
            iframe.DID_CHANGE_PAGE = true;
          };
        };
        var expectCheckLater = function(options) {
          var check = expect(function(iframe, iframeDiv) {
            if (options.shouldSubmit)
              test.isTrue(iframe.DID_CHANGE_PAGE);
            else
              test.isFalse(iframe.DID_CHANGE_PAGE);

            // must do this inside expect() so it happens in time
            killLater(iframeDiv);
          });
          var checkLater = function(frameName, iframe, iframeDiv) {
            Meteor.setTimeout(function() {
              check(iframe, iframeDiv);
            }, 500); // wait for frame to unload
          };
          return checkLater;
        };
        var buttonFormHtml = function(frameName) {
          return '<div style="height:0;overflow:hidden">'+
            '<form action="'+IFRAME_URL_2+'" target="'+
            frameName+'">'+
            '<span><input type="submit"></span>'+
            '</form></div>';
        };

        // test that form submission by click fires event,
        // and also actually submits
        withIframe(function(frameName, iframe) {
          var form = make_input_tester(
            buttonFormHtml(frameName), 'submit form');
          test.equal(form.click(), ['submit form']);
          killLater(form);
        }, expectCheckLater({shouldSubmit:true}));

        // submit bubbles up
        withIframe(function(frameName, iframe) {
          var form = make_input_tester(
            buttonFormHtml(frameName), 'submit form', 'submit div');
          test.equal(form.click(), ['submit form', 'submit div']);
          killLater(form);
        }, expectCheckLater({shouldSubmit:true}));

        // preventDefault works, still bubbles
        withIframe(function(frameName, iframe) {
          var form = make_input_tester(
            buttonFormHtml(frameName), {
              'submit form': function(evt) {
                test.equal(evt.type, 'submit');
                test.equal(evt.target.nodeName, 'FORM');
                this.push('submit form');
                evt.preventDefault();
              },
              'submit div': function(evt) {
                test.equal(evt.type, 'submit');
                test.equal(evt.target.nodeName, 'FORM');
                this.push('submit div');
              },
              'submit a': function(evt) {
                this.push('submit a');
              }
            }
          );
          test.equal(form.click(), ['submit form', 'submit div']);
          killLater(form);
        }, expectCheckLater({shouldSubmit:false}));

      },
      function(test, expect) {
        _.each(hitlist, function(thing) {
          thing.kill();
        });
        Meteor.flush();
      }
    ];
  })());


Tinytest.add("spark - controls - radio", function(test) {
  var R = ReactiveVar("");
  var change_buf = [];
  var div = OnscreenDiv(renderWithPreservation(function() {
    var buf = [];
    buf.push("Band: ");
    _.each(["AM", "FM", "XM"], function(band) {
      var checked = (R.get() === band) ? 'checked="checked"' : '';
      buf.push('<input type="radio" name="bands" '+
               'value="'+band+'" '+checked+'/>');
    });
    buf.push(R.get());
    var html = buf.join('');

    html = Spark.attachEvents({
      'change input': function(event) {
        // IE 7 is known to fire change events on all
        // the radio buttons with checked=false, as if
        // each button were deselected before selecting
        // the new one.  (Meteor doesn't normalize this
        // behavior.)
        // However, browsers are consistent if we are
        // getting a checked=true notification.
        var btn = event.target;
        if (btn.checked) {
          var band = btn.value;
          change_buf.push(band);
          R.set(band);
        }
      }
    }, html);
    return html;
  }));

  Meteor.flush();

  // get the three buttons; they should be considered 'labeled'
  // by the patcher and not change identities!
  var btns = nodesToArray(div.node().getElementsByTagName("INPUT"));

  test.equal(_.pluck(btns, 'checked'), [false, false, false]);
  test.equal(div.text(), "Band: ");

  clickElement(btns[0]);
  test.equal(change_buf, ['AM']);
  change_buf.length = 0;
  Meteor.flush();
  test.equal(_.pluck(btns, 'checked'), [true, false, false]);
  test.equal(div.text(), "Band: AM");

  clickElement(btns[1]);
  test.equal(change_buf, ['FM']);
  change_buf.length = 0;
  Meteor.flush();
  test.equal(_.pluck(btns, 'checked'), [false, true, false]);
  test.equal(div.text(), "Band: FM");

  clickElement(btns[2]);
  test.equal(change_buf, ['XM']);
  change_buf.length = 0;
  Meteor.flush();
  test.equal(_.pluck(btns, 'checked'), [false, false, true]);
  test.equal(div.text(), "Band: XM");

  clickElement(btns[1]);
  test.equal(change_buf, ['FM']);
  change_buf.length = 0;
  Meteor.flush();
  test.equal(_.pluck(btns, 'checked'), [false, true, false]);
  test.equal(div.text(), "Band: FM");

  div.kill();
});

_.each(['textarea', 'text', 'password', 'submit', 'button',
        'reset', 'select', 'hidden'], function (type) {
  Tinytest.add("spark - controls - " + type, function(test) {
    var R = ReactiveVar({x:"test"});
    var R2 = ReactiveVar("");
    var div = OnscreenDiv(renderWithPreservation(function() {
      // Re-render when R2 is changed, even though it doesn't affect HTML.
      R2.get();
      if (type === 'textarea') {
        return '<textarea id="someId">This is a ' + R.get().x + '</textarea>';
      } else if (type === 'select') {
        var options = ['This is a test', 'This is a fridge',
                       'This is a frog', 'foobar', 'This is a photograph',
                       'This is a monkey', 'This is a donkey'];
        return '<select id="someId">' + _.map(options, function (o) {
          var maybeSel = ('This is a ' + R.get().x) === o ? 'selected' : '';
          return '<option ' + maybeSel + '>' + o + '</option>';
        }).join('') + '</select>';
      } else {
        return '<input type="' + type + '" id="someId" value="This is a ' +
          R.get().x + '">';
      }
    }));
    div.show(true);
    var canFocus = (type !== 'hidden');

    var input = div.node().firstChild;
    if (type === 'textarea' || type === 'select') {
      test.equal(input.nodeName, type.toUpperCase());
    } else {
      test.equal(input.nodeName, 'INPUT');
      test.equal(input.type, type);
    }
    test.equal(DomUtils.getElementValue(input), "This is a test");
    test.equal(input._sparkOriginalRenderedValue, ["This is a test"]);

    // value updates reactively
    R.set({x:"fridge"});
    Meteor.flush();
    test.equal(DomUtils.getElementValue(input), "This is a fridge");
    test.equal(input._sparkOriginalRenderedValue, ["This is a fridge"]);

    if (canFocus) {
      // ...unless focused
      focusElement(input);
      R.set({x:"frog"});
      Meteor.flush();
      test.equal(DomUtils.getElementValue(input), "This is a fridge");
      test.equal(input._sparkOriginalRenderedValue, ["This is a fridge"]);

      // blurring and re-setting works
      blurElement(input);
      Meteor.flush();
      test.equal(DomUtils.getElementValue(input), "This is a fridge");
      test.equal(input._sparkOriginalRenderedValue, ["This is a fridge"]);
    }
    R.set({x:"frog"});
    Meteor.flush();
    test.equal(DomUtils.getElementValue(input), "This is a frog");
    test.equal(input._sparkOriginalRenderedValue, ["This is a frog"]);

    // Setting a value (similar to user typing) should prevent value from being
    // reverted if the div is re-rendered but the rendered value (ie, R) does
    // not change.
    DomUtils.setElementValue(input, "foobar");
    R2.set("change");
    Meteor.flush();
    test.equal(DomUtils.getElementValue(input), "foobar");
    test.equal(input._sparkOriginalRenderedValue, ["This is a frog"]);

    // ... but if the actual rendered value changes, that should take effect.
    R.set({x:"photograph"});
    Meteor.flush();
    test.equal(DomUtils.getElementValue(input), "This is a photograph");
    test.equal(input._sparkOriginalRenderedValue, ["This is a photograph"]);

    // If the rendered value and user value change in the same way (eg, the user
    // changed it and then invoked a menthod that set the database value based
    // on what they changed), make sure that the _sparkOriginalRenderedValue
    // gets updated too.
    DomUtils.setElementValue(input, "This is a monkey");
    R.set({x:"monkey"});
    Meteor.flush();
    test.equal(DomUtils.getElementValue(input), "This is a monkey");
    test.equal(input._sparkOriginalRenderedValue, ["This is a monkey"]);

    if (canFocus) {
      // The same as the previous test... except make sure that it still works
      // if the input is focused. ie, imagine that the user edited the field and
      // hit enter with the field still focused, updating the database to match
      // the field and keeping the field focused.
      DomUtils.setElementValue(input, "This is a donkey");
      focusElement(input);
      R.set({x:"donkey"});
      Meteor.flush();
      test.equal(DomUtils.getElementValue(input), "This is a donkey");
      test.equal(input._sparkOriginalRenderedValue, ["This is a donkey"]);
    }

    div.kill();
  });
});

Tinytest.add("spark - oldschool landmark matching", function(test) {

  // basic created / onscreen / offscreen callback flow
  // (ported from old chunk-matching API)

  var buf;
  var counts;

  var testCallbacks = function(theNum /*, extend opts*/) {
    return _.extend.apply(_, [{
      created: function() {
        this.num = String(theNum);
        var howManyBefore = counts[this.num] || 0;
        counts[this.num] = howManyBefore + 1;
        for(var i=0;i<howManyBefore;i++)
          this.num += "*"; // add stars
        buf.push("c"+this.num);
      },
      rendered: function(start, end, range) {
        buf.push("r"+this.num);
      },
      destroyed: function() {
        buf.push("d"+this.num);
      }
    }].concat(_.toArray(arguments).slice(1)));
  };

  buf = [];
  counts = {};
  var R = ReactiveVar("A");
  var div = OnscreenDiv(Meteor.render(function() {
    var html = Spark.createLandmark(testCallbacks(0), function () {
      return String(R.get());
    });
    return html;
  }, testCallbacks(0)));

  test.equal(buf, ["c0"]);

  test.equal(div.html(), "A");
  Meteor.flush();
  test.equal(buf, ["c0", "r0"]);
  test.equal(div.html(), "A");

  R.set("B");
  Meteor.flush();
  test.equal(buf, ["c0", "r0", "r0"]);
  test.equal(div.html(), "B");


  div.kill();
  Meteor.flush();
  test.equal(buf, ["c0", "r0", "r0", "d0"]);

  // with a branch

  buf = [];
  counts = {};
  R = ReactiveVar("A");
  div = OnscreenDiv(Meteor.render(function() {
    R.get();
    return Spark.createLandmark(testCallbacks(0), function () {
      var html = Spark.labelBranch("foo", function () {
        return Spark.createLandmark(testCallbacks(1),
                                    function () { return "HI"; });
      });
      return "<div>" + html + "</div>";
    });
  }));

  test.equal(buf, ["c0", "c1"]);
  Meteor.flush();
  // what order of chunks {0,1} is preferable??
  // should be consistent but I'm not sure what makes most sense.
  test.equal(buf, "c0,c1,r1,r0".split(','));
  buf.length = 0;

  R.set("B");
  Meteor.flush();
  test.equal(buf, "r1,r0".split(','));
  buf.length = 0;

  div.kill();
  Meteor.flush();
  buf.sort();
  test.equal(buf, "d0,d1".split(','));
});


Tinytest.add("spark - oldschool branch keys", function(test) {

  var R, div;

  // Re-rendered Meteor.render keeps same landmark state

  var objs = [];
  R = ReactiveVar("foo");
  div = OnscreenDiv(Meteor.render(function() {
    return Spark.createLandmark({
      rendered: function () { objs.push(true); }
    }, function () { return R.get(); });
  }));

  Meteor.flush();
  R.set("bar");
  Meteor.flush();
  R.set("baz");
  Meteor.flush();

  test.equal(objs.length, 3);
  test.isTrue(objs[0] === objs[1]);
  test.isTrue(objs[1] === objs[2]);

  div.kill();
  Meteor.flush();

  // track chunk matching / re-rendering in detail

  var buf;
  var counts;

  var testCallbacks = function(theNum /*, extend opts*/) {
    return _.extend.apply(_, [{
      created: function() {
        this.num = String(theNum);
        var howManyBefore = counts[this.num] || 0;
        counts[this.num] = howManyBefore + 1;
        for(var i=0;i<howManyBefore;i++)
          this.num += "*"; // add stars
        buf.push("c"+this.num);
      },
      rendered: function(start, end, range) {
        buf.push("on"+this.num);
      },
      destroyed: function() {
        buf.push("off"+this.num);
      }
    }].concat(_.toArray(arguments).slice(1)));
  };

  var counter = 1;
  var chunk = function(contents, num, branch) {
    if (branch === null)
      branch = "unique_branch_" + (counter++);

    return Spark.labelBranch(branch, function () {
      return Spark.createLandmark(
        testCallbacks(num),
        function () {
          if (typeof contents === "string")
            return contents;
          else if (_.isArray(contents))
            return _.map(contents, function(x) {
              if (typeof x === 'string')
                return x;
              return chunk(x[0], x[1], x[2]);
            }).join('');
          else
            return contents();
        });
    });
  };

  ///// Chunk 1 contains 2,3,4, all should be matched

  buf = [];
  counts = {};

  R = ReactiveVar("foo");
  div = OnscreenDiv(Meteor.render(function() {
    if (R.get() === 'nothing')
      return "no chunk!";
    else
      return chunk([['<span>apple</span>', 2, 'x'],
                    ['<span>banana</span>', 3, 'y'],
                    ['<span>kiwi</span>', 4, 'z']
                   ], 1, 'fruit');
  }));

  Meteor.flush();
  buf.sort();
  test.equal(buf, ['c1', 'c2', 'c3', 'c4', 'on1', 'on2', 'on3', 'on4']);
  buf.length = 0;

  R.set("bar");
  Meteor.flush();
  buf.sort();
  test.equal(buf, ['on1', 'on2', 'on3', 'on4']);
  buf.length = 0;

  R.set("nothing");
  Meteor.flush();
  buf.sort();
  test.equal(buf, ['off1', 'off2', 'off3', 'off4']);
  buf.length = 0;

  div.kill();
  Meteor.flush();

  ///// Chunk 3 has no branch key, should be recreated

  buf = [];
  counts = {};

  R = ReactiveVar("foo");
  div = OnscreenDiv(Meteor.render(function() {
    if (R.get() === 'nothing')
      return "no chunk!";
    else
      return chunk([['<span>apple</span>', 2, 'x'],
                    ['<span>banana</span>', 3, null],
                    ['<span>kiwi</span>', 4, 'z']
                   ], 1, 'fruit');
  }));

  Meteor.flush();
  buf.sort();
  test.equal(buf, ['c1', 'c2', 'c3', 'c4', 'on1', 'on2', 'on3', 'on4']);
  buf.length = 0;

  R.set("bar");
  Meteor.flush();
  buf.sort();
  test.equal(buf, ['c3*', 'off3', 'on1', 'on2', 'on3*', 'on4']);
  buf.length = 0;

  div.kill();
  Meteor.flush();
  buf.sort();
  // killing the div should have given us offscreen calls for 1,2,3*,4
  test.equal(buf, ['off1', 'off2', 'off3*', 'off4']);
  buf.length = 0;


  // XXX test intermediate unkeyed chunks;
  // duplicate branch keys; different order
});

Tinytest.add("spark - isolate inside landmark", function (test) {

  // test that preservation maps from all landmarks are honored when
  // an isolate is re-rendered, even the landmarks that are outside
  // the isolate and therefore not involved in the re-render.

  var R = ReactiveVar(1);
  var d = OnscreenDiv(Spark.render(function () {
    return Spark.createLandmark(
      { preserve: ['.foo'] },
      function () {
        return Spark.isolate(function () {
          return '<hr class="foo"/>' + R.get();
        });
      });
  }));

  var foo1 = d.node().firstChild;
  test.equal(d.node().firstChild.nextSibling.nodeValue, '1');
  R.set(2);
  Meteor.flush();
  var foo2 = d.node().firstChild;
  test.equal(d.node().firstChild.nextSibling.nodeValue, '2');
  test.isTrue(foo1 === foo2);
  d.kill();
  Meteor.flush();

  // test that selectors in a landmark preservation map are resolved
  // relative to the landmark, not relative to the re-rendered
  // fragment.  the selector may refer to nodes that are outside the
  // re-rendered fragment, and the selector will still match.

  R = ReactiveVar(1);
  d = OnscreenDiv(Spark.render(function () {
    return Spark.createLandmark(
      { preserve: ['div .foo'] },
      function () {
        return "<div>"+Spark.isolate(function () {
          return '<hr class="foo"/>' + R.get();
        })+"</div>";
      });
  }));

  var foo1 = DomUtils.find(d.node(), '.foo');
  test.equal(foo1.nodeName, 'HR');
  test.equal(foo1.nextSibling.nodeValue, '1');
  R.set(2);
  Meteor.flush();
  var foo2 = DomUtils.find(d.node(), '.foo');
  test.equal(foo2.nodeName, 'HR');
  test.equal(foo2.nextSibling.nodeValue, '2');
  test.isTrue(foo1 === foo2);
  d.kill();
  Meteor.flush();
});

Tinytest.add("spark - nested onscreen processing", function (test) {
  var cursor = {
    observe: function () { return { stop: function () {} }; }
  };

  var x = [];
  var d = OnscreenDiv(Spark.render(function () {
    return Spark.list(cursor, function () {}, function () {
      return Spark.list(cursor, function () {}, function () {
        return Spark.list(cursor, function () {}, function () {
          return Spark.createLandmark({
            created: function () { x.push('c'); },
            rendered: function () { x.push('r'); },
            destroyed: function () { x.push('d'); }
          }, function () { return "hi"; });
        });
      });
    });
  }));

  Meteor.flush();
  test.equal(x.join(''), 'cr');
  x = [];
  d.kill();
  Meteor.flush();
  test.equal(x.join(''), 'd');
});

Tinytest.add("spark - current landmark", function (test) {
  var R = ReactiveVar(1);
  var callbacks = 0;
  var d = OnscreenDiv(Meteor.render(function () {
    var html = Spark.createLandmark({
      created: function () {
        this.a = 1;
        this.renderCount = 0;
        test.isFalse('b' in this);
        callbacks++;
      },
      rendered: function () {
        test.equal(this.a, 9);
        test.equal(this.b, 2);
        if (this.renderCount === 0)
          test.isFalse('c' in this);
        else
          test.isTrue('c' in this);
        this.renderCount++;
        callbacks++;
      },
      destroyed: function () {
        test.equal(this.a, 9);
        test.equal(this.b, 2);
        test.equal(this.c, 3);
        callbacks++;
      }
    }, function (lm) {
      var html = '<span>hi</span>';

      if (R.get() === 1) {
        test.equal(callbacks, 1);
        test.equal(lm.a, 1);
        lm.a = 9;
        lm.b = 2;
        test.isFalse('c' in lm);
        test.equal(callbacks, 1);
        lm = null;
      }

      if (R.get() === 2) {
        test.equal(callbacks, 2);
        test.equal(lm.a, 9);
        test.equal(lm.b, 2);
        test.equal(lm.c, 3);
        test.equal(lm.renderCount, 1);
      }

      return html;
    });


    if (R.get() >= 3) {
      html += Spark.labelBranch('branch', function () {
        var html = Spark.createLandmark({
          created: function () {
            this.outer = true;
          },
          rendered: function () {
            this.renderCount = (this.renderCount || 0) + 1;
          }
        }, function (lm) {
          var html = '<span>outer</span>';
          test.isTrue(lm.outer);
          test.equal(R.get() - 3, lm.renderCount || 0);
          html += Spark.labelBranch("a", function () {
            var html = Spark.createLandmark({
              created: function () {
                this.innerA = true;
              },
              rendered: function () {
                this.renderCount = (this.renderCount || 0) + 1;
              }
            }, function (lm) {
              var html = '<span>innerA</span>';
              test.isTrue(lm.innerA);
              return html;
            });
            return html;
          });
          return html;
        });

        if (R.get() === 3 || R.get() >= 5) {
          html += Spark.labelBranch("b", function () {
            var html = Spark.createLandmark({
              created: function () {
                this.innerB = true;
              },
              rendered: function () {
                this.renderCount = (this.renderCount || 0) + 1;
              }
            }, function (lm) {
              var html = '<span>innerB</span>';
              test.isTrue(lm.innerB);
              test.equal(R.get() === 3 ? 0 : R.get() - 5,
                         lm.renderCount || 0);
              return html;
            });
            return html;
          });
        }
        return html;
      });
    }
    return html;
  }));

  var findOuter = function () {
    return d.node().firstChild.nextSibling;
  };

  var findInnerA = function () {
    return findOuter().nextSibling;
  };

  var findInnerB = function () {
    return findInnerA().nextSibling;
  };

  test.equal(callbacks, 1);
  Meteor.flush();
  test.equal(callbacks, 2);
  test.equal(null, Spark._getEnclosingLandmark(d.node()));
  var enc = Spark._getEnclosingLandmark(d.node().firstChild);
  test.equal(enc.a, 9);
  test.equal(enc.b, 2);
  test.isFalse('c' in enc);
  enc.c = 3;
  Meteor.flush();
  test.equal(callbacks, 2);

  R.set(2)
  Meteor.flush();
  test.equal(callbacks, 3);

  R.set(3)
  Meteor.flush();
  test.equal(callbacks, 4);

  test.isTrue(Spark._getEnclosingLandmark(findOuter()).outer);
  test.isTrue(Spark._getEnclosingLandmark(findInnerA()).innerA);
  test.isTrue(Spark._getEnclosingLandmark(findInnerB()).innerB);
  test.equal(1, Spark._getEnclosingLandmark(findOuter()).renderCount);
  test.equal(1, Spark._getEnclosingLandmark(findInnerA()).renderCount);
  test.equal(1, Spark._getEnclosingLandmark(findInnerB()).renderCount);

  R.set(4)
  Meteor.flush();
  test.equal(callbacks, 5);
  test.equal(2, Spark._getEnclosingLandmark(findOuter()).renderCount);
  test.equal(2, Spark._getEnclosingLandmark(findInnerA()).renderCount);

  R.set(5)
  Meteor.flush();
  test.equal(callbacks, 6);
  test.equal(3, Spark._getEnclosingLandmark(findOuter()).renderCount);
  test.equal(3, Spark._getEnclosingLandmark(findInnerA()).renderCount);
  test.equal(1, Spark._getEnclosingLandmark(findInnerB()).renderCount);

  R.set(6)
  Meteor.flush();
  test.equal(callbacks, 7);
  test.equal(4, Spark._getEnclosingLandmark(findOuter()).renderCount);
  test.equal(4, Spark._getEnclosingLandmark(findInnerA()).renderCount);
  test.equal(2, Spark._getEnclosingLandmark(findInnerB()).renderCount);

  d.kill();
  Meteor.flush();
  test.equal(callbacks, 8);

  Meteor.flush();
  test.equal(callbacks, 8);
});

Tinytest.add("spark - find/findAll on landmark", function (test) {
  var l1, l2;
  var R = ReactiveVar(1);

  var d = OnscreenDiv(Spark.render(function () {
    return "<div id=1>k</div><div id=2>" +
      Spark.labelBranch("a", function () {
        return Spark.createLandmark({
          created: function () {
            test.instanceOf(this, Spark.Landmark);
            if (l1)
              test.equal(l1, this);
            l1 = this;
          }
        }, function () {
          return "<span class='a' id=3>a" +
            Spark.labelBranch("b", function () {
              return Spark.isolate(
                function () {
                  R.get();
                  return Spark.createLandmark(
                    {
                      created: function () {
                        test.instanceOf(this, Spark.Landmark);
                        if (l2)
                          test.equal(l2, this);
                        l2 = this;
                      }
                    }, function () {
                      return "<span class='b' id=4>b4</span>" +
                        "<span class='b' id=6>b6</span>";
                    });
                });
            }) + "</span>";
        });
      }) + "<span class='c' id=5>c</span></div>";
  }));

  var ids = function (nodes) {
    if (!(nodes instanceof Array))
      nodes = nodes ? [nodes] : [];
    return _.pluck(nodes, 'id').join('');
  };

  var check = function (all) {
    var f = all ? 'findAll' : 'find';

    test.equal(ids(l1[f]('.kitten')), '');
    test.equal(ids(l2[f]('.kitten')), '');

    test.equal(ids(l1[f]('.a')), '3');
    test.equal(ids(l2[f]('.a')), '');

    test.equal(ids(l1[f]('.b')), all ? '46' : '4');
    test.equal(ids(l2[f]('.b')), all ? '46' : '4');

    test.equal(ids(l1[f]('.c')), '');
    test.equal(ids(l2[f]('.c')), '');

    test.equal(ids(l1[f]('.a .b')), all ? '46' : '4');
    test.equal(ids(l2[f]('.a .b')), '');
  };

  check(false);
  check(true);
  R.set(2);
  Meteor.flush();
  check(false);
  check(true);

  d.kill();
  Meteor.flush();
});

Tinytest.add("spark - landmark clean-up", function (test) {

  var crd;
  var makeCrd = function () {
    var crd = [0,0,0];
    crd.callbacks = {
      created: function () { crd[0]++; },
      rendered: function () { crd[1]++; },
      destroyed: function () { crd[2]++; }
    };
    return crd;
  };

  // not inside render
  crd = makeCrd();
  Spark.createLandmark(crd.callbacks, function () { return 'hi'; });
  test.equal(crd, [1,0,1]);

  // landmark never materialized
  crd = makeCrd();
  Spark.render(function() {
    var html =
          Spark.createLandmark(crd.callbacks, function () { return 'hi'; });
    return '';
  });
  test.equal(crd, [1,0,1]);
  Meteor.flush();
  test.equal(crd, [1,0,1]);

  // two landmarks, only one materialized at a time.
  // one replaces the other
  var crd1 = makeCrd();
  var crd2 = makeCrd();
  var R = ReactiveVar(1);
  var div = OnscreenDiv(Meteor.render(function() {
    return (R.get() === 1 ?
            Spark.createLandmark(crd1.callbacks, function() { return 'hi'; }) :
            Spark.createLandmark(crd2.callbacks, function() { return 'hi'; }));
  }));
  test.equal(crd1, [1,0,0]); // created
  test.equal(crd2, [0,0,0]);
  Meteor.flush();
  test.equal(crd1, [1,1,0]); // rendered
  test.equal(crd2, [0,0,0]);
  R.set(2);
  Meteor.flush();
  test.equal(crd1, [1,1,0]); // not destroyed (callback replaced)
  test.equal(crd2, [0,1,0]); // matched

  div.kill();
  Meteor.flush();
  test.equal(crd1, [1,1,0]);
  test.equal(crd2, [0,1,1]); // destroyed
});

Tinytest.add("spark - bubbling render", function (test) {
  var makeCrd = function () {
    var crd = [0,0,0];
    crd.callbacks = {
      created: function () { crd[0]++; },
      rendered: function () { crd[1]++; },
      destroyed: function () { crd[2]++; }
    };
    return crd;
  };

  var crd1 = makeCrd();
  var crd2 = makeCrd();

  var R = ReactiveVar('foo');
  var div = OnscreenDiv(Spark.render(function () {
    return Spark.createLandmark(crd1.callbacks, function () {
      return Spark.labelBranch('fred', function () {
        return Spark.createLandmark(crd2.callbacks, function () {
          return Spark.isolate(function () {
            return R.get();
          });
        });
      });
    });
  }));

  Meteor.flush();
  test.equal(div.html(), 'foo');
  test.equal(crd1, [1,1,0]);
  test.equal(crd2, [1,1,0]);

  R.set('bar');
  Meteor.flush();
  test.equal(div.html(), 'bar');
  test.equal(crd1, [1,2,0]);
  test.equal(crd2, [1,2,0]);

  div.kill();
  Meteor.flush();
});

Tinytest.add("spark - landmark arg", function (test) {
  var div = OnscreenDiv(Spark.render(function () {
    return Spark.createLandmark({
      created: function () {
        test.isFalse(this.hasDom());
      },
      rendered: function () {
        var landmark = this;
        landmark.firstNode().innerHTML = 'Greetings';
        landmark.lastNode().innerHTML = 'Line';
        landmark.find('i').innerHTML =
          (landmark.findAll('b').length)+"-bold";
        test.isTrue(landmark.hasDom());
      },
      destroyed: function () {
        test.isFalse(this.hasDom());
      }
    }, function () {
      return Spark.attachEvents({
        'click': function (event, landmark) {
          landmark.firstNode().innerHTML = 'Hello';
          landmark.lastNode().innerHTML = 'World';
          landmark.find('i').innerHTML =
            (landmark.findAll('*').length)+"-element";
        }
      }, '<b>Foo</b> <i>Bar</i> <u>Baz</u>');
    });
  }));

  test.equal(div.text(), "Foo Bar Baz");
  Meteor.flush();
  test.equal(div.text(), "Greetings 1-bold Line");
  clickElement(DomUtils.find(div.node(), 'i'));
  test.equal(div.text(), "Hello 3-element World");

  div.kill();
  Meteor.flush();
});

Tinytest.add("spark - landmark preserve", function (test) {
  var R = ReactiveVar("foo");

  var lmhr = function () {
    return Spark.createLandmark({preserve:['hr']}, function () {
      return '<hr/>';
    });
  };

  var div = OnscreenDiv(Meteor.render(function () {
    return "<div><span>" + R.get() + "</span>" +
      Spark.labelBranch('A', lmhr) + Spark.labelBranch('B', lmhr) +
      "</div>";
  }));

  test.equal(div.html(), '<div><span>foo</span><hr><hr></div>');
  var hrs1 = DomUtils.findAll(div.node(), 'hr');
  R.set("bar");
  Meteor.flush();
  test.equal(div.html(), '<div><span>bar</span><hr><hr></div>');
  var hrs2 = DomUtils.findAll(div.node(), 'hr');

  test.isTrue(hrs1[0] === hrs2[0]);
  test.isTrue(hrs1[1] === hrs2[1]);

  div.kill();
  Meteor.flush();
});

Tinytest.add("spark - branch annotation is optional", function (test) {
  // test that labelBranch works on HTML that isn't element-balanced
  // and doesn't fail by trying to emit an annotation when it contains
  // no landmarks.

  var R = ReactiveVar("foo");

  var Rget = function () { return R.get(); };
  var cnst = function (c) { return function () { return c; }; };
  var lmhr = function () {
    return Spark.createLandmark({preserve:['hr']}, function () {
      return '<hr/>';
    });
  };

  var div = OnscreenDiv(Meteor.render(function () {
    return '<div class="' + Spark.labelBranch('A', Rget) + '">' +
      Spark.labelBranch('B', cnst('</div><div>')) +
      Spark.labelBranch('C', lmhr) + Spark.labelBranch('D', lmhr) +
      '</div>';
  }));

  test.equal(div.html(), '<div class="foo"></div><div><hr><hr></div>');
  var div1 = div.node().firstChild;
  var hrs1 = DomUtils.findAll(div.node(), 'hr');
  R.set("bar");
  Meteor.flush();
  test.equal(div.html(), '<div class="bar"></div><div><hr><hr></div>');
  var div2 = div.node().firstChild;
  var hrs2 = DomUtils.findAll(div.node(), 'hr');

  test.isFalse(div1 === div2);
  test.isTrue(hrs1[0] === hrs2[0]);
  test.isTrue(hrs1[1] === hrs2[1]);

  div.kill();
  Meteor.flush();
});

Tinytest.add("spark - unique label", function (test) {
  var buf = [];
  var bufstr = function () {
    buf.sort();
    var str = buf.join('');
    buf.length = 0;
    return str;
  };

  var ublm = function () {
    return Spark.labelBranch(Spark.UNIQUE_LABEL, function () {
      return Spark.createLandmark({created: function () { buf.push('c'); },
                                   rendered: function () { buf.push('r'); },
                                   destroyed: function () { buf.push('d'); }},
                                  function () { return 'x'; });
    });
  };

  var R = ReactiveVar("foo");

  var div = OnscreenDiv(Meteor.render(function () {
    return ublm() + ublm() + ublm() + R.get();
  }));
  Meteor.flush();
  test.equal(bufstr(), 'cccrrr');
  R.set('bar');
  Meteor.flush();
  test.equal(bufstr(), 'cccdddrrr');

  div.kill();
  Meteor.flush();
  test.equal(bufstr(), 'ddd');

});

Tinytest.add("spark - list update", function (test) {
  var R = ReactiveVar('foo');

  var lst = [];
  lst.callbacks = [];
  lst.observe = function(callbacks) {
    lst.callbacks.push(callbacks);
    _.each(lst, function(x, i) {
      callbacks.added(x, i);
    });
    return {
      stop: function() {
        lst.callbacks = _.without(lst.callbacks, callbacks);
      }
    };
  };
  lst.another = function () {
    var i = lst.length;
    lst.push({_id:'item'+i});
    _.each(lst.callbacks, function (callbacks) {
      callbacks.added(lst[i], i);
    });
  };
  var div = OnscreenDiv(Meteor.render(function() {
    return R.get() + Spark.list(lst, function () {
      return '<hr>';
    });
  }));

  lst.another();
  Meteor.flush();
  test.equal(div.html(), "foo<hr>");

  lst.another();
  R.set('bar');
  Meteor.flush();
  test.equal(div.html(), "bar<hr><hr>");

  R.set('baz');
  lst.another();
  Meteor.flush();
  test.equal(div.html(), "baz<hr><hr><hr>");

  div.kill();
  Meteor.flush();
});

Tinytest.add("spark - callback context", function (test) {
  // Test that context in template callbacks is null.

  var cxs = [];
  var buf = [];

  var R = ReactiveVar("foo");
  var getCx = function () { return Meteor.deps.Context.current; };
  var callbackFunc = function (ltr) {
    return function () {
      buf.push(ltr);
      cxs.push(getCx());
    };
  };
  var div = OnscreenDiv(Meteor.render(function () {
    var cx = getCx();
    test.isTrue(cx); // sanity check for getCx
    var makeLandmark = function () {
      return Spark.createLandmark({created: callbackFunc('c'),
                                   rendered: callbackFunc('r'),
                                   destroyed: callbackFunc('d')},
                                  function () {
                                    return '<span>'+R.get()+'</span>';
                                  });
    };
    if (R.get() === 'foo')
      var unused = makeLandmark(); // will cause created/destroyed
    var html = Spark.labelBranch("foo", makeLandmark);
    test.isTrue(getCx() === cx); // test that context was restored
    return html;
  }));
  Meteor.flush();
  R.set('bar');
  Meteor.flush();
  div.kill();
  Meteor.flush();

  test.equal(buf.join(''), 'ccdrrd');
  test.equal(cxs.length, 6);
  test.isFalse(cxs[0]);
  test.isFalse(cxs[1]);
  test.isFalse(cxs[2]);
  test.isFalse(cxs[3]);
  test.isFalse(cxs[4]);
  test.isFalse(cxs[5]);

});

Tinytest.add("spark - legacy preserve names", function (test) {
  var R = ReactiveVar("foo");
  var R2 = ReactiveVar("apple");

  var div = OnscreenDiv(renderWithPreservation(function () {
    R.get(); // create dependency
    return ('<div id="aaa"><div><input name="field"></div></div>' +
            '<div id="bbb"><div><input name="field"></div></div>' +
            '<div id="ccc"><div>' + Spark.isolate(function () {
              R2.get();
              return '<input name="field">'; }) + '</div></div>' +
            '<input type="text">');
  }));


  var inputs1 = nodesToArray(div.node().getElementsByTagName('input'));
  R.set('bar');
  Meteor.flush();
  var inputs2 = nodesToArray(div.node().getElementsByTagName('input'));
  test.isTrue(inputs1[0] === inputs2[0]);
  test.isTrue(inputs1[1] === inputs2[1]);
  test.isTrue(inputs1[2] === inputs2[2]);
  test.isTrue(inputs1[3] !== inputs2[3]);

  R2.set('banana');
  Meteor.flush();
  var inputs3 = nodesToArray(div.node().getElementsByTagName('input'));
  test.isTrue(inputs1[2] === inputs3[2]);

  div.kill();
  Meteor.flush();
});

})();
