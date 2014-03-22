
var DomRange = UI.DomRange;
var parseHTML = UI.DomBackend.parseHTML;

// fake component; DomRange host
var Comp = function (which) {
  this.which = which;
  this.dom = new DomRange;
  this.dom.component = this;
};

var isStartMarker = function (n) {
  return (n.$ui && n === n.$ui.start);
};

var isEndMarker = function (n) {
  return (n.$ui && n === n.$ui.end);
};

var inDocument = function (range, func) {
  var onscreen = document.createElement("DIV");
  onscreen.style.display = 'none';
  document.body.appendChild(onscreen);
  DomRange.insert(range, onscreen);
  try {
    func(range);
  } finally {
    document.body.removeChild(onscreen);
  }
};

var htmlRange = function (html) {
  var r = new DomRange;
  _.each(parseHTML(html), function (node) {
    r.add(node);
  });
  return r;
};

Tinytest.add("ui - DomRange - basic", function (test) {
  var r = new DomRange;
  r.which = 'R';

  // `r.start` and `r.end` -- accessed via
  // `r.startNode() and `r.endNode()` -- are adjacent empty
  // text nodes used as markers.  They are initially created
  // in a DocumentFragment or other offscreen container.
  // At all times, the members of a DomRange have the same
  // parent element (`r.parentNode()`), though this element
  // may change (typically just once when the DomRange is
  // first put into the DOM).
  var rStart = r.startNode();
  var rEnd = r.endNode();

  test.isTrue(isStartMarker(rStart));
  test.isTrue(isEndMarker(rEnd));
  test.equal(rStart.nextSibling, rEnd);
  test.isTrue(rStart.parentNode);
  test.equal(r.parentNode(), rStart.parentNode);

  test.equal(typeof r.members, 'object');
  test.equal(_.keys(r.members).length, 0);

  test.equal(rStart.$ui, r);
  test.equal(rEnd.$ui, r);

  // add a node
  var div = document.createElement("DIV");
  r.add(div);

  test.equal(_.keys(r.members).length, 1);
  test.equal(div.previousSibling, rStart);
  test.equal(div.nextSibling, rEnd);
  test.equal(div.$ui, r);

  // add a subrange
  var s = new DomRange;
  s.which = 'S';
  var span = document.createElement("SPAN");
  s.add(span);
  r.add(s);
  test.equal(_.keys(r.members).length, 2);
  test.isFalse(r.owner);
  test.equal(s.owner, r);

  // DOM should go: rStart, DIV, sStart, SPAN, sEnd, rEnd.
  test.equal(span.previousSibling, s.startNode());
  test.equal(span.nextSibling, s.endNode());
  test.equal(span.nextSibling.nextSibling, rEnd);
  test.equal(span.previousSibling.previousSibling,
             div);
  test.equal(span.$ui, s);

  // eachMember
  var buf = [];
  r.eachMember(function (node) {
    buf.push(node.nodeName);
  }, function (range) {
    buf.push('range ' + range.which);
  });
  buf.sort();
  test.equal(buf, ['DIV', 'range S']);

  // removal
  s.remove();
  test.isFalse(s.owner);
  // sStart, SPAN, sEnd are gone from the DOM.
  test.equal(rStart.nextSibling, div);
  test.equal(rEnd.previousSibling, div);
  // `r` still has two members
  test.equal(_.keys(r.members).length, 2);
  // until we refresh
  r.refresh();
  test.equal(_.keys(r.members).length, 1);
  // remove all
  r.removeAll();
  test.equal(rStart.nextSibling, rEnd);
  test.equal(_.keys(r.members).length, 0);
});

