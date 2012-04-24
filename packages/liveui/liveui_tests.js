
///// ReactiveVar /////

var ReactiveVar = function(initialValue) {
  if (! (this instanceof ReactiveVar))
    return new ReactiveVar(initialValue);

  this._value = (typeof initialValue === "undefined" ? null :
                 initialValue);
  this._deps = {};
};
ReactiveVar.prototype.get = function() {
  var context = Meteor.deps.Context.current;
  if (context && !(context.id in this._deps)) {
    this._deps[context.id] = context;
    var self = this;
    context.on_invalidate(function() {
      delete self._deps[context.id];
    });
  }

  return this._value;
};

ReactiveVar.prototype.set = function(newValue) {
  this._value = newValue;

  for(var id in this._deps)
    this._deps[id].invalidate();

};

ReactiveVar.prototype.numListeners = function() {
  return _.keys(this._deps).length;
};

///// WrappedFrag /////

var WrappedFrag = function(frag) {
  if (! (this instanceof WrappedFrag))
    return new WrappedFrag(frag);

  this.frag = frag;
};
WrappedFrag.prototype.rawHtml = function() {
  return Meteor.ui._fragmentToHtml(this.frag);
};
WrappedFrag.prototype.html = function() {
  return canonicalizeHtml(this.rawHtml());
};
WrappedFrag.prototype.hold = function() {
  return Meteor.ui._hold(this.frag), this;
};
WrappedFrag.prototype.release = function() {
  return Meteor.ui._release(this.frag), this;
};
WrappedFrag.prototype.node = function() {
  return this.frag;
};

///// OnscreenDiv /////

var OnscreenDiv = function(optFrag) {
  if (! (this instanceof OnscreenDiv))
    return new OnscreenDiv(optFrag);

  this.div = Meteor.ui._htmlToFragment(
    '<div class="OnscreenDiv" style="display: none"></div>').firstChild;
  document.body.appendChild(this.div);
  if (optFrag)
    this.div.appendChild(optFrag);
};
OnscreenDiv.prototype.rawHtml = function() {
  return this.div.innerHTML;
};
OnscreenDiv.prototype.html = function() {
  return canonicalizeHtml(this.rawHtml());
};
OnscreenDiv.prototype.text = function() {
  return this.div.innerText || this.div.textContent;
};
OnscreenDiv.prototype.node = function() {
  return this.div;
};
OnscreenDiv.prototype.kill = function() {
  // remove DIV from document by putting it in a fragment
  var frag = document.createDocumentFragment();
  frag.appendChild(this.div);
  // instigate clean-up on next flush()
  Meteor.ui._hold(frag);
  Meteor.ui._release(frag);
};
OnscreenDiv.prototype.remove = function() {
  this.div.parentNode.removeChild(this.div);
};

///// TESTS /////

