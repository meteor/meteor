import {Meteor} from "meteor/meteor";
import {Session} from "meteor/session";
import {Template} from "meteor/templating";

// This variable is imported by ~name~.tests.js.
export const name = "~name~";

if (Meteor.isClient) {
  // counter starts at 0
  Session.setDefault('counter', 0);

  Template.hello.helpers({
    counter() {
      return Session.get('counter');
    }
  });

  Template.hello.events({
    'click button'() {
      // increment the counter when button is clicked
      Session.set('counter', Session.get('counter') + 1);
    }
  });
}

if (Meteor.isServer) {
  Meteor.startup(() => {
    // code to run on server at startup
  });
}
