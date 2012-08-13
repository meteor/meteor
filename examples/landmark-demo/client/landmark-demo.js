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

Template.preserveDemo.preserve([ '.spinner', '.spinforward' ]);

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
    template.elapsed = 0;
    updateTimer(template);
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

Template.timer.render = function () {
  var self = this;
  console.log("timer render");
  self.node = this.find(".elapsed");
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

Template.circles.events = {
  'click circle': function (evt, template) {
    // XXX actually want to create a ReactiveVar on the template!
    // (but how will it be preserved across migration?)
    // (maybe template.get, template.set?? rather than form??)
    Session.set("selectedCircle:" + this.group, evt.currentTarget.id);
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
      // XXX In an ideal world, we'd pass a cursor to .data(), and as
      // long as we were within an autorun, the "right thing" would
      // happen, meaning that d3 would process only the changed
      // elements.
      //
      // You could model this as a getChanges() method on a cursor,
      // which reactively returns the changes since you last called it
      // (as an object with added, removed, moved, changed sections.)
      // Except you should be able to have N per cursor.
      //
      // Actually, you could make a function Meteor.getChanges(cursor)
      // that returns a changes function that has the above
      // properties.
      //
      // Then, we'd need to reach inside d3's matching logic to make
      // it detect a Meteor cursor and call getChanges ...
      //
      // XXX no, you need one getchanges per cursor per autorun. hmm.
      // maybe a factory that memoizes them somehow? but, per autorun?
      //
      // Maybe:
      // var stream = ChangeStream(cursor);
      // autorun(function () { d3.select(...).stream(stream) ... }
      // Streams are the factory described above. returns ChangeSets
      //
      // XXX what this doesn't answer is, what if you depend on other
      // reactive values, eg Session.get("color")?
      //
      // XXX why can't we just do this stuff declaratively with
      // Handlebars and an <svg> element? what does that imply about
      // missing animation support in Spark?
      //
      // XXX make Session be a ReactiveDict (ReactiveMap?) and put the
      // ReactiveDiff impl in packages/deps/tools.js. Keep the
      // low-level deps machinery as it is (maybe add invalidation
      // sequencing.) Rename Meteor.deps.Context =>
      // InvalidationContext.
      //
      // XXX allow query selectors, sorts, to be lambdas?
      var circle = d3.select(self.node).selectAll("circle")
        .data(Circles.find({group: data.group}).fetch(),
              function (d) { return d._id; });

      circle.enter().append("circle")
        .attr("id", function (d) {
          return d._id;
        })
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

      // XXX this doesn't animate as I'd hoped when you press Scram
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
