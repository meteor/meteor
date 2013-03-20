if (Meteor.isClient) {
  Template.hello.greeting = function () {
    if (Meteor.release)
      return "Welcome to Meteor " + Meteor.release + "!";
    return "Welcome to Meteor!";
  };

  Template.hello.events({
    'click input' : function () {
      // template data, if any, is available in 'this'
      if (typeof console !== 'undefined')
        console.log("You pressed the button");
    }
  });
}

if (Meteor.isServer) {
  Meteor.startup(function () {
    // code to run on server at startup
  });
}
