Timers = new Meteor.Collection(null);

if (! Session.get("x")) {
  Session.set("x", 1);
}

if (! Session.get("y")) {
  Session.set("y", 1);
}

if (! Session.get("z")) {
  Session.set("z", 1);
}

Template.redrawButtons.events = {
  'click input.x': function () {
    Session.set("x", Session.get("x") + 1);
  },

  'click input.y': function () {
    Session.set("y", Session.get("y") + 1);
  },

  'click input.z': function () {
    Session.set("z", Session.get("z") + 1);
  }
};

Template.preserveDemo.preserve = [ '.input' ];

Template.preserveDemo.x =
Template.constantDemo.x =
Template.stateDemo.x =
function () {
  return Session.get("x");
};


Template.stateDemo.events = {
  'click .create': function () {
    Timers.insert({});
  }
};

Template.stateDemo.timers = function () {
  return Timers.find();
};

Template.timer.events = {
  'click .delete': function () {
    Timers.remove(this._id);
  }
};
