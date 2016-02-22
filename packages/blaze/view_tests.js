if (Meteor.isClient) {

  Tinytest.add("blaze - view - callbacks", function (test) {
    var R = ReactiveVar('foo');

    var buf = '';

    var v = Blaze.View(function () {
      return R.get();
    });

    v.onViewCreated(function () {
      buf += 'c' + v.renderCount;
    });
    v._onViewRendered(function () {
      buf += 'r' + v.renderCount;
    });
    v.onViewReady(function () {
      buf += 'y' + v.renderCount;
    });
    v.onViewDestroyed(function () {
      buf += 'd' + v.renderCount;
    });

    test.equal(buf, '');

    var div = document.createElement("DIV");
    test.isFalse(v.isRendered);
    test.isFalse(v._isAttached);
    test.equal(canonicalizeHtml(div.innerHTML), "");
    test.throws(function () { v.firstNode(); }, /View must be attached/);
    test.throws(function () { v.lastNode(); }, /View must be attached/);
    Blaze.render(v, div);
    test.equal(buf, 'c0r1');
    test.equal(typeof (v.firstNode().nodeType), "number");
    test.equal(typeof (v.lastNode().nodeType), "number");
    test.isTrue(v.isRendered);
    test.isTrue(v._isAttached);
    test.equal(buf, 'c0r1');
    test.equal(canonicalizeHtml(div.innerHTML), "foo");
    Tracker.flush();
    test.equal(buf, 'c0r1y1');

    R.set("bar");
    Tracker.flush();
    test.equal(buf, 'c0r1y1r2y2');
    test.equal(canonicalizeHtml(div.innerHTML), "bar");

    Blaze.remove(v);
    test.equal(buf, 'c0r1y1r2y2d2');
    test.equal(canonicalizeHtml(div.innerHTML), "");

    buf = "";
    R.set("baz");
    Tracker.flush();
    test.equal(buf, "");
  });

}
