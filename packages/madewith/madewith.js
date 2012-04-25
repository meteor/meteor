(function () {
  // Duplicated in the madewith app (search for #DisplayAppName in
  // https://github.com/meteor/madewith)
  // XXX - Can this code somehow be shared reasonably?
  var displayAppName = function (name) {
    var parts = name.split('.');
    if (parts.length === 3 && parts[1] === 'meteor' && parts[2] === 'com')
      return parts[0];
    else
      return name;
  };

  // automatically capture this app's hostname
  var hostname = window.location.host;
  var shortname = displayAppName(hostname);

  // connect to madewith and subscribe to my app's record
  var server = Meteor.connect("http://madewith.meteor.com/sockjs");
  var sub = server.subscribe("myApp", hostname);

  // minimongo collection to hold my singleton app record.
  var apps = new Meteor.Collection('madewith_apps', server);

  server.methods({
    vote: function (hostname) {
      apps.update({name: hostname}, {$inc: {vote_count: 1}});
    }
  });

  Template.madewith.vote_count = function() {
    var app = apps.findOne();
    return app ? app.vote_count : '???';
  };

  Template.madewith.shortname = function () {
    return shortname;
  };

  Template.madewith.events = {
    'click .madewith_upvote': function(event) {
      var app = apps.findOne();
      if (app) {
        server.call('vote', hostname);
        // stop these so you don't click through the link to go to the
        // app.
        event.stopPropagation();
        event.preventDefault();
      }
    }
  };
})();