if (Meteor.isClient) {
  function f () {
    Meteor.call(
      'output',
      'the number of stylesheets: <' +
      document.querySelectorAll('link[rel=stylesheet]').length + '>');

    Meteor.call(
      'output',
      'the color of the tested 4097th property: <' +
      getComputedStyle(document.querySelectorAll('.class-4097')[0]).color +
      '>');
  };

  Autoupdate._ClientVersions.find().observe({
    added: f,
    changed: f
  });
} else {
  Meteor.methods({
    output: function (text) {
      console.log(text);
    }
  });
}
