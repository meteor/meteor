if (Meteor.isClient) {

  Tinytest.add("blaze - view - callbacks", function (test) {
    var R = Blaze._ReactiveVar('foo');

    var buf = '';

    var v = Blaze.View(function () {
      return R.get();
    });

    v.onViewCreated(function () {
      buf += 'c';
    });
    v.onViewDestroyed(function () {
      buf += 'd';
    });

    test.equal(buf, '');

    var div = document.createElement("DIV");
    Blaze.insert(Blaze.render(v), div);
    test.equal(buf, 'c');
    test.equal(canonicalizeHtml(div.innerHTML), "foo");

    Blaze.remove(v);
    test.equal(buf, 'cd');
    test.equal(canonicalizeHtml(div.innerHTML), "");
  });

}