Tinytest.add("ui - DomRange - shuffling", function (test) {
  var r = new DomRange;

  var B = document.createElement("B");
  var I = document.createElement("I");
  var U = document.createElement("U");

  r.add('B', B);
  r.add('I', I);
  r.add('U', U);

  var spellDom = function () {
    var frag = r.parentNode();
    var str = '';
    _.each(frag.childNodes, function (n) {
      if (n.nodeType === 3 || isStartMarker(n) ||
          isEndMarker(n)) {
        if (isStartMarker(n))
          str += '(';
        else if (isEndMarker(n))
          str += ')';
        else
          str += '-';
      } else {
        if (n.$ui.component && n.$ui.component.which)
          str += n.$ui.component.which;
        else
          str += (n.nodeName || '?');
      }
    });
    return str;
  };

  test.equal(spellDom(), '(BIU)');
  r.moveBefore('B');
  test.equal(spellDom(), '(IUB)');
  r.moveBefore('I', 'U');
  test.equal(spellDom(), '(IUB)');
  r.moveBefore('I', 'B');
  test.equal(spellDom(), '(UIB)');
  r.moveBefore('B', 'U');
  test.equal(spellDom(), '(BUI)');
  r.moveBefore('U', null);
  test.equal(spellDom(), '(BIU)');

  test.equal(B.$ui, r);

  // add some member rangers, with host objects
  var X = new Comp('X');
  var Y = new Comp('Y');
  var Z = new Comp('Z');
  r.add('X', X.dom, 'I');
  X.dom.add(document.createElement("SPAN"));
  Y.dom.add(document.createElement("SPAN"));
  Z.dom.add(document.createElement("SPAN"));
  r.add('Y', Y.dom, 'U');
  r.add('Z', Z.dom);

  test.equal(spellDom(), '(B(X)I(Y)U(Z))');

  r.add([document.createElement('A'),
         document.createElement('A')], 'X');

  test.equal(spellDom(), '(BAA(X)I(Y)U(Z))');

  r.moveBefore('I', 'X');
  r.moveBefore('X', 'B');
  r.moveBefore('Z', 'U');
  r.moveBefore('U', 'Y');
  test.equal(spellDom(), '((X)BAAIU(Y)(Z))');


  r.moveBefore('Z', 'X');
  r.moveBefore('Y', 'X');
  test.equal(spellDom(), '((Z)(Y)(X)BAAIU)');

  test.isTrue(r.get('X') === X.dom);
  test.isTrue(r.get('Y') === Y.dom);
  test.isTrue(r.get('Z') === Z.dom);
  test.isTrue(r.get('B') === B);
  test.isTrue(r.get('I') === I);
  test.isTrue(r.get('U') === U);

  test.isFalse(r.owner);
  test.isTrue(X.dom.owner === r);
  test.isTrue(Y.dom.owner === r);
  test.isTrue(Z.dom.owner === r);

  r.remove('Y');
  test.equal(spellDom(), '((Z)(X)BAAIU)');
  test.equal(r.get('Y'), null);

  r.remove('X');
  test.equal(spellDom(), '((Z)BAAIU)');

  r.removeAll();
  test.equal(spellDom(), '()');
});

Tinytest.add("ui - DomRange - nested", function (test) {
  var r = new DomRange;

  var spellDom = function () {
    var frag = r.parentNode();
    var str = '';
    _.each(frag.childNodes, function (n) {
      var ui = n.$ui;
      if (isStartMarker(n))
        str += (ui.component ? ui.component.which : '(');
      else if (isEndMarker(n))
        str += (ui.component ? ui.component.which.toLowerCase() : ')');
      else
        str += '?';
    });
    return str;
  };

  // nest empty ranges; should work even though
  // there are no element nodes
  var A,B,C,D,E,F;

  test.equal(spellDom(), '()');
  r.add((A = new Comp('A')).dom);
  test.equal(spellDom(), '(Aa)');
  r.add('B', (B = new Comp('B')).dom);
  r.add('C', (C = new Comp('C')).dom, 'B');
  test.equal(spellDom(), '(AaCcBb)');

  r.get('B').add('D', (D = new Comp('D')).dom);
  D.dom.add('E', (E = new Comp('E')).dom);
  test.equal(spellDom(), '(AaCcBDEedb)');
  B.dom.add('F', (F = new Comp('F')).dom);
  test.equal(spellDom(), '(AaCcBDEedFfb)');

  r.moveBefore('B', 'C');
  test.equal(spellDom(), '(AaBDEedFfbCc)');
  B.dom.moveBefore('D', null);
  test.equal(spellDom(), '(AaBFfDEedbCc)');
  r.moveBefore('C', 'B');
  test.equal(spellDom(), '(AaCcBFfDEedb)');
  D.dom.remove('E');
  test.equal(spellDom(), '(AaCcBFfDdb)');
  r.remove('B');
  test.equal(spellDom(), '(AaCc)');

  test.isFalse(r.owner);
  test.equal(A.dom.owner, r);
  test.equal(C.dom.owner, r);
});

