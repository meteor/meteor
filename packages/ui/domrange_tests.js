
var DomRange = UI.DomRange;

// fake component; DomRange host
var Comp = function (which) {
  this.which = which;

  new DomRange(this);
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

  test.equal(rStart.nodeType, 3);
  test.equal(rEnd.nodeType, 3);
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
  test.equal(div.$ui.dom, r);

  // add a subrange
  var s = new DomRange;
  s.which = 'S';
  var span = document.createElement("SPAN");
  s.add(span);
  r.add(s);
  test.equal(_.keys(r.members).length, 2);

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
      if (n.nodeType === 3) {
        if (n.$ui && n.$ui.dom.start === n)
          str += '(';
        else if (n.$ui && n.$ui.dom.end === n)
          str += ')';
        else
          str += '-';
      } else {
        if (n.$ui.which)
          str += n.$ui.which;
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
  r.add('X', X, 'I');
  X.dom.add(document.createElement("SPAN"));
  Y.dom.add(document.createElement("SPAN"));
  Z.dom.add(document.createElement("SPAN"));
  r.add('Y', Y, 'U');
  r.add('Z', Z);

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

  test.equal(r.get('X'), X);
  test.equal(r.get('Y'), Y);
  test.equal(r.get('Z'), Z);
  test.equal(r.get('B'), B);
  test.equal(r.get('I'), I);
  test.equal(r.get('U'), U);

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
      if (n.nodeType === 3 && n.$ui) {
        var ui = n.$ui;
        if (ui.dom.start === n)
          str += (ui.which ? ui.which : '(');
        else if (n.$ui && n.$ui.dom.end === n)
          str += (ui.which ? ui.which.toLowerCase() : ')');
        else
          str += '?';
      } else {
        str += '?';
      }
    });
    return str;
  };

  // nest empty ranges; should work even though
  // there are no element nodes
  var A,B,C,D,E,F,G;

  test.equal(spellDom(), '()');
  r.add(A = new Comp('A'));
  test.equal(spellDom(), '(Aa)');
  r.add('B', B = new Comp('B'));
  r.add('C', C = new Comp('C'), 'B');
  test.equal(spellDom(), '(AaCcBb)');

  r.get('B').dom.add('D', D = new Comp('D'));
  D.dom.add('E', new Comp('E'));
  test.equal(spellDom(), '(AaCcBDEedb)');
  B.dom.add('F', F = new Comp('F'));
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
});