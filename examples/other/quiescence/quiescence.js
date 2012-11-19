Time = new Meteor.Collection("time");
Results = new Meteor.Collection("results");
Magic = new Meteor.Collection("magic");

if (Meteor.isServer) {
  Meteor.publish("time", function () {
    var self = this;
    var publishTime = function () {
      var when = + new Date;
      self.set("time", "now", {timestamp: when});
      self.flush();
    };
    publishTime();
    self.complete();
    self.flush();
    var interval = Meteor.setInterval(publishTime, 1000);
    self.onStop(function () {
      Meteor.clearInterval(interval);
    });
  });
  Meteor.publish("results", function () {
    return Results.find();
  });
  Meteor.publish("magic", function () {
    return Magic.find();
  });

  Meteor.startup(function () {
    if (Magic.find().count() === 0) {
      Magic.insert({number: 42});
    }
  });

  var sleep = function (ms) {
    var fiber = Fiber.current;
    setTimeout(function() {
      fiber.run();
    }, ms);
    Fiber.yield();
  };

  Meteor.methods({
    getResults: function () {
      this.unblock();
      Results.remove({});
      for (var i = 0; i < 5; ++i) {
        sleep(1000);
        Results.insert({i: i, text: 'result ' + i});
      }
    }});
} else {
  Meteor.subscribe("time");
  Meteor.subscribe("results");
  Meteor.subscribe("magic");

  Template.clock.time = function () {
    var now = Time.findOne('now');
    if (!now)
      return "(loading)";
    return new Date(now.timestamp).toTimeString();
  };

  Template.updated.magic = function () {
    var singleton = Magic.findOne();
    if (!singleton)
      return "(loading)";
    return singleton.number;
  };
  Template.updated.events({
    'click #update-button': function () {
      var num = Math.round(Math.random()*100);
      Meteor.call('setMagic', num);
    }
  });

  Template.stream.events({
    'click #stream-button': function () {
      Meteor.call('getResults');
    }
  });

  Template.stream.results = function () {
    return Results.find({}, {sort: ['i']});
  };
}

Meteor.methods({
  setMagic: function (num) {
    if (this.isSimulation) {
      Magic.update({}, {$set: {number: num}});
    } else {
      Magic.update({}, {$set: {number: num + 0.5}});
    }
  }
});