Tinytest.add("liveui - one render", function(test) {

  var R = ReactiveVar("foo");

  var frag = WrappedFrag(Meteor.ui.render(function() {
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
  frag = WrappedFrag(Meteor.ui.render(function() {
    return "";
  }));
  test.equal(frag.html(), "<!---->");

  // nodes coming and going at top level of fragment
  R.set(true);
  frag = WrappedFrag(Meteor.ui.render(function() {
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
  frag = WrappedFrag(Meteor.ui.render(function() {
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
  test.throws(function() {
    Meteor.ui.render("foo");
  });

  test.throws(function() {
    Meteor.ui.render(function() { return document.createElement("DIV"); });
  });
});

Tinytest.add("liveui - onscreen", function(test) {

  var R = ReactiveVar(123);

  var div = OnscreenDiv(Meteor.ui.render(function() {
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

Tinytest.add("liveui - tables", function(test) {
  var R = ReactiveVar(0);

  var table = OnscreenDiv(Meteor.ui.render(function() {
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
  div.node().firstChild.appendChild(Meteor.ui.render(function() {
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
  div.node().appendChild(Meteor.ui._htmlToFragment("<table><tr></tr></table>"));
  R.set(3);
  div.node().getElementsByTagName("tr")[0].appendChild(Meteor.ui.render(
    function() {
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

  // Test tables with patching
  R.set("");
  div = OnscreenDiv(Meteor.ui.render(function() {
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

});

Tinytest.add("liveui - preserved nodes (diff/patch)", function(test) {

  var rand;

  var randomNodeList = function(optParentTag, depth) {
    var atTopLevel = ! optParentTag;
    var len = rand.nextIntBetween(atTopLevel ? 1 : 0, 10);
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
        case "table": return ['tr'];
        case "tr": return ['td'];
        case "p": case "b": case "i": return ['b', 'i'];
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

  for(var i=0; i<20; i++) {
    rand = new SeededRandom("preserved nodes "+i);

    var R = ReactiveVar(false);
    var structure = randomNodeList(null, 4);
    var frag = WrappedFrag(Meteor.ui.render(function() {
      return nodeListToHtml(structure, R.get());
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

Tinytest.add("liveui - copied attributes", function(test) {
  // make sure attributes are correctly changed (i.e. copied)
  // when preserving old nodes, either because they are labeled
  // or because they are a parent of a labeled node.

  var R1 = ReactiveVar("foo");
  var R2 = ReactiveVar("abcd");
  var frag = WrappedFrag(Meteor.ui.render(function() {
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
  frag = WrappedFrag(Meteor.ui.render(function() {
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
  frag = WrappedFrag(Meteor.ui.render(function() {
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
    var div = OnscreenDiv(Meteor.ui.render(function() {
      return '<input id="foo" type="text" value="' + R.get() + '">';
    }));
    var maybe_focus = function(div) {
      if (with_focus) {
        div.node().style.display = "block";
        div.node().firstChild.focus();
        div.node().firstChild.focus(); // IE 8 needs a second call!
        // focus() should set document.activeElement
        // (this one's on the browser to pass)
        test.equal(document.activeElement, div.node().firstChild);
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
    div = OnscreenDiv(Meteor.ui.render(function() {
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

Tinytest.add("liveui - bad labels", function(test) {
  // make sure patching behaves gracefully even when labels violate
  // the rules that would allow preservation of nodes identity.

  var go = function(html1, html2) {
    var R = ReactiveVar(true);
    var frag = WrappedFrag(Meteor.ui.render(function() {
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

Tinytest.add("liveui - chunks", function(test) {

  var inc = function(v) {
    v.set(v.get() + 1); };

  var R1 = ReactiveVar(0);
  var R2 = ReactiveVar(0);
  var R3 = ReactiveVar(0);
  var count1 = 0, count2 = 0, count3 = 0;

  var frag = WrappedFrag(Meteor.ui.render(function() {
    return R1.get() + "," + (count1++) + " " +
      Meteor.ui.chunk(function() {
        return R2.get() + "," + (count2++) + " " +
          Meteor.ui.chunk(function() {
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

  frag = WrappedFrag(Meteor.ui.render(function() {
    var buf = [];
    buf.push('<div class="foo', R1.get(), '">');
    buf.push(Meteor.ui.chunk(function() {
      var buf = [];
      for(var i=0; i<R2.get(); i++) {
        buf.push(Meteor.ui.chunk(function() {
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

  // calling chunk() outside of render mode
  test.equal(Meteor.ui.chunk(function() { return "foo"; }), "foo");

  // caller violating preconditions

  test.throws(function() {
    Meteor.ui.render(function() {
      return Meteor.ui.chunk("foo");
    });
  });

  test.throws(function() {
    Meteor.ui.render(function() {
      return Meteor.ui.chunk(function() {
        return {};
      });
    });
  });

});

Tinytest.add("liveui - repeated chunk", function(test) {
  test.throws(function() {
    var frag = Meteor.ui.render(function() {
      var x = Meteor.ui.chunk(function() {
        return "abc";
      });
      return x+x;
    });
  });
});

Tinytest.add("liveui - leaderboard", function(test) {
  // use a simplified, local leaderboard to test some stuff

  var players = new LocalCollection();
  var selected_player = ReactiveVar();

  var scores = OnscreenDiv(Meteor.ui.render(function() {
    return Meteor.ui.listChunk(
      players.find({}, {sort: {score: -1}}),
      function(player) {
        var style;
        if (selected_player.get() === player._id)
          style = "player selected";
        else
          style = "player";

        return '<div class="' + style + '">' +
          '<div class="name">' + player.name + '</div>' +
          '<div name="score">' + player.score + '</div></div>';
      }, null, {
        events: {
          "click": function () {
            selected_player.set(this._id);
          }
        }
      });
  }));

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
  simulateEvent(glinnesNameNode, 'click');
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

Tinytest.add("liveui - listChunk table", function(test) {
  var c = new LocalCollection();

  c.insert({value: "fudge", order: "A"});
  c.insert({value: "sundae", order: "B"});

  var R = ReactiveVar();

  var table = WrappedFrag(Meteor.ui.render(function() {
    var buf = [];
    buf.push('<table>');
    buf.push(Meteor.ui.listChunk(
      c.find({}, {sort: ['order']}),
      function(doc) {
        return "<tr><td>"+doc.value + (doc.reactive ? R.get() : '')+
          "</td></tr>";
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

Tinytest.add("liveui - listChunk event_data", function(test) {
  // this is based on a bug

  var lastClicked = null;
  var R = ReactiveVar(0);
  var later;
  var div = OnscreenDiv(Meteor.ui.render(function() {
    return Meteor.ui.listChunk(
      { observe: function(observer) {
        observer.added({_id: '1', name: 'Foo'}, 0);
        observer.added({_id: '2', name: 'Bar'}, 1);
        // exercise callback path
        later = function() {
          observer.added({_id: '3', name: 'Baz'}, 2);
          observer.added({_id: '4', name: 'Qux'}, 3);
        };
      }},
      function(doc) {
        R.get(); // depend on R
        return '<div>' + doc.name + '</div>';
      },
      { events:
        {
          'click': function (event) {
            lastClicked = this.name;
            R.set(R.get() + 1); // signal all dependers on R
          }
        }
      });
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
    simulateEvent(item(name), 'click');
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

Tinytest.add("liveui - events on preserved nodes", function(test) {
  var count = ReactiveVar(0);
  var demo = OnscreenDiv(Meteor.ui.render(function() {
    return '<div class="button_demo">'+
      '<input type="button" name="press" value="Press this button">'+
      '<div>The button has been pressed '+count.get()+' times.</div>'+
      '</div>';
  }, {events: {
    'click input': function() {
      count.set(count.get() + 1);
    }
  }}));

  var click = function() {
    simulateEvent(demo.node().getElementsByTagName('input')[0], 'click');
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

Tinytest.add("liveui - basic tag contents", function(test) {

  // adapted from nateps / metamorph

  var do_onscreen = function(f) {
    var div = OnscreenDiv();
    var stuff = {
      div: div,
      node: _.bind(div.node, div),
      render: function(rfunc) {
        div.node().appendChild(Meteor.ui.render(rfunc));
      }
    };

    f.call(stuff);

    div.kill();
  };

  var R, div;

  // basic text replace

  do_onscreen(function() {
    R = ReactiveVar("one two three");
    this.render(function() {
      return R.get();
    });
    R.set("three four five six");
    Meteor.flush();
    test.equal(this.div.html(), "three four five six");
  });

  // work inside a table

  do_onscreen(function() {
    R = ReactiveVar("<tr><td>HI!</td></tr>");
    this.render(function() {
      return "<table id='morphing'>" + R.get() + "</table>";
    });

    test.equal($(this.node()).find("#morphing td").text(), "HI!");
    R.set("<tr><td>BUH BYE!</td></tr>");
    Meteor.flush();
    test.equal($(this.node()).find("#morphing td").text(), "BUH BYE!");
  });

  // work inside a tbody

  do_onscreen(function() {
    R = ReactiveVar("<tr><td>HI!</td></tr>");
    this.render(function() {
      return "<table id='morphing'><tbody>" + R.get() + "</tbody></table>";
    });

    test.equal($(this.node()).find("#morphing td").text(), "HI!");
    R.set("<tr><td>BUH BYE!</td></tr>");
    Meteor.flush();
    test.equal($(this.node()).find("#morphing td").text(), "BUH BYE!");
  });

  // work inside a tr

  do_onscreen(function() {
    R = ReactiveVar("<td>HI!</td>");
    this.render(function() {
      return "<table id='morphing'><tr>" + R.get() + "</tr></table>";
    });

    test.equal($(this.node()).find("#morphing td").text(), "HI!");
    R.set("<td>BUH BYE!</td>");
    Meteor.flush();
    test.equal($(this.node()).find("#morphing td").text(), "BUH BYE!");
  });

  // work inside a ul

  do_onscreen(function() {
    R = ReactiveVar("<li>HI!</li>");
    this.render(function() {
      return "<ul id='morphing'>" + R.get() + "</ul>";
    });

    test.equal($(this.node()).find("#morphing li").text(), "HI!");
    R.set("<li>BUH BYE!</li>");
    Meteor.flush();
    test.equal($(this.node()).find("#morphing li").text(), "BUH BYE!");
  });

  // work inside a select

  do_onscreen(function() {
    R = ReactiveVar("<option>HI!</option>");
    this.render(function() {
      return "<select id='morphing'>" + R.get() + "</select>";
    });

    test.equal($(this.node()).find("#morphing option").text(), "HI!");
    R.set("<option>BUH BYE!</option>");
    Meteor.flush();
    test.equal($(this.node()).find("#morphing option").text(), "BUH BYE!");
  });

});


Tinytest.add("liveui - events", function(test) {
  var event_buf = [];
  var eventmap = function(/* arguments */) {
    var events = {};
    _.each(arguments, function(evt_sel) {
      events[evt_sel] = function() {
        event_buf.push(evt_sel);
      };
    });
    return events;
  };
  var getid = function(id) {
    return document.getElementById(id);
  };

  var div;

  // clicking on a div at top level
  event_buf.length = 0;
  div = OnscreenDiv(Meteor.ui.render(function() {
    return '<div id="foozy">Foo</div>';
  }, {events: eventmap("click")}));
  simulateEvent(getid("foozy"), 'click');
  test.equal(event_buf, ['click']);
  div.kill();
  Meteor.flush();

  // selector that specifies a top-level div
  // FAILS in 0.3.3
  event_buf.length = 0;
  div = OnscreenDiv(Meteor.ui.render(function() {
    return '<div id="foozy">Foo</div>';
  }, {events: eventmap("click div")}));
  simulateEvent(getid("foozy"), 'click');
  test.expect_fail();
  test.equal(event_buf, ['click div']);
  div.kill();
  Meteor.flush();

  // selector that specifies a second-level span
  event_buf.length = 0;
  div = OnscreenDiv(Meteor.ui.render(function() {
    return '<div id="foozy"><span>Foo</span></div>';
  }, {events: eventmap("click span")}));
  simulateEvent(getid("foozy").firstChild, 'click');
  test.equal(event_buf, ['click span']);
  div.kill();
  Meteor.flush();

  // replaced top-level elements still have event handlers
  // even if not replaced by the chunk wih the handlers
  // FAILS in 0.3.3
  var R = ReactiveVar("p");
  event_buf.length = 0;
  div = OnscreenDiv(Meteor.ui.render(function() {
    return Meteor.ui.chunk(function() {
      return '<'+R.get()+' id="foozy">Hello</'+R.get()+'>';
    });
  }, {events: eventmap("click")}));
  simulateEvent(getid("foozy"), 'click');
  test.equal(event_buf, ['click']);
  event_buf.length = 0;
  R.set("div"); // change tag, which is sure to replace element
  Meteor.flush();
  simulateEvent(getid("foozy"), 'click'); // still clickable?
  test.expect_fail();
  test.equal(event_buf, ['click']);
  event_buf.length = 0;
  R.set("p");
  Meteor.flush();
  simulateEvent(getid("foozy"), 'click');
  test.expect_fail();
  test.equal(event_buf, ['click']);
  event_buf.length = 0;

  div.kill();
  Meteor.flush();


});

Tinytest.add("liveui - cleanup", function(test) {

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

  var div = OnscreenDiv(Meteor.ui.render(function() {
    return Meteor.ui.listChunk(
      stuff.find(),
      function() { return R.get()+"1"; },
      function() { return R.get()+"0"; });
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

});


// TO TEST:
// - events
//   - attaching events in render, chunk, listChunk item, listChunk else

