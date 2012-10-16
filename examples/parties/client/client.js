// XXX I want to collect first/last name when a user signs up by username/password

Meteor.subscribe("directory");
Meteor.subscribe("parties");

Template.page.showCreateDialog = function () {
  return Session.get("showCreateDialog");
};

Template.page.showInviteDialog = function () {
  return Session.get("showInviteDialog");
};

// If no party selected, select one.
Meteor.startup(function () {
  Meteor.autorun(function () {
    if (! Session.get("selected")) {
      var party = Parties.findOne();
      if (party)
        Session.set("selected", party._id);
    }
  });
});

///////////////////////////////////////////////////////////////////////////////
// Party details sidebar
///////////////////////////////////////////////////////////////////////////////

Template.details.party = function () {
  return Parties.findOne(Session.get("selected"));
};

Template.details.creatorName = function () {
  var owner = Meteor.users.findOne(this.owner);
  if (owner._id === Meteor.userId())
    return "me";
  return displayName(owner);
};

Template.attendance.rsvpName = function () {
  var user = Meteor.users.findOne(this.user);
  return displayName(user);
};

Template.attendance.outstandingInvitations = function () {
  var party = Parties.findOne(this._id);
  // take out the people that have already rsvp'd
  var people = _.difference(party.invited, _.pluck(party.rsvps, 'user'));
  return Meteor.users.find({_id: {$in: people}});
};

Template.attendance.invitationName = function () {
  return displayName(this);
};

Template.attendance.rsvpIs = function (what) {
  return this.rsvp === what;
};

Template.attendance.nobody = function () {
  return ! this.public && (this.rsvps.length + this.invited.length === 0);
};

Template.attendance.canInvite = function () {
  return ! this.public && this.owner === Meteor.userId();
};

Template.details.canRemove = function () {
  return this.owner === Meteor.userId() && attending(this) === 0;
};

Template.details.maybeChosen = function (what) {
  var myRsvp = _.find(this.rsvps, function (r) {
    return r.user === Meteor.userId();
  }) || {};

  return what == myRsvp.rsvp ? "chosen btn-inverse" : "";
};

// XXX show which button is currently selected
Template.details.events({
  // XXX demonstrate error handling?
  'click .rsvp_yes': function () {
    Meteor.call("rsvp", Session.get("selected"), "yes");
    return false;
  },
  'click .rsvp_maybe': function () {
    Meteor.call("rsvp", Session.get("selected"), "maybe");
    return false;
  },
  'click .rsvp_no': function () {
    Meteor.call("rsvp", Session.get("selected"), "no");
    return false;
  },
  'click .invite': function () {
    Session.set("showInviteDialog", true);
    return false;
  },
  'click .remove': function () {
    Parties.remove(this._id);
    return false;
  }
});

///////////////////////////////////////////////////////////////////////////////
// Map display
///////////////////////////////////////////////////////////////////////////////

// XXX fold into package? domutils?
// http://stackoverflow.com/questions/55677/how-do-i-get-the-coordinates-of-a-mouse-click-on-a-canvas-element
function relMouseCoords (element, event) {
  var totalOffsetX = 0;
  var totalOffsetY = 0;
  var canvasX = 0;
  var canvasY = 0;
  var currentElement = element;

  do{
    totalOffsetX += currentElement.offsetLeft - currentElement.scrollLeft;
    totalOffsetY += currentElement.offsetTop - currentElement.scrollTop;
  }
  while (currentElement = currentElement.offsetParent)

  canvasX = event.pageX - totalOffsetX;
  canvasY = event.pageY - totalOffsetY;

  return {x: canvasX, y: canvasY};
}

Template.map.events = {
  'mousedown circle, mousedown text': function (event, template) {
    Session.set("selected", event.currentTarget.id);
  },
  'dblclick svg': function (event, template) {
    // must be logged in
    if (!Meteor.userId())
      return;
    var coords = relMouseCoords(event.currentTarget, event);
    Session.set("createCoords", {
      x: coords.x / 500, // XXX event.currentTarget.width?
      y: coords.y / 500
    });
    Session.set("showCreateDialog", true);
  }
};

Template.map.rendered = function () {
  var self = this;
  self.node = this.find("svg");

  if (! self.handle) {
    self.handle = Meteor.autorun(function () {
      var selected = Session.get('selected');

      var marker = d3.select(self.node).select(".circles").selectAll("circle")
        .data(Parties.find().fetch(),
              function (party) { return party._id; });

      var labels = d3.select(self.node).select(".labels").selectAll("text")
        .data(Parties.find().fetch(),
              function (party) { return party._id; });

      marker.enter().append("circle")
        .attr("id", function (party) {
          return party._id;
        })
        .attr("cx", function (party) {
          return party.x * 500;
        })
        .attr("cy", function (party) {
          return party.y * 500;
        })
        // XXX match area
        // (duplicated below)
        .attr("r", function (party) {
          return 10 + attending(party) * 10;
        })
        .style("fill", function (party) {
          return party.public ? 'red' : 'blue';
        })
        .style('opacity', function (party) {
          return selected === party._id ? 1 : 0.4;
        });

      marker.transition()
        .duration(250)
        .attr("cx", function (party) {
          return party.x * 500;
        })
        .attr("cy", function (party) {
          return party.y * 500;
        })
        .attr("r", function (party) {
          return 10 + attending(party) * 10;
        })
        .style("fill", function (party) {
          return party.public ? 'red' : 'blue';
        })
        .style('opacity', function (party) {
          return selected === party._id ? 1 : 0.4;
        })
        .ease("cubic-out");

      marker.exit().remove();

      // XXX it'd be nice to stroke the text out in white
      labels.enter().append("text")
        .attr("id", function (party) {
          return party._id;
        })
        .attr("x", function (party) {
          return party.x * 500;
        })
        .attr("y", function (party) {
          return party.y * 500;
        })
        .text(function (party) {return attending(party);});

      labels.transition().duration(250)
        .attr("x", function (party) {
          return party.x * 500;
        })
        .attr("y", function (party) {
          return party.y * 500;
        })
        .text(function (party) {return attending(party);});

      labels.exit().remove();

    });
  }
};

Template.map.destroyed = function () {
  this.handle && this.handle.stop();
};

///////////////////////////////////////////////////////////////////////////////
// Create Party dialog
///////////////////////////////////////////////////////////////////////////////

Template.createDialog.events = {
  'click .save': function (event, template) {
    var title = template.find(".title").value;
    var description = template.find(".description").value;
    var public = !template.find(".private").checked;

    if (title.length && description.length) {
      var coords = Session.get("createCoords");
      Meteor.call('createParty', {
        title: title,
        description: description,
        x: coords.x,
        y: coords.y,
        public: public
      }, function (error, party) {
        if (! error) {
          Session.set("selected", party);
          if (! public)
            Session.set("showInviteDialog", true);
        }
      });
      Session.set("showCreateDialog", false);
    } else {
      // XXX show validation failure
    }
  },

  'click .cancel': function () {
    Session.set("showCreateDialog", false);
  }
};

///////////////////////////////////////////////////////////////////////////////
// Invite dialog
///////////////////////////////////////////////////////////////////////////////

Template.inviteDialog.events = {
  'click .invite': function (event, template) {
    Meteor.call('invite', Session.get("selected"), this._id);
  },
  'click .done': function (event, template) {
    Session.set("showInviteDialog", false);
    return false;
  }
};

Template.inviteDialog.uninvited = function () {
  var party = Parties.findOne(Session.get("selected"));
  if (! party)
    // XXX this happens on code push when the invite dialog is
    // open. easy enough to add a guard, but what's the big picture?
    // do we have to do this everywhere?
    return [];
  var invited = _.clone(party.invited);
  invited.push(party.owner);
  return Meteor.users.find({_id: {$nin: invited}});
};

Template.inviteDialog.displayName = function () {
  return displayName(this);
};
