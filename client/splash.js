Meteor.startup(function () {
  if (!document.cookie.match("splash="))
    $('body').append(Template.splash());
});

Template.splash.events = {
  'click .submit': function () {
    document.cookie = "splash=ack;expires=Sat, 23 Mar 2013 00:00:0 GMT";
    $('#splash_outer').remove();
  }
};
