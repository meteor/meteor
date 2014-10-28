Template.body.events({
  "click .open-sidebar": function () {
    Session.set("sidebarOpen", true);
  },
  "click .close-sidebar": function () {
    Session.set("sidebarOpen", false);
  }
});

Template.body.helpers({
  openSidebar: function () {
    return Session.get("sidebarOpen") ? "sidebar-open" : "sidebar-closed";
  }
});