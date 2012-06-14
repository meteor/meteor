sessionDB = new Meteor.Store('sessions');

if (Meteor.is_client) {

  if (!document.cookie || document.cookie == "test") {
    document.cookie = Meteor.uuid();
  }

  Session.set('id',document.cookie);

  Meteor.autosubscribe(function() {
    Meteor.subscribe("session",Session.get('id'));
  });

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

  Template.session.events = {}
  Template.session.events[ okcancel_events('#set-user-box') ] =
    make_okcancel_handler({
      ok: function (text, evt) {
        sessionDB.hset(Session.get('id'),'user',text);
        evt.target.value = "";
      }
    });

  Template.session.events[ okcancel_events('#set-age-box') ] =
    make_okcancel_handler({
      ok: function (text, evt) {
        sessionDB.hset(Session.get('id'),'age',text);
        evt.target.value = "";
      }
    });

  Template.session.events['click #reset-session'] = function() {
    document.cookie = Meteor.uuid();
    Session.set('id',document.cookie);
  }

  Template.session.user = function() {
    var user =  sessionDB.hget(Session.get('id'),'user');
    return user;
  }

  Template.session.age = function() {
    return sessionDB.hget(Session.get('id'),'age');
  }
} else {
  Meteor.publish('session',function(id) {
    return sessionDB.watch(id);
  });
}

if (Meteor.is_server) {
  Meteor.startup(function () {
    // code to run on server at startup
  });
}