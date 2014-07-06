Meteor.startup(function(){
    Meteor.call('syncCookie', document.cookie);
});