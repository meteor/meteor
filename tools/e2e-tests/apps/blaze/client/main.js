import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';

import './main.html';
import './each-stale.js';

Template.hello.onCreated(function helloOnCreated() {
  // counter starts at 0
  this.counter = new ReactiveVar(0);
});

Template.hello.helpers({
  counter() {
    return Template.instance().counter.get();
  },
});

Template.hello.events({
  'click button'(event, instance) {
    // increment the counter when button is clicked
    instance.counter.set(instance.counter.get() + 1);
  },
});

Template.eventScopeCollisionParent.helpers({ show: () => true });

for (const template of [Template.eventScopeCollisionChild, Template.eventScopeDirectChild]) {
  template.onCreated(function () {
    this.eventState = new ReactiveVar({ count: 0, currentTarget: '' });
  });

  template.helpers({
    show: () => true,
    count: () => Template.instance().eventState.get().count,
    currentTarget: () => Template.instance().eventState.get().currentTarget,
  });

  template.events({
    'click .js-hit'(event, instance) {
      instance.eventState.set({
        count: instance.eventState.get().count + 1,
        currentTarget: event.currentTarget.className,
      });
    },
  });
}
