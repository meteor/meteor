// automatically capture this app's hostname
var hostname = window.location.host;
var match = hostname.match(/(.*)\.meteor.com$/);
var shortname = match ? match[1] : hostname;

// connect to madewith and subscribe to my app's record
var server = DDP.connect("madewith.meteor.com");
var sub = server.subscribe("myApp", hostname);

// minimongo collection to hold my singleton app record.
var apps = new Meteor.Collection('madewith_apps', {connection: server});

server.methods({
  vote: function (hostname) {
    // This is a stub, so it doesn't need to call check.
    apps.update({name: hostname}, {$inc: {vote_count: 1}});
  }
});

Template.madewith.vote_count = function() {
  var app = apps.findOne();
  return app ? app.vote_count : '';
};

Template.madewith.shortname = function () {
  return shortname;
};

Template.madewith.events({
  'click .madewith_upvote': function(event) {
    var app = apps.findOne();
    if (app)
      server.call('vote', hostname);

    // stop these so you don't click through the link to go to the
    // app.
    event.stopPropagation();
    event.preventDefault();
  }
});