Tinytest.add("ui - DomRange - external moves", function (test) {
  // In this one, uppercase letters are div elements,
  // lowercase letters are marker text nodes, as follows:
  //
  // a-X-b - c-d-Y-Z-e-f - g-h-i-W-j-k-l V
  //
  // In other words, one DomRange containing an element (X),
  // then two nested DomRanges containing two elements (Y,Z),
  // etc.

  var wsp = function () {
    return document.createTextNode(' ');
  };

  var X = document.createElement("DIV");
  X.id = 'X';
  var Y = document.createElement("DIV");
  Y.id = 'Y';
  var Z = document.createElement("DIV");
  Z.id = 'Z';
  var W = document.createElement("DIV");
  W.id = 'W';
  var V = document.createElement("DIV");
  V.id = 'V';

  var ab = new Comp('ab');
  ab.dom.add(wsp());
  ab.dom.add('X', X);
  ab.dom.add(wsp());
  var cf = new Comp('cf');
  var de = new Comp('de');
  de.dom.add(wsp());
  de.dom.add('Y', Y);
  de.dom.add(wsp());
  de.dom.add('Z', Z);
  de.dom.add(wsp());
  cf.dom.add(wsp());
  cf.dom.add('de', de.dom);
  cf.dom.add(wsp());
  var gl = new Comp('gl');
  var hk = new Comp('hk');
  var ij = new Comp('ij');
  ij.dom.add(wsp());
  ij.dom.add('W', W);
  ij.dom.add(wsp());
  // i-W-j
  test.equal(ij.dom.getNodes().length, 5);
  gl.dom.add(wsp());
  gl.dom.add('hk', hk.dom);
  gl.dom.add(wsp());
  // g-hk-l
  test.equal(gl.dom.getNodes().length, 6);
  hk.dom.add(wsp());
  hk.dom.add('ij', ij.dom);
  hk.dom.add(wsp());
  // h-i-W-j-k
  test.equal(hk.dom.getNodes().length, 9);
  // g-h-i-W-j-k-l
  test.equal(gl.dom.getNodes().length, 13);

  var r = new DomRange;
  r.add('ab', ab.dom);
  r.add(wsp());
  r.add('cf', cf.dom);
  r.add(wsp());
  r.add('gl', gl.dom);
  r.add('V', V);

  var spellDom = function () {
    var frag = r.parentNode();
    var str = '';
    _.each(frag.childNodes, function (n) {
      var ui = n.$ui;
      if (isStartMarker(n))
        str += (ui.component ? ui.component.which.charAt(0) : '(');
      else if (isEndMarker(n))
        str += (ui.component ? ui.component.which.charAt(1) : ')');
      else if (n.nodeType === 3)
        str += '-';
      else
        str += (n.id || '?');
    });
    return str;
  };
  var strip = function (str) {
    return str.replace(/[^-\w()]+/g, '');
  };

  test.equal(spellDom(),
             strip('(a-X-b - c-d-Y-Z-e-f - g-h-i-W-j-k-l V)'));

  test.isTrue(ab.dom.owner === r);
  test.isTrue(cf.dom.owner === r);
  test.isTrue(de.dom.owner === cf.dom);
  test.isTrue(gl.dom.owner === r);
  test.isTrue(hk.dom.owner === gl.dom);
  test.isTrue(ij.dom.owner === hk.dom);

  // all right, now let's mess around with these elements!

  $([Y,Z]).insertBefore(X);

  // jQuery lifted Y,Z right out and stuck them before X
  test.equal(spellDom(),
             strip('(a-YZX-b - c-d---e-f - g-h-i-W-j-k-l V)'));

  r.moveBefore('cf', 'ab');

  // the move causes a refresh of `ab` and `cf` and their
  // descendent members, re-establishing proper organization
  // (ignoring whitespace textnodes)
  test.equal(spellDom(),
             strip('(- cdYZef aX-b ------- g-h-i-W-j-k-l V)'));

  $(W).insertBefore(X);

  test.equal(spellDom(),
             strip('(- cdYZef aWX-b ------- g-h-i--j-k-l V)'));

  $(Z).insertBefore(W);

  test.equal(spellDom(),
             strip('(- cdYef aZWX-b ------- g-h-i--j-k-l V)'));

  r.moveBefore('ab', 'cf');

  // WOW!  `ab` and `cf` have been fixed.  Here's what
  // happened:
  // - Because `cf` is serving as an insertion point, it
  //   is refreshed first, and it recursively refreshes
  //   `de`.  This causes `e` and then `f` to move to the
  //   right of `Z`.  There's still `a` floating in the middle.
  // - Then `ab` is refreshed.  This moves `a` to right before
  //   `X`.
  // - Finally, `aX-b` is moved before `c`.
  test.equal(spellDom(),
             strip('(- aX-b cdYZef W ------- g-h-i--j-k-l V)'));

  r.moveBefore('ab', 'gl');

  // Because `gl` is being used as a reference point,
  // it is refreshed to contain `W`.
  // Because the `-` that was initial came from `ab`,
  // it is recaptured.
  test.equal(spellDom(),
             strip('(cdYZef a-X-b ghiWjkl ------------- V)'));

  $(Z).insertBefore(X);

  test.equal(spellDom(),
             strip('(cdYef a-ZX-b ghiWjkl ------------- V)'));

  r.moveBefore('gl', 'cf');

  // Note that the `a` is still misplaced here.
  test.equal(spellDom(),
             strip('(ghiWjkl cdY a-ZefX-b ------------- V)'));

  r.moveBefore('cf', 'V');

  test.equal(spellDom(),
             strip('(ghiWjkl X-b ------------- cdY a-Zef V)'));


  $(X).insertBefore(Y);

  // holy crap, now `aXb` is a mess.  Really `a` and `b`
  // are in the completely wrong place.
  test.equal(spellDom(),
             strip('(ghiWjkl -b ------------- cdXY a-Zef V)'));

  r.moveBefore('gl', 'ab');

  // Now `c` and `d` are wrong.  It looks like `cdYZef`
  // also includes `W` and `X`.
  test.equal(spellDom(),
             strip('(-------------- cd ghiWjkl aXbY-Zef V)'));

  // However, remove `cf` will do a refresh first.
  r.remove('cf');

  test.equal(spellDom(),
             strip('(-------------- ghiWjkl aXb V)'));

  $(X).insertBefore(W);
  r.parentNode().appendChild(W);

  test.equal(spellDom(),
             strip('(-------------- ghiXjkl ab V) W'));

  r.moveBefore('ab', 'gl');


  test.equal(spellDom(),
             strip('(-------------- V) aXb ghiWjkl'));

  r.remove('V');

  test.equal(spellDom(),
             strip('(--------------) aXb ghiWjkl'));


  // Manual refresh is required for move-to-end
  // (or add-at-end) if elements may have moved externally,
  // because the `end` pointer could be totally wrong.
  // Otherwise, the order of `ab` and `gl` would swap,
  // meaning the DomRange operations would do something
  // different from the jQuery operations.
  //
  // See `range.getInsertionPoint`.

  // Same as `r.refresh()` but tests
  // the convenience function `DomRange.refresh(element)`:
  DomRange.refresh(r.parentNode());

  r.moveBefore('gl', null);

  test.equal(spellDom(),
             strip('-------------- (aXb ghiWjkl)'));
});

