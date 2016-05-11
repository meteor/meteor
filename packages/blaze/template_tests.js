var callOrder = null;
var callVariable = null;

Template.blaze_test_parent.helpers({
  showChild1: function () {
    return callVariable.get();
  }
});

Template.blaze_test_parent.onRendered(function () {
  callOrder.push("parent");
});

Template.blaze_test_child1.onRendered(function () {
  callOrder.push("child1");
});

Template.blaze_test_child2.onRendered(function () {
  callOrder.push("child2");
  callVariable.set(true);
});

Tinytest.add("blaze - render order", function (test) {
  callOrder = [];
  callVariable = new ReactiveVar(false);

  var view = Blaze.render(Template.blaze_test_parent, $('body').get(0));

  Tracker.flush();

  Blaze.remove(view);

  test.equal(callOrder, ["child2", "child1", "parent"]);
});