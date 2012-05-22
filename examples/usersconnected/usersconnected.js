if (Meteor.is_client) {
  var Users = new Meteor.Collection("users");

  Session.set('user',null);

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
    Users.find({}).forEach(function(user) {
      if (user.name in user_counts)
        user_counts[user.name] ++;
      else 
        user_counts[user.name] = 1;
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
        if (!Session.equals('user',null))
          Users.remove('users',Users.remove(Session.get('user')));
        Session.set('user',Users.insert({name: text}))
        Meteor.call('remove_on_disconnect',Session.get('user'));
        evt.target.value = "";
      }
    });
 
}

if (Meteor.is_server) {
  var Users = new Meteor.Collection("users");

  Meteor.methods({
    set_user: function(user_id) {
      Session.set('user',user_id);
    }
  })
  Meteor.session(function(s) {
    var context = new Meteor.deps.Context();
      context.on_invalidate(function() {
        Users.remove(user_id);
        console.log('remove');
      })
      context.run(function() {
        if (s.status().connected) {
          Users.insert({name: Session.get('user')});
        } else {
          Users.remove(Session.get('user'));
        }
      })
  });

  Meteor.startup(function () {
    // code to run on server at startup
  });
}