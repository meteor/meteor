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

if (typeof Session.get("spinForward") !== 'boolean') {
  Session.set("spinForward", true);
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

Template.preserveDemo.preserve = [ '.spinner', '.spinforward' ];

Template.preserveDemo.spinForwardChecked = function () {
  return Session.get('spinForward') ? 'checked="checked"' : '';
};

Template.preserveDemo.spinAnim = function () {
  return Session.get('spinForward') ? 'spinForward' : 'spinBackward';
};

Template.preserveDemo.events = {
  'change .spinforward' : function (event) {
    Session.set('spinForward', event.currentTarget.checked);
  }
};

Template.preserveDemo.x =
Template.constantDemo.x =
Template.stateDemo.x =
function () {
  return Session.get("x");
};

Template.stateDemo.y =
function () {
  return Session.get("y");
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
  'click .reset': function () {
    // XXX need to get the template state object
    // XXX also probably need to have the landmark available..
    Timers.remove(this._id);
  },
  'click .delete': function () {
    Timers.remove(this._id);
  }
};

Template.timer.z = function () {
  return Session.get("z");
};

Template.timer.create = function () {
  var self = this;
  console.log("timer create");
  self.elapsed = 0;
  self.node = null;
  self.update = function () {
    self.node.innerHTML = self.elapsed + " second" +
      ((self.elapsed === 1) ? "" : "s");
  }
};

Template.timer.render = function (landmark) {
  var self = this;
  console.log("timer render");
  self.node = landmark.find(".elapsed");
  self.update();

  if (! self.timer) {
    var tick = function () {
      self.elapsed++;
      self.timer = setTimeout(tick, 1000);
      self.update();
    };
    tick();
  }
};


Template.timer.destroy = function () {
  console.log("timer destroy");
  clearInterval(this.timer);
};