Tinytest.add("ui - DomRange - tables", function (test) {
  var range = function (x) {
    // create a range x.dom containing an element x.el,
    // inside that element, the range x.content.dom
    x.dom = new DomRange;
    if (x.el) {
      x.dom.add(x.el);
      if (x.content)
        DomRange.insert(x.content.dom, x.el);
    }
    return x;
  };
  var tr, td;
  var table = range({
    el: document.createElement('table'),
    content: tr = range({
      el: document.createElement('tr'),
      content: td = range({
        el: document.createElement('td')
      })
    })
  });

  // TBODY got inserted automatically.
  // This tests DomRange.insert.
  test.equal(table.el.childNodes.length, 1);
  test.equal(table.el.firstChild.nodeName, 'TBODY');
  // TBODY contains [start, TR, end]
  test.equal(table.el.firstChild.childNodes.length, 3);
  test.equal(table.el.firstChild.childNodes[1], tr.el);
  test.equal(tr.el.childNodes.length, 3);
  test.equal(tr.el.childNodes[1], td.el);

  // start over
  $(table.el).empty();
  test.equal(table.el.childNodes.length, 0);

  table.content = range({});
  DomRange.insert(table.content.dom, table.el);
  // table has two children (start/end markers), no elements
  test.equal(table.el.childNodes.length, 2);
  test.notEqual(table.el.firstChild.nodeType, 1);
  test.notEqual(table.el.lastChild.nodeType, 1);

  // shazam, adding a TR should move the whole range
  // into a TBODY.  This tests range.add(node).
  table.content.dom.add(document.createElement('tr'));

  test.equal(table.el.childNodes.length, 1);
  test.equal(table.el.firstChild.nodeName, 'TBODY');
  test.equal(table.el.firstChild.childNodes.length, 3);
  test.equal(table.el.firstChild.childNodes[1].nodeName, 'TR');

  // start over.
  $(table.el).empty();
  test.equal(table.el.childNodes.length, 0);

  table.content = range({});
  DomRange.insert(table.content.dom, table.el);
  var a1 = range({});
  var a2 = range({});
  a1.dom.add(a2.dom);
  table.content.dom.add(a1.dom);
  // 6 marker nodes in table, no elements
  test.equal(table.el.childNodes.length, 6);
  test.equal($(table.el).find("*").length, 0);
  // shazam, adding a TR to the innermost range
  // should move all the ranges into a TBODY.
  a2.dom.add(document.createElement('tr'));
  test.equal(table.el.childNodes.length, 1);
  test.equal(table.el.firstChild.nodeName, 'TBODY');
  test.equal(table.el.firstChild.childNodes.length, 7);
  test.equal(table.el.firstChild.childNodes[3].nodeName, 'TR');

  // start over.  this time test adding a range containing
  // a TR.
  $(table.el).empty();
  test.equal(table.el.childNodes.length, 0);

  table.content = range({});
  DomRange.insert(table.content.dom, table.el);
  var b1 = range({});
  var b2 = range({});
  table.content.dom.add(b1.dom);
  b2.dom.add(document.createElement('tr'));
  // 4 marker nodes in table, no elements
  test.equal(table.el.childNodes.length, 4);
  test.equal($(table.el).find("*").length, 0);
  // shazam, adding b2, which contains a TR,
  // should move all the ranges into a TBODY.
  b1.dom.add(b2.dom);
  test.equal(table.el.childNodes.length, 1);
  test.equal(table.el.firstChild.nodeName, 'TBODY');
  test.equal(table.el.firstChild.childNodes.length, 7);
  test.equal(table.el.firstChild.childNodes[3].nodeName, 'TR');

  test.equal(b2.dom.parentNode().nodeName, 'TBODY');
  test.equal(b1.dom.parentNode().nodeName, 'TBODY');
  test.equal(table.content.dom.parentNode().nodeName, 'TBODY');


  // start over.  now test two TR ranges.
  $(table.el).empty();
  test.equal(table.el.childNodes.length, 0);

  var c1 = range({});
  var c2 = range({});
  DomRange.insert(c1.dom, table.el);
  DomRange.insert(c2.dom, table.el);
  test.equal(table.el.childNodes.length, 4);
  test.equal($(table.el).find("*").length, 0);
  c2.dom.add(document.createElement('tr'));
  test.equal(table.el.childNodes.length, 3);
  test.equal($(table.el).find("> *").length, 1);
  test.equal($(table.el).find("> tbody").length, 1);
  c1.dom.add(document.createElement('tr'));
  // now there should be a single TBODY with two
  // ranges in it containing TRs
  test.equal(table.el.childNodes.length, 1);
  test.equal(table.el.firstChild.nodeName, 'TBODY');
  var tbody = table.el.firstChild;
  test.equal(tbody.childNodes.length, 6);
  test.equal($(tbody).find("> *").length, 2); // 2 elements
  test.equal(tbody.childNodes[1].nodeName, 'TR');
  test.equal(tbody.childNodes[4].nodeName, 'TR');
});

