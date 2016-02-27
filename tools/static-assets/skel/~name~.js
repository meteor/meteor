if (Meteor.isClient) {
  // counter starts at 0
  let Counter = new ReactiveVar(0);

  Template.hello.helpers({
    counter: function () {
      return Counter.get();
    }
  });

  Template.hello.events({
    'click button': function () {
      // increment the counter when button is clicked
      Counter.set(Counter.get() + 1);
    }
  });
}

if (Meteor.isServer) {
  Meteor.startup(function () {
    // code to run on server at startup
    // remember, in a both-side file, these code will still be sent to client.
  });
}
