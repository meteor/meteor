var UI = UI2;

Tinytest.add("ui - render", function (test) {
  var c, R;

  c = UI.Component.extend({
    render: function (buf) {
      buf.write("asdf");
    }
  });

  c.build();
  test.equal($(c._offscreen).html(), "asdf");
  c.destroy();



  c = UI.Component.extend({
    render: function (buf) {
      buf.write("<div>asdf</div>");
    }
  });

  c.build();
  test.equal($(c._offscreen).html(), "<div>asdf</div>");
  c.destroy();



  R = ReactiveVar("blam");
  c = UI.Component.extend({
    render: function (buf) {
      buf.write(
        "foo",
        UI.Text.withData(function () { return R.get(); }),
        "bar");
    }
  });

  c.build();
  test.equal($(c._offscreen).html(), "fooblambar");
  R.set("ki");
  Deps.flush();
  test.equal($(c._offscreen).html(), "fookibar");
  c.destroy();



  R = ReactiveVar("<hr>");
  c = UI.Component.extend({
    render: function (buf) {
      buf.write(
        "foo",
        UI.HTML.withData(function () { return R.get(); }),
        "bar");
    }
  });

  c.build();
  test.equal($(c._offscreen).html(), "foo<hr>bar");
  R.set("<div>hi</div>");
  Deps.flush();
  test.equal($(c._offscreen).html(), "foo<div>hi</div>bar");
  c.destroy();

});