Tinytest.add("ui - DomRange - basic events", function (test) {
  // test.equal doesn't work on arrays of DOM nodes, so
  // we need this.  It's `===` that descends recursively
  // into any arrays.
  var arrayEqual = function (a, b) {
    test.equal(_.isArray(a), _.isArray(b));
    if (_.isArray(a)) {
      test.equal(a.length, b.length);
      for (var i = 0; i < a.length; i++) {
        arrayEqual(a[i], b[i]);
      }
    } else {
      test.isTrue(a[i] === b[i]);
    }
  };

  var q = new DomRange;
  test.throws(function () {
    // can't bind events before DomRange is added to
    // the DOM
    q.on('click', function (evt) {});
  });

  inDocument(
    htmlRange("<span>Foo</span>"),
    function (r) {
      var buf = [];

      r.on('click', 'span', function (evt) {
        buf.push([evt.type, evt.target, evt.currentTarget]);
      });

      arrayEqual(buf, []);
      var span = r.elements()[0];
      clickElement(span);
      arrayEqual(buf, [['click', span, span]]);
    });

  inDocument(
    htmlRange("<div><span>Foo</span></div>"),
    function (r) {
      var buf = [];

      // test click with no selector; should only
      // fire on the event target.
      r.on('click', function (evt) {
        buf.push([evt.type, evt.target, evt.currentTarget]);
      });

      arrayEqual(buf, []);
      var span = r.$('span')[0];
      clickElement(span);
      arrayEqual(buf, [['click', span, span]]);
    });

  inDocument(
    htmlRange('<div id="yeah"><span>Foo</span></div>' +
              '<div id="no">Bar</div>'),
    function (r) {
      var buf = [];

      // test click on particular div, which is
      // not the target or the bound element
      r.on('click', '#yeah', function (evt) {
        buf.push([evt.type, evt.target, evt.currentTarget]);
      });

      arrayEqual(buf, []);
      clickElement(r.$('#no')[0]);
      arrayEqual(buf, []);
      var yeah = r.$('#yeah')[0];
      clickElement(yeah);
      arrayEqual(buf, [['click', yeah, yeah]]);
    });

  inDocument(
    new DomRange,
    function (r) {
      var s;
      r.add(s = htmlRange('<div id="one"></div>'));
      r.add(htmlRange('<div id="two"></div>'));
      var one = r.$('#one')[0];
      var two = r.$('#two')[0];

      var buf = [];

      // test that click must be in range to fire
      // event handler
      s.on('click', 'div', function (evt) {
        buf.push([evt.type, evt.target, evt.currentTarget]);
      });

      arrayEqual(buf, []);
      clickElement(two);
      arrayEqual(buf, []);
      clickElement(one);
      arrayEqual(buf, [['click', one, one]]);
    });

});

