import './info.html';
import { Links } from '/imports/api/links/links.js'
import { Meteor } from 'meteor/meteor'

Template.info.onCreated(function infoOnCreated() {
  Meteor.subscribe('links.all');
});

Template.info.helpers({
  links() {
    return Links.find({});
  },
});

Template.info.events({
  'submit .info-link-add': function (e){
    e.preventDefault();

    const target = e.target;
    const title = target.title;
    const url = target.url;

    Meteor.call('links.insert', title.value, url.value, function (error) {
      if(error){
        alert(error.error);
      }
      else{
        title.value = '';
        url.value = '';
      }
    });
  }
})
