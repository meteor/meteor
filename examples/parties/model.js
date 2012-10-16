/*
  owner: user id
  x, y: Number (screen coordinates)
  title, description: String
  public: Boolean
  invited: list of user id's that it's shared with, not including
    the owner (ignored if public)
  rsvps: XXX document, fields are 'user' and 'rsvp'
*/
Parties = new Meteor.Collection("parties");

Parties.allow({
  insert: function (userId, party) {
    return false; // use createParty method instead
  },
  update: function (userId, parties, fields, modifier) {
    return _.all(parties, function (party) {
      if (userId !== party.owner)
        return false; // not the owner
      var allowed = ["title", "description", "x", "y"];
      if (_.difference(fields, allowed).length)
        return false; // tried to write to forbidden field

      // XXX validate that they keep the right types, and don't write
      // stupidly long strings to the database. since all we have is a
      // modifier that take a little logic.

      return true;
    });
  },
  remove: function (userId, parties) {
    return ! _.any(parties, function (party) {
      return party.owner !== userId || attending(party) > 0;
    });
  }
});

var attending = function (party) {
  return _.reduce(party.rsvps, function (memo, rsvp) {
    if (rsvp.rsvp === 'yes')
      return memo + 1;
    else
      return memo;
  }, 0);
};

var displayName = function (user) {
  if (user.profile && user.profile.name)
    return user.profile.name;
  return user.emails[0].address;
};

var contactEmail = function (user) {
  if (user.emails && user.emails.length)
    return user.emails[0].address;
  if (user.services.facebook && user.services.facebook.email)
    return user.services.facebook.email;
  return null;
};

Meteor.methods({
  // title, description, x, y, public
  // XXX limit a user to a certain number of parties
  createParty: function (options) {
    options = options || {};
    if (! (typeof options.title === "string" && options.title.length &&
           typeof options.description === "string" &&
           options.description.length &&
           typeof options.x === "number" &&
           options.x >= 0 && options.x <= 1 &&
           typeof options.y === "number" &&
           options.y >= 0 && options.y <= 1))
      // XXX should get rid of the error code
      throw new Meteor.Error(400, "Required parameter missing");
    if (options.title.length > 100)
      throw new Meteor.Error(413, "Title too long");
    if (options.description.length > 1000)
      throw new Meteor.Error(413, "Description too long");
    if (! this.userId)
      throw new Meteor.Error(403, "You must be logged in");

    return Parties.insert({
      owner: this.userId,
      x: options.x,
      y: options.y,
      title: options.title,
      description: options.description,
      public: !! options.public,
      invited: [],
      rsvps: []
    });
  },

  invite: function (partyId, userId) {
    var party = Parties.findOne(partyId);
    if (! party || party.owner !== this.userId)
      throw new Meteor.Error(404, "No such party");
    if (party.public)
      throw new Meteor.Error(400,
                             "That party is public. No need to invite people.");
    if (userId !== party.owner && ! _.contains(party.invited, userId)) {
      Parties.update(partyId, { $addToSet: { invited: userId } });

      var from = contactEmail(Meteor.users.findOne(this.userId));
      var to = contactEmail(Meteor.users.findOne(userId));
      if (Meteor.isServer && to) {
        Email.send({
          from: "noreply@example.com",
          to: to,
          replyTo: from || undefined,
          subject: "PARTY: " + party.title,
          text:
"Hey, I just invited you to '" + party.title + "' on All Tomorrow's Parties.\n" +
"\n" +
"Come check it out at: " + Meteor.absoluteUrl() + "\n"
        });
      }
    }
  },

  rsvp: function (partyId, rsvp) {
    if (! this.userId)
      throw new Meteor.Error(403, "You must be logged in to RSVP");
    if (! _.contains(['yes', 'no', 'maybe'], rsvp))
      throw new Meteor.Error(400, "Invalid RSVP");
    var party = Parties.findOne(partyId);
    if (! party)
      throw new Meteor.Error(404, "No such party");
    if (! party.public && party.owner !== this.userId && !_.contains(party.invited, this.userId))
      throw new Meteor.Error(403, "No such party"); // private, but let's not tell this to the user

    var rsvpIndex = _.indexOf(_.pluck(party.rsvps, 'user'), this.userId);
    if (rsvpIndex !== -1) {
      // update existing rsvp entry

      if (Meteor.isServer) {
        // update the appropriate rsvp entry with $
        Parties.update(
          {_id: partyId, "rsvps.user": this.userId},
          {$set: {"rsvps.$.rsvp": rsvp}});
      } else {
        // minimongo doesn't yet support $ in modifier. reconstruct
        // the modifier to be of the form:
        //   {$set: {"rsvps.<index>.rsvp"}}
        var modifier = {$set: {}};
        modifier.$set["rsvps." + rsvpIndex + ".rsvp"] = rsvp;
        Parties.update(partyId, modifier);
      }
    } else {
      // add new rsvp entry
      Parties.update(
        partyId,
        {$push: {rsvps: {user: this.userId, rsvp: rsvp}}});
    }
  }
});
