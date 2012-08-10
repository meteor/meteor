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
  'click .reset': function (event, template) {
    template.data.elapsed = 0;
    updateTimer(template.data);
  },
  'click .delete': function () {
    Timers.remove(this._id);
  }
};

Template.timer.z = function () {
  return Session.get("z");
};

var updateTimer = function (timer) {
  timer.node.innerHTML = timer.elapsed + " second" +
    ((timer.elapsed === 1) ? "" : "s");
};

Template.timer.create = function () {
  var self = this;
  console.log("timer create");
  self.elapsed = 0;
  self.node = null;
};

Template.timer.render = function (landmark) {
  var self = this;
  console.log("timer render");
  self.node = landmark.find(".elapsed");
  updateTimer(self);

  if (! self.timer) {
    var tick = function () {
      self.elapsed++;
      self.timer = setTimeout(tick, 1000);
      updateTimer(self);
    };
    tick();
  }
};


Template.timer.destroy = function () {
  console.log("timer destroy");
  clearInterval(this.timer);
};

///////////////////////////////////////////////////////////////////////////////

// XXX move to Meteor.autorun?
// (what else does it need to replace Meteor.autosubscribe?)
var autorun = function (f) {
  var ctx;
  var slain = false;
  var rerun = function () {
    if (slain)
      return;
    ctx = new Meteor.deps.Context;
    ctx.run(f);
    ctx.on_invalidate(rerun);
  };
  rerun();
  return {
    stop: function () {
      slain = true;
      ctx.invalidate();
    }
  };
};

Template.d3Demo.left = function () {
  return { group: "left" };
};

Template.d3Demo.right = function () {
  return { group: "right" };
};

var hitTest = function (x, y, selector) {
  var circles = Circles.find(selector).fetch();
  for (var i = 0; i < circles.length; i++) {
    var c = circles[i];
    var dist2 = (x - c.x) * (x - c.x) + (y - c.y) * (y - c.y);
    if (dist2 < c.r*c.r)
      return c;
  }
  return null;
};

Template.circles.events = {
  'click svg': function (evt, template) {
    var circle = hitTest(evt.offsetX / 200, evt.offsetY / 200,
                         {group: this.group});
    console.log("click " + (circle ? circle._id : "null"));
    // XXX actually want to create a ReactiveVar on the template!
    Session.set("selectedCircle:" + this.group, circle);
  },
  'click .add': function () {
    Circles.insert({x: Meteor.random(), y: Meteor.random(),
                    r: Meteor.random() * .1 + .02,
                    color: {
                      r: Meteor.random(),
                      g: Meteor.random(),
                      b: Meteor.random()
                    },
                    group: this.group
                   });
  },
  'click .remove': function () {
    var selected = Session.get("selectedCircle:" + this.group);
    if (selected) {
      Circles.remove(selected);
      Session.set("selectedCircle:" + this.group, null);
    }
  },
  'click .scram': function () {
    Circles.find({group: this.group}).forEach(function (r) {
      Circles.update(r._id, {
        $set: {
          x: Meteor.random(), y: Meteor.random(), r: Meteor.random() * .1 + .02
        }
      });
    });
  }
};

Template.circles.create = function () {
};

var colorToString = function (color) {
  var f = function (x) { return Math.floor(x * 256); };
  return "rgb(" + f(color.r) + "," +
    + f(color.g) + "," + + f(color.b) + ")";
};

Template.circles.count = function () {
  return Circles.find({group: this.group}).count();
};

Template.circles.disabled = function () {
  return Session.get("selectedCircle:" + this.group) ?
    '' : 'disabled="disabled"';
};

Template.circles.render = function () {
  var self = this;
  self.node = self.find("svg");

  var data = self.data;

  if (! self.handle) {
    // XXX template.firstRender would be handy here
    // (except that node's inside a constant region, so it's unnecessary)

    d3.select(self.node).append("rect");
    self.handle = autorun(function () {
      var circle = d3.select(self.node).selectAll("circle")
        .data(Circles.find({group: data.group}).fetch(),
              function (d) { return d._id; });

      circle.enter().append("circle")
        .attr("cx", function (d) {
          return d.x * 200;
        })
        .attr("cy", function (d) {
          return d.y * 200;
        })
        .attr("r", 50)
        .style("fill", function (d) {
          return colorToString(d.color);
        })
        .style("opacity", 0);

      circle.transition()
        .duration(250)
        .attr("cx", function (d) {
          return d.x * 200;
        })
        .attr("cy", function (d) {
          return d.y * 200;
        })
        .attr("r", function (d) {
          return d.r * 200;
        })
        .style("fill", function (d) {
          return colorToString(d.color);
        })
        .style("opacity", .9)
        .ease("cubic-out");

      circle.exit().transition()
        .duration(250)
        .attr("r", 0)
        .remove();

      var selectionId = Session.get("selectedCircle:" + data.group);
      var s = selectionId && Circles.findOne(selectionId);
      var rect = d3.select(self.node).select("rect");
      if (s)
        rect.attr("x", (s.x - s.r) * 200)
        .attr("y", (s.y - s.r) * 200)
        .attr("width", s.r * 2 * 200)
        .attr("height", s.r * 2 * 200)
        .attr("display", '')
        .style("fill", "none")
        .style("stroke", "red")
        .style("stroke-width", 3);
      else
        rect.attr("display", 'none');
    });
  }
};

Template.circles.destroy = function () {
  this.handle && this.handle.stop();
};