Tinytest.add("ui - DomRange - contains", function (test) {
  inDocument(new DomRange, function (r) {
    var s = htmlRange('<div id="one"><span>Foo</span></div>');
    var t = new DomRange;
    t.add(s);
    r.add(t);
    r.add(htmlRange('<div id="two"></div>'));
    var one = r.$('#one')[0];
    var two = r.$('#two')[0];
    var span = r.$('span')[0];

    test.isFalse(r.contains(r));
    test.isTrue(r.contains(s));
    test.isTrue(r.contains(t));
    test.isTrue(r.contains(one));
    test.isTrue(s.contains(one));
    test.isTrue(t.contains(one));
    test.isTrue(r.contains(two));
    test.isFalse(s.contains(two));
    test.isFalse(t.contains(two));
    test.isTrue(r.contains(span));
    test.isTrue(s.contains(span));
    test.isTrue(t.contains(span));
    test.isFalse(r.contains(r.parentNode()));
    test.isFalse(r.contains(document.createElement("DIV")));
  });
});

Tinytest.add("ui - DomRange - constructor", function (test) {
  var r = new DomRange;

  test.isTrue(r.parentNode());

  test.isTrue(r.start.$ui === r);
  test.isTrue(r.end.$ui === r);

  var div = document.createElement('div');
  r.add(div);
  test.isTrue(div.$ui === r);
});

Tinytest.add("ui - DomRange - get", function (test) {
  var r = new DomRange;
  var a = document.createElement('div');
  var b = document.createElement('div');
  var c = document.createElement('div');
  var d = document.createElement('div');

  r.add(a);
  r.add(null, b);
  r.add('c', c);
  test.throws(function () {
    r.add(0, d);
  });
  test.throws(function () {
    r.add(1, d);
  });
  test.throws(function () {
    r.add('', d);
  });

  test.isTrue(r.get('toString') === null);
  test.isTrue(r.get('__proto__') === null);
  test.isTrue(r.get('_proto__') === null);
  test.isTrue(r.get('blahblah') === null);
  r.add('toString', d);

  test.throws(function () {
    r.get('');
  });
  test.throws(function () {
    r.get(null);
  });
  test.throws(function () {
    r.get(1);
  });

  test.equal(r.elements().length, 4);

  test.isTrue(r.get('c') === c);
  test.isTrue(r.get('toString') === d);
});

