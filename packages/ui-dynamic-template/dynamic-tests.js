// Copied from spacebars-tests
var renderToDiv = function (comp) {
  var div = document.createElement("DIV");
  UI.materialize(comp, div);
  return div;
};

Tinytest.add(
  "ui-dynamic-template - render template dynamically", function (test, expect) {
    var tmpl = Template["ui-dynamic-test"];

    var rvName = new ReactiveVar;
    var rvData = new ReactiveVar;
    tmpl.templateName = function () {
      return rvName.get();
    };
    tmpl.templateData = function () {
      return rvData.get();
    };

    // No template chosen
    var div = renderToDiv(tmpl);
    test.equal(div.innerHTML.trim(), "");

    // Choose the "ui-dynamic-test-sub" template, with no data context
    // passed in.
    rvName.set("ui-dynamic-test-sub");
    Deps.flush();
    test.equal(div.innerHTML.trim(), "test");

    // Set a data context.
    rvData.set({ foo: "bar" });
    Deps.flush();
    test.equal(div.innerHTML.trim(), "testbar");
  });

// Same test as above, but the {{> UI.dynamic}} inclusion has no
// `dataContext` argument.
Tinytest.add(
  "ui-dynamic-template - render template dynamically, no data context",
  function (test, expect) {
    var tmpl = Template["ui-dynamic-test-no-data"];

    var rvName = new ReactiveVar;
    tmpl.templateName = function () {
      return rvName.get();
    };

    var div = renderToDiv(tmpl);
    test.equal(div.innerHTML.trim(), "");

    rvName.set("ui-dynamic-test-sub");
    Deps.flush();
    test.equal(div.innerHTML.trim(), "test");
  });


Tinytest.add(
  "ui-dynamic-template - render template " +
    "dynamically, data context gets inherited",
  function (test, expect) {
    var tmpl = Template["ui-dynamic-test-inherited-data"];

    var rvName = new ReactiveVar();
    var rvData = new ReactiveVar();
    tmpl.templateName = function () {
      return rvName.get();
    };
    tmpl.context = function () {
      return rvData.get();
    };

    var div = renderToDiv(tmpl);
    test.equal(div.innerHTML.trim(), "");

    rvName.set("ui-dynamic-test-sub");
    Deps.flush();
    test.equal(div.innerHTML.trim(), "test");

    // Set the top-level template's data context; this should be
    // inherited by the dynamically-chosen template, since the {{>
    // UI.dynamic}} inclusion didn't include a data argument.
    rvData.set({ foo: "bar" });
    Deps.flush();
    test.equal(div.innerHTML.trim(), "testbar");
  }
);
