var Template = Package.templating && Package.templating.Template;

LaunchScreen = {
  hide: function () {
    if (navigator.splashscreen)
      navigator.splashscreen.hide();
  },
  show: function () {
    if (navigator.splashscreen)
      navigator.splashscreen.show();
  },
  startingTemplate: 'body',
  controlManually: false
};

var hideLoadScreenOnTemplateRendered = function (name) {
  if (! Template) return;

  // in case some other package registered a rendered callback
  var oldRendered = Template.body.rendered;

  // XXX will break if some other package or the user-code overrides w/o
  // calling this callback later;
  Template[name].rendered = function () {
    // Hide the load screen after the body template is fully rendered.
    LaunchScreen.hide();
    oldRendered && oldRendered();
  };
};

// on startup it should be clear what templates are there
Meteor.startup(function () {
  if (! Template) return;
  if (Template['__IronDefaultLayout__'])
    LaunchScreen.startingTemplate = '__IronDefaultLayout__';

  if (! LaunchScreen.controlManually)
    hideLoadScreenOnTemplateRendered(LaunchScreen.startingTemplate);
});