// This test targets IE 9 and 10, which allow properties
// to be attached to TextNodes but may lose them over time.
// Specifically, the JavaScript view of a TextNode seems to
// be only weakly retained by the TextNode itself, so if you
// hang an object graph off a TextNode, you need some other
// pointer to the TextNode or an object in the graph to
// retain it.
Tinytest.addAsync("ui - DomRange - IE TextNode GC", function (test, onComplete) {
  var r = new DomRange;
  var B = document.createElement('B');
  B.id = 'ie_textnode_gc_test';
  document.body.appendChild(B);
  DomRange.insert(r, B);
  r = null;
  B = null;

  // trigger GC...
  if (typeof CollectGarbage === 'function')
    CollectGarbage();

  // come back later...
  window.setTimeout(function () {
    var B = document.getElementById("ie_textnode_gc_test");
    test.isTrue(B.firstChild.$ui);
    test.isTrue(B.lastChild.$ui);
    window.BBB = B;
    document.body.removeChild(B);
    onComplete();
  }, 500);
});

Tinytest.add("ui - DomRange - more TBODY", function (test) {
  inDocument(htmlRange("<table></table>"), function (r) {
    var table = r.elements()[0];
    var tableContent = new DomRange;
    var buf = [];
    DomRange.insert(tableContent, table);
    var trRange = htmlRange("<tr><td>Hello</td></tr>");
    tableContent.add(trRange);
    test.isTrue(tableContent.contains(trRange));
  });

  inDocument(htmlRange("<table></table>"), function (r) {
    var table = r.elements()[0];
    var tableContent = new DomRange;
    var buf = [];
    DomRange.insert(tableContent, table);
    var trRange = htmlRange("<tr><td>Hello</td></tr>");
    var tr = trRange.elements()[0];
    tableContent.add('tr', tr);
    test.equal(_.keys(tableContent.members).length, 1);
    test.isTrue(tableContent.contains(tr));
    tableContent.remove('tr');
    // bizarrely, in IE 8, the `tr` still has some
    // DocumentFragment as its parent even though `removeChild`
    // has been called on it directly.
    test.isFalse(tr.parentNode && tr.parentNode.nodeType === 1);
  });
});

Tinytest.add("ui - DomRange - events in tables", function (test) {
  inDocument(htmlRange("<table></table>"), function (r) {
    var table = r.elements()[0];
    var tableContent = new DomRange;
    var buf = [];
    DomRange.insert(tableContent, table);
    tableContent.on('click', 'tr', function (evt) {
      buf.push('click ' + evt.currentTarget.nodeName);
    });
    var trRange = htmlRange("<tr><td>Hello</td></tr>");
    tableContent.add(trRange);
    var tr = trRange.elements()[0];
    test.equal(buf, []);
    clickElement(tr);
    test.equal(buf, ['click TR']);
    // XXX test something that would break if the event data
    // is on the TABLE rather than the TBODY (the new
    // parentNode of `tableContent`).
  });
});

Tinytest.add("ui - DomRange - nested event order", function (test) {
  inDocument(new DomRange, function (r) {
    var a = new DomRange;
    var b = new DomRange;
    var c = new DomRange;
    var d = new DomRange;
    r.add(a);
    a.add(b);
    b.add(c);
    c.add(d);
    var div = document.createElement("DIV");
    d.add(div);

    var buf = [];
    var appender = function (str) {
      return function (evt) {
        buf.push(str);
      };
    };

    b.on('click', 'div', appender("B"));
    a.on('click', 'div', appender("A"));
    d.on('click', appender("D"));
    c.on('click', 'div', appender("C"));
    test.equal(buf, []);
    clickElement(div);
    test.equal(buf, ['D', 'C', 'B', 'A']);
    buf.length = 0;

    b.on('click', appender("B2"));
    d.on('click', 'div', appender("D2"));
    clickElement(div);
    test.equal(buf, ['D', 'D2', 'C', 'B', 'B2', 'A']);
  });
});

Tinytest.add("ui - DomRange - isParented", function (test) {
  inDocument(new DomRange, function (r) {
    test.equal(r.isParented, true);
    var a = new DomRange;
    var b = new DomRange;
    var c = new DomRange;
    var d = new DomRange;
    var e = new DomRange;
    var abcde = function (ap, bp, cp, dp, ep) {
      test.equal(!! a.isParented, !! ap);
      test.equal(!! b.isParented, !! bp);
      test.equal(!! c.isParented, !! cp);
      test.equal(!! d.isParented, !! dp);
      test.equal(!! e.isParented, !! ep);
    };
    var div = document.createElement("DIV");
    c.add(div);
    abcde(0, 0, 0, 0, 0);
    d.add(e);
    abcde(0, 0, 0, 0, 0);
    DomRange.insert(d, div);
    abcde(0, 0, 0, 1, 1);
    a.add(b);
    abcde(0, 0, 0, 1, 1);
    r.add(a);
    abcde(1, 1, 0, 1, 1);
    b.add(c);
    abcde(1, 1, 1, 1, 1);

    var container = r.parentNode();
    test.equal(_.keys(container.$_uiranges).length, 1);
    test.equal(_.keys(div.$_uiranges).length, 1);
    d.remove();
    test.equal(_.keys(div.$_uiranges).length, 0);
    r.remove();
    test.equal(_.keys(container.$_uiranges).length, 0);
  });
});

Tinytest.add("ui - DomRange - structural removal", function (test) {
  inDocument(new DomRange, function (r) {
    var a = new DomRange;
    test.isFalse(a.isRemoved);
    r.add('a', a);
    test.isFalse(a.isRemoved);
    r.remove('a');
    test.isTrue(a.isRemoved);


    var b = new DomRange;
    test.isFalse(b.isRemoved);
    r.add(b);
    test.isFalse(b.isRemoved);
    r.removeAll();
    test.isTrue(b.isRemoved);


    var c = new DomRange;
    var d = new DomRange;
    var e = new DomRange;
    c.add(d);
    d.add(e);
    r.add('c', c);
    test.isFalse(c.isRemoved);
    test.isFalse(d.isRemoved);
    test.isFalse(e.isRemoved);
    r.remove('c');
    test.isTrue(c.isRemoved);
    test.isTrue(d.isRemoved);
    test.isTrue(e.isRemoved);


    for (var scenario = 0; scenario < 2; scenario++) {
      var f = new DomRange;
      var g = document.createElement("DIV");
      var h = new DomRange;
      var i = document.createElement("DIV");
      var j = document.createElement("DIV");
      var k = new DomRange;
      r.add('f', f);
      f.add(g);
      DomRange.insert(h, g);
      h.add(i);
      DomRange.insert(k, j);
      i.appendChild(j);
      test.isFalse(f.isRemoved);
      test.isFalse(h.isRemoved);
      test.isFalse(k.isRemoved);
      if (scenario === 0)
        r.removeAll();
      else if (scenario === 1)
        r.remove('f');
      test.isTrue(f.isRemoved);
      test.isTrue(h.isRemoved);
      test.isTrue(k.isRemoved);

      r.removeAll();
    }
  });
});

Tinytest.add("ui - DomRange - noticed removal", function (test) {
  // TODO
  //
  // e.g. noticed via `eachMember` or `add`
});

Tinytest.add("ui - DomRange - jQuery removal", function (test) {
  inDocument(htmlRange("<div></div>"), function (r) {
    for (var scenario = 0; scenario < 3; scenario++) {
      var f = document.createElement("DIV");
      var g = document.createElement("DIV");
      var h = new DomRange;
      var i = document.createElement("DIV");
      var j = document.createElement("DIV");
      var k = new DomRange;
      r.add(f);
      f.appendChild(g);
      DomRange.insert(h, g);
      h.add(i);
      DomRange.insert(k, j);
      i.appendChild(j);
      test.isFalse(h.isRemoved);
      test.isFalse(k.isRemoved);

      $(g).removeData();
      test.isFalse(h.isRemoved);
      test.isFalse(k.isRemoved);

      if (scenario === 0)
        $(g).remove();
      else if (scenario === 1)
        $(f).empty();
      else if (scenario === 2)
        $(f).html("<br>");
      else if (scenario === 3)
        $(g).detach();

      if (scenario !== 3) {
        test.isTrue(h.isRemoved);
        test.isTrue(k.isRemoved);
      } else {
        // `detach` doesn't remove
        test.isFalse(h.isRemoved);
        test.isFalse(k.isRemoved);
      }

      r.removeAll();
    }
  });
});

// TO TEST STILL:
// - external remove element
// - double-add, double-remove
// - external entire remove
// - element adoption during move/remove/refresh
// - first arg of add must be string, errors on `0` for example.
//   same with remove and move `id` arguments.
// - can't add multiple members with id, but can add array of 1.
//   can add 0 with no id.
// - add a node or range with the same id as an old member
//   works if that member is gone.
// - events (and other stuff) get moved when wrapping in TBODY
// - event unbinding
// - "noticed" removal due to `eachMembers`, `add`, etc.
