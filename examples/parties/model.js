/*
  owner: user id
  x, y: Number (screen coordinates)
  title, description: String
  attending: Number (count)
  public: Boolean
  canSee: list of user id's that it's shared with (ignored if public)
*/
Parties = new Meteor.Collection("parties");

Parties.allow({
  insert: function (userId, doc) {
    return false; // use createParty method instead
  },
  update: function (userId, docs, fields, modifier) {
    return true; // XXX
  },
  remove: function (userId, docs) {
    return true;
  }
});

Parties.deny({
  remove: function (userId, parties) {
    return _.any(parties, function (party) {
      // Can't delete a party with RSVP's
      return party.attending > 0;
    });
  }
});

/*
  user
  party
  rsvp: String ("yes", "no", "maybe")
 */
Rsvps = new Meteor.Collection("rsvps");

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
    if (! this.userId)
      throw new Meteor.Error(403, "You must be logged in");

    Parties.insert({
      owner: this.userId,
      x: options.x,
      y: options.y,
      title: options.title,
      description: options.description,
      attending: 0,
      public: !! options.public,
      canSee: []
    });
  },

  rsvp: function (partyId, rsvp) {
    if (! this.userId)
      throw new Meteor.Error(403, "You must be logged in to RSVP");
    if (! _.contains(['yes', 'no', 'maybe'], rsvp))
      throw new Meteor.Error(400, "Invalid RSVP");

    var oldAttendance;
    var attendance = (rsvp === 'yes') ? 1 : 0;

    // XXX race condition -- need upsert
    var record = Rsvps.findOne({user: this.userId, party: partyId});
    if (record) {
      var oldAttendance = (record.rsvp === 'yes') ? 1 : 0;
      Rsvps.update(record._id, {$set: {rsvp: rsvp}});
    } else {
      oldAttendance = 0;
      Rsvps.insert({user: this.userId, party: partyId, rsvp: rsvp});
    }

    Parties.update(partyId, {$inc: {attending: attendance - oldAttendance}});

    if (! record) {
      record = {user: this.userId, party: partyId}
    }
  }
});