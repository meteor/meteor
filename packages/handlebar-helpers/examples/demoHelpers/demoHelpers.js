var testCollection = new Meteor.Collection('test');

if (Meteor.isClient) {
  Session.set('appTitle', 'Hello handlebar helpers');

  Template.hello.greeting = function () {
    return "Welcome to demoHelpers.";
  };

  Template.hello.events({
    'click .clickTheButton' : function () {
      // template data, if any, is available in 'this'
        Session.set('appTitle', 'You pressed the button');
        testCollection.insert({ name: 'Click', createdAt: Date.now() });
    },
    'click .clickReset' : function () {
      // template data, if any, is available in 'this'
        Session.set('appTitle', 'You pressed the reset button!!');
        testCollection.remove();
    }
  });
}

if (Meteor.isServer) {
  Meteor.startup(function () {
    // code to run on server at startup
  });
}
