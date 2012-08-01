// XXX when testing spark, set the checkIECompliance flag on universal-events somehow

Tinytest.add("spark - assembly", function (test) {

  var doTest = function(calc) {
    var frag = Spark.render(function() {
      return calc(function(str, expected) {
        return Spark.setDataContext(null, str);
      });
    });
    var groups = [];
    var html = calc(function(str, expected, noRange) {
      if (arguments.length > 1)
        str = expected;
      if (! noRange)
        groups.push(str);
      return str;
    });
    var f = WrappedFrag(frag);
    test.equal(f.html(), html);

    var actualGroups = [];
    var tempRange = new LiveRange(Spark._ANNOTATION_DATA, frag);
    tempRange.visit(function(isStart, rng) {
      if (! isStart)
        actualGroups.push(rangeToHtml(rng));
    });
    test.equal(actualGroups.join(','), groups.join(','));
  };

  doTest(function(A) { return "<p>Hello</p>"; });
  doTest(function(A) { return "<td>Hello</td><td>World</td>"; });
  doTest(function(A) { return "<td>"+A("Hello")+"</td>"; });
  doTest(function(A) { return A("<td>"+A("Hello")+"</td>"); });
  doTest(function(A) { return A(A(A(A(A(A("foo")))))); });
  doTest(
    function(A) { return "<div>Yo"+A("<p>Hello "+A(A("World")),"<p>Hello World</p>")+
                  "</div>"; });
  doTest(function(A) {
    return A("<ul>"+A("<li>one","<li>one</li>")+
             A("<li>two","<li>two</li>")+
             A("<li>three","<li>three</li>"),
             "<ul><li>one</li><li>two</li><li>three</li></ul>"); });

  doTest(function(A) {
    return A("<table>"+A("<tr>"+A("<td>"+A("Hi")+"</td>")+"</tr>")+"</table>",
             "<table><tbody><tr><td>Hi</td></tr></tbody></table>");
  });

  test.throws(function() {
    doTest(function(A) {
      var z = A("Hello");
      return z+z;
    });
  });

  var frag = Spark.render(function() {
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


Tinytest.add("spark - basic isolate", function (test) {

  var R = ReactiveVar('foo');

  var div = OnscreenDiv(Spark.render(function() {
    return '<div>' + Spark.isolate(function() {
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

Tinytest.add("spark - one render", function(test) {

  var R = ReactiveVar("foo");

  var frag = WrappedFrag(Meteor.render(function() {
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
  frag = WrappedFrag(Meteor.render(function() {
    return "";
  }));
  test.equal(frag.html(), "<!---->");

  // nodes coming and going at top level of fragment
  R.set(true);
  frag = WrappedFrag(Meteor.render(function() {
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
  frag = WrappedFrag(Meteor.render(function() {
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

Tinytest.add("spark - slow path GC", function(test) {

  var R = ReactiveVar(123);

  var div = OnscreenDiv(Meteor.render(function() {
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

Tinytest.add("spark - isolate", function(test) {

  var inc = function(v) {
    v.set(v.get() + 1); };

  var R1 = ReactiveVar(0);
  var R2 = ReactiveVar(0);
  var R3 = ReactiveVar(0);
  var count1 = 0, count2 = 0, count3 = 0;

  var frag = WrappedFrag(Meteor.render(function() {
    return R1.get() + "," + (count1++) + " " +
      Spark.isolate(function() {
        return R2.get() + "," + (count2++) + " " +
          Spark.isolate(function() {
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

  frag = WrappedFrag(Meteor.render(function() {
    var buf = [];
    buf.push('<div class="foo', R1.get(), '">');
    buf.push(Spark.isolate(function() {
      var buf = [];
      for(var i=0; i<R2.get(); i++) {
        buf.push(Spark.isolate(function() {
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
  test.equal(Spark.isolate(function() { return "foo"; }), "foo");

  // caller violating preconditions

  test.throws(function() {
    Meteor.render(function() {
      return Spark.isolate("foo");
    });
  });


  // unused isolate

  var Q = ReactiveVar("foo");
  Meteor.render(function() {
    // create an isolate, in render mode,
    // but don't use it.
    Spark.isolate(function() {
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
  var div = OnscreenDiv(Meteor.render(function() {
    return Spark.isolate(function() {
      return "x"+(stuff.get() ? 'y' : '') + Spark.isolate(function() {
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
  var numset = function(n) {
    _.each([num1, num2, num3], function(v, i) {
      v.set((i+1) === n);
    });
  };
  numset(1);

  var div = OnscreenDiv(Meteor.render(function() {
    return Spark.isolate(function() {
      return (num1.get() ? '1' : '')+
        Spark.isolate(function() {
          return (num2.get() ? '2' : '')+
            Spark.isolate(function() {
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
