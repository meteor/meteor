Timers = new Mongo.Collection(null);

///////////////////////////////////////////////////////////////////////////////

if (! Session.get("x")) {
  Session.set("x", 1);
}

if (! Session.get("y")) {
  Session.set("y", 1);
}

if (! Session.get("z")) {
  Session.set("z", 1);
}

Template.preserveDemo.x =
Template.constantDemo.x =
Template.stateDemo.x =
function () {
  return Session.get("x");
};

Template.timer.y = function () {
  return Session.get("y");
};

Template.stateDemo.z =
function () {
  return Session.get("z");
};

Template.page.events({
  'click input.x': function () {
    Session.set("x", Session.get("x") + 1);
  },

  'click input.y': function () {
    Session.set("y", Session.get("y") + 1);
  },

  'click input.z': function () {
    Session.set("z", Session.get("z") + 1);
  }
});

///////////////////////////////////////////////////////////////////////////////

if (typeof Session.get("spinForward") !== 'boolean') {
  Session.set("spinForward", true);
}

Template.preserveDemo.preserve([ '.spinner', '.spinforward' ]);

Template.preserveDemo.spinForwardChecked = function () {
  return Session.get('spinForward') ? 'checked' : '';
};

Template.preserveDemo.spinAnim = function () {
  return Session.get('spinForward') ? 'spinForward' : 'spinBackward';
};

Template.preserveDemo.events({
  'change .spinforward' : function (event) {
    Session.set('spinForward', event.currentTarget.checked);
  }
});

///////////////////////////////////////////////////////////////////////////////

Template.constantDemo.checked = function (which) {
  return Session.get('mapchecked' + which) ? 'checked' : '';
};

Template.constantDemo.show = function (which) {
  return ! Session.get('mapchecked' + which);
};

Template.constantDemo.events({
  'change .remove' : function (event) {
    var tgt = event.currentTarget;
    Session.set('mapchecked' + tgt.getAttribute("which"), tgt.checked);
  }
});

///////////////////////////////////////////////////////////////////////////////

Template.stateDemo.events({
  'click .create': function () {
    Timers.insert({});
  }
});

Template.stateDemo.timers = function () {
  return Timers.find();
};

Template.timer.events({
  'click .reset': function (event, template) {
    template.elapsed = 0;
    updateTimer(template);
  },
  'click .delete': function () {
    Timers.remove(this._id);
  }
});

var updateTimer = function (timer) {
  timer.node.innerHTML = timer.elapsed + " second" +
    ((timer.elapsed === 1) ? "" : "s");
};

Template.timer.onCreated(function () {
  var self = this;
  self.elapsed = 0;
  self.node = null;
});

Template.timer.onRendered(function () {
  var self = this;
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
});

Template.timer.onDestroyed(function () {
  clearInterval(this.timer);
});

///////////////////////////////////////////////////////////////////////////////

Template.d3Demo.left = function () {
  return { group: "left" };
};

Template.d3Demo.right = function () {
  return { group: "right" };
};

Template.circles.events({
  'mousedown circle': function (evt, template) {
    Session.set("selectedCircle:" + this.group, evt.currentTarget.id);
  },
  'click .add': function () {
    Circles.insert({x: Random.fraction(), y: Random.fraction(),
                    r: Random.fraction() * .1 + .02,
                    color: {
                      r: Random.fraction(),
                      g: Random.fraction(),
                      b: Random.fraction()
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
          x: Random.fraction(), y: Random.fraction(), r: Random.fraction() * .1 + .02
        }
      });
    });
  },
  'click .clear': function () {
    Circles.remove({group: this.group});
  }
});

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
    '' : 'disabled';
};

Template.circles.onCreated(function () {
});

Template.circles.onRendered(function () {
  var self = this;
  self.node = self.find("svg");

  var data = self.data;

  if (! self.handle) {
    d3.select(self.node).append("rect");
    self.handle = Deps.autorun(function () {
      var circle = d3.select(self.node).selectAll("circle")
        .data(Circles.find({group: data.group}).fetch(),
              function (d) { return d._id; });

      circle.enter().append("circle")
        .attr("id", function (d) {
          return d._id;
        })
        .attr("cx", function (d) {
          return d.x * 272;
        })
        .attr("cy", function (d) {
          return d.y * 272;
        })
        .attr("r", 50)
        .style("fill", function (d) {
          return colorToString(d.color);
        })
        .style("opacity", 0);

      circle.transition()
        .duration(250)
        .attr("cx", function (d) {
          return d.x * 272;
        })
        .attr("cy", function (d) {
          return d.y * 272;
        })
        .attr("r", function (d) {
          return d.r * 272;
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
        rect.attr("x", (s.x - s.r) * 272)
        .attr("y", (s.y - s.r) * 272)
        .attr("width", s.r * 2 * 272)
        .attr("height", s.r * 2 * 272)
        .attr("display", '')
        .style("fill", "none")
        .style("stroke", "red")
        .style("stroke-width", 3);
      else
        rect.attr("display", 'none');
    });
  }
});

Template.circles.onDestroyed(function () {
  this.handle && this.handle.stop();
});
