// XXX make sure that when tests use id="..." to trigger patching, "preserve" happens

Spark._checkIECompliance = true;

(function () {

Tinytest.add("spark - assembly", function (test) {

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
    test.equal(f.html(), html);

    var actualGroups = [];
    var tempRange = new LiveRange(Spark._TAG, frag);
    tempRange.visit(function (isStart, rng) {
      if (! isStart && rng.type === Spark._ANNOTATION_DATA)
        actualGroups.push(rangeToHtml(rng));
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


Tinytest.add("spark - basic tag contents", function (test) {

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

Tinytest.add("spark - slow path GC", function (test) {

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
  }

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
    return Spark.setDataContext(d1, "hi") + " " +
      Spark.setDataContext(d2, "there");
  });

  testData("_122_3__45", function () {
    return "<div>" +
      Spark.setDataContext(d1, "<div></div>") +
      Spark.setDataContext(d2, "<div><div></div></div>") +
      "<div></div>" +
      Spark.setDataContext(d3, "<div></div") +
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
});

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
  // Tests that attach_secondary_events actually does the
  // right thing in IE.  Also tests change event bubbling
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
          create: function () {
            x.push("c");
            this.a = X;
          },
          render: function () {
            x.push("r", this.a);
          },
          destroy: function () {
            x.push("d", this.a);
          }
        }, "hi");
    });
  }));

  expect([]);
  Meteor.flush();
  expect(["c", "r", X]);
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
  var expect = function (what) {
    test.equal(x, what);
    x = [];
  };

  var excludeLandmarks = [];
  for (var i = 0; i < 6; i++)
    excludeLandmarks.push(ReactiveVar(false));

  var isolateLandmarks = ReactiveVar(false);
  var testLandmark = function (id, htmlFunc) {
    var f = function () {
      return Spark.createLandmark({
        create: function () {
          x.push("c", id);
          this.id = id;
        },
        render: function () {
          x.push("r", id);
          test.equal(this.id, id);
        },
        destroy: function () {
          x.push("d", id);
          test.equal(this.id, id);
        }
      }, htmlFunc());
    };

    if (excludeLandmarks[id].get())
      return "";

    if (isolateLandmarks.get())
      return Spark.isolate(function () { return f(); });
    else
      return f();
  };

  var label = Spark.labelBranch;

  var dep = function (i) {
    return R[i].get();
  };

  var div = OnscreenDiv(Spark.render(function () {
    return Spark.isolate(function () {
      return (
        dep(0) +
          testLandmark(1, function () {return "hi" + dep(1); }) +
          label("a", dep(2) + testLandmark(2, function () { return "hi" + dep(3);})) +
          label("b", dep(4) + testLandmark(3, function () { return "hi" + dep(5) +
                label("c", dep(6) + testLandmark(4, function () { return "hi" + dep(7) +
                      label("d",
                            label("e",
                                  dep(8) + label("f",
                                                 testLandmark(5, function () { return "hi" + dep(9);}))));}));})));
    });
  }));

  expect([]);
  Meteor.flush();
  expect(["c", 1, "r", 1,
          "c", 2, "r", 2,
          "c", 3, "r", 3,
          "c", 4, "r", 4,
          "c", 5, "r", 5]);
  for (var i = 0; i < 10; i++) {
    R[i].set(1);
    expect([]);
    Meteor.flush();
    expect(["r", 1, "r", 2, "r", 3, "r", 4, "r", 5]);
  };

  excludeLandmarks[2].set(true);
  Meteor.flush();
  expect(["d", 2, "r", 1, "r", 3, "r", 4, "r", 5]);

  excludeLandmarks[2].set(false);
  excludeLandmarks[3].set(true);
  Meteor.flush();
  expect(["d", 3, "d", 4, "d", 5, "r", 1, "c", 2, "r", 2]);

  excludeLandmarks[2].set(true);
  excludeLandmarks[3].set(false);
  Meteor.flush();
  expect(["d", 2, "r", 1, "c", 3, "r", 3, "c", 4, "r", 4, "c", 5, "r", 5]);

  excludeLandmarks[2].set(false);
  Meteor.flush();
  expect(["r", 1, "c", 2, "r", 2, "r", 3, "r", 4, "r", 5]);

  isolateLandmarks.set(true);
  Meteor.flush();
  expect(["r", 1, "r", 2, "r", 3, "r", 4, "r", 5]);

  for (var i = 0; i < 10; i++) {
    var expected = [
      ["r", 1, "r", 2, "r", 3, "r", 4, "r", 5],
      ["r", 1],
      ["r", 1, "r", 2, "r", 3, "r", 4, "r", 5],
      ["r", 2],
      ["r", 1, "r", 2, "r", 3, "r", 4, "r", 5],
      ["r", 3, "r", 4, "r", 5],
      ["r", 3, "r", 4, "r", 5],
      ["r", 4, "r", 5],
      ["r", 4, "r", 5],
      ["r", 5]
    ][i];
    R[i].set(2);
    expect([]);
    Meteor.flush();
    expect(expected);
  };

  excludeLandmarks[4].set(true);
  Meteor.flush();
  expect(["d", 4, "d", 5, "r", 3]);

  excludeLandmarks[4].set(false);
  excludeLandmarks[5].set(true);
  Meteor.flush();
  expect(["r", 3, "c", 4, "r", 4]);

  excludeLandmarks[5].set(false);
  Meteor.flush();
  expect(["r", 4, "c", 5, "r", 5]);




  // XXX test that callbacks are replaced each time

});

var legacyLabels = {
  '*[id], #[name]': function(n) {
    var label = null;

    if (n.nodeType === 1) {
      if (n.id) {
        label = '#'+n.id;
      } else if (n.getAttribute("name")) {
        label = n.getAttribute("name");
        // Radio button special case:  radio buttons
        // in a group all have the same name.  Their value
        // determines their identity.
        // Checkboxes with the same name and different
        // values are also sometimes used in apps, so
        // we treat them similarly.
        if (n.nodeName === 'INPUT' &&
            (n.type === 'radio' || n.type === 'checkbox') &&
            n.value)
          label = label + ':' + n.value;
      }
    }

    return label;
  }
};


Tinytest.add("spark - preserved nodes (diff/patch)", function(test) {

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
    var frag = WrappedFrag(Meteor.render(function() {
      return Spark.createLandmark(
        {preserve: legacyLabels},
        nodeListToHtml(structure, R.get()));
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



})();
