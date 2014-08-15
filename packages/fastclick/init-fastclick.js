Meteor.startup(function () {
  window.addEventListener('load', function() {
      FastClick.attach(document.body);
  }, false);
});