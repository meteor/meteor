if (Meteor.isClient) {
  Meteor.startup(function () {
    ['production_css', 'development_css'].forEach(cls => {
      var color = getComputedStyle(document.querySelectorAll('.' + cls)[0]).color;
      Meteor.call('print', cls + ': ' + color);
    });

    // this log is expected to be transformed by minifier
    Meteor.call('print', 'Message (client): foo');
  });
} else {
  Meteor.startup(function () {
    // since we don't run minifiers for server targets, this is going
    // to be printed as "foo" and not as "production_js" or
    // "development_js"
    console.log('Message: foo');
  });

  Meteor.methods({
    print: function (message) {
      console.log(message);
    }
  });
}
