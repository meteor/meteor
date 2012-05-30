  Sessions = new Meteor.Collection('sessions');

if (Meteor.is_client) {

  // Returns an event_map key for attaching "ok/cancel" events to
  // a text input (given by selector)
  var okcancel_events = function (selector) {
    return 'keyup '+selector+', keydown '+selector+', focusout '+selector;
  };

  // Creates an event handler for interpreting "escape", "return", and "blur"
  // on a text field and calling "ok" or "cancel" callbacks.
  var make_okcancel_handler = function (options) {
    var ok = options.ok || function () {};
    var cancel = options.cancel || function () {};

    return function (evt) {
      if (evt.type === "keydown" && evt.which === 27) {
        // escape = cancel
        cancel.call(this, evt);

      } else if (evt.type === "keyup" && evt.which === 13 ||
                 evt.type === "focusout") {
        // blur/return/enter = ok/submit if non-empty
        var value = String(evt.target.value || "");
        if (value)
          ok.call(this, value, evt);
        else
          cancel.call(this, evt);
      }
    };
  };

  Template.users.users = function() {
    // return the users that are connected
    return _.map(Sessions.find({connected: true, user: {$exists: true}}).fetch(),function(session) {
      return {name: session.user};
    });
  }

  Template.users.events = {};

  // Attach events to keydown, keyup, and blur on "New list" input box.
  Template.users.events[ okcancel_events('#set-user-box') ] =
    make_okcancel_handler({
      ok: function (text, evt) {
        // sets the user for this session
        Sessions.update({id: Session.id},{$set: {user: text}});
        evt.target.value = "";
      }
    });

}

if (Meteor.is_server) {
  Meteor.methods({
    // on session creation add a session document to the 
    // sessions collection with the id of the new session
    session: function() {
      var ret = Sessions.insert({id: Session.CURRENT_ID.get(), connected: false});
    },

    // on new connection update the session document 
    connect: function() {
      Sessions.update({id: Session.CURRENT_ID.get()}, {$set: {connected: true}});
    },

    // on disconnection update the session document
    disconnect: function() {
      Sessions.update({id: Session.CURRENT_ID.get()}, {$set: {connected: false}});
    },

    // when session is destroyed remove it from collection
    destroy: function() {
      Sessions.remove({id: Session.CURRENT_ID.get()});
    }
  })

  Meteor.startup(function () {
    Sessions.remove({});

    // create environment variable for current session id
    Session.CURRENT_ID = new Meteor.EnvironmentVariable;

    // set the current session id environment variable whenever a livedata
    // session startsup a new fiber
    Meteor.use(function(session,next) {
      Session.CURRENT_ID.withValue(session.id,next);
    });
  });
}
