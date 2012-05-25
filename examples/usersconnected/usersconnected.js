if (Meteor.is_client) {
  Sessions = new Meteor.Collection('sessions');


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
    var user_counts = {};
    Sessions.find({connected: true, user: {$exists: true}}).forEach(function(session) {
      if (session.user in user_counts)
        user_counts[session.user] ++;
      else 
        user_counts[session.user] = 1;
    });
    return _.map(Object.keys(user_counts),function(key) {
      return {name: key, count: user_counts[key]};
    });
  }

  Template.users.events = {};

  // Attach events to keydown, keyup, and blur on "New list" input box.
  Template.users.events[ okcancel_events('#set-user-box') ] =
    make_okcancel_handler({
      ok: function (text, evt) {
        Sessions.update({id: Session.id},{$set: {user: text}});
        evt.target.value = "";
      }
    });

  console.log(Session.id);
 
}

if (Meteor.is_server) {
  var Sessions = new Meteor.Collection('sessions');


  function autoupdate_session() {
    var context = new Meteor.deps.Context();
    context.on_invalidate(function() {
      autoupdate_users();
    })
    context.run(function() {
      Sessions.update({id: Session.id}, {$set: {connected: Session.status().connected}});
    });
  }
  Meteor.session(function() {
    console.log(Session.id);
    Sessions.insert({id: Session.id});
    autoupdate_session();
  });

  Meteor.startup(function () {
    // code to run on server at startup
  });
}