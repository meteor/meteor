if (Meteor.isClient) {
  // counter starts at 0
  let Counter = new ReactiveVar(0);

  Template.hello.helpers({
    counter: () => Counter.get()
  });

  Template.hello.events({
    // increment the counter when button is clicked
    'click button': () => Counter.set(Counter.get() + 1)
  });
}

if (Meteor.isServer) {
  Meteor.startup(() => {
    // code to run on server at startup
    // remember, in a both-side file, these code will still be sent to client.
  });
}
