if (Meteor.isClient) {

  Tinytest.add("blaze - view - callbacks", function (test) {
    var R = Blaze._ReactiveVar('foo');

    var buf = '';

    var v = Blaze.View(function () {
      return R.get();
    });

    v.onViewCreated(function () {
      buf += 'c' + v.renderCount;
    });
    v.onViewRendered(function () {
      buf += 'r' + v.renderCount;
    });
    v.onViewDestroyed(function () {
      buf += 'd' + v.renderCount;
    });

    test.equal(buf, '');

    var div = document.createElement("DIV");
    Blaze.insert(Blaze.render(v), div);
    test.equal(buf, 'c0r1');
    test.equal(canonicalizeHtml(div.innerHTML), "foo");

    R.set("bar");
    Deps.flush();
    test.equal(buf, 'c0r1r2');
    test.equal(canonicalizeHtml(div.innerHTML), "bar");

    Blaze.remove(v);
    test.equal(buf, 'c0r1r2d2');
    test.equal(canonicalizeHtml(div.innerHTML), "");
  });

}
