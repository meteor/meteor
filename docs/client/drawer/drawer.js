openDrawerWithTemplate = function (templateName) {
  Session.set("drawerTemplate", templateName);
};

closeDrawer = function () {
  Session.set("drawerTemplate", null);
};

Template.drawer.onRendered(function () {
  this.find(".container-for-ui-hooks")._uihooks = {
    insertElement: function (node, next) {
      $node = $(node).hide();
      $node.insertBefore(next);
      $node.fadeIn();
    },
    removeElement: function (node) {
      $node = $(node);
      $node.fadeOut(function () {
        $node.remove();
      });
    }
  }
});

Template.drawer.helpers({
  drawerTemplate: function () {
    return Session.get("drawerTemplate");
  }
});

Template.drawer.events({
  "click .drawer-overlay": function () {
    closeDrawer();
  }
});