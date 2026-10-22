import { Links } from '@api/links/links.js';
import { Meteor } from 'meteor/meteor';
import './info.html';

Template.info.onCreated(function () {
  Meteor.subscribe('links.all');
});

Template.info.helpers({
  links() {
    return Links.find({});
  },
});

Template.info.events({
  'submit .info-link-add'(event) {
    event.preventDefault();

    const target = event.target;
    const title = target.title;
    const url = target.url;

    Meteor.callAsync('links.insert', title.value, url.value)
      .then(() => {
        title.value = '';
        url.value = '';
      })
      .catch((error) => {
        alert(error.error || error.message);
      });
  },
});
