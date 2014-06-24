var script = Assets.getText("safetybelt.js");

Tinytest.add("reload-safetybelt - safety belt is added", function (test) {
  var origInlineScriptsAllowed = WebAppInternals.inlineScriptsAllowed();

  WebAppInternals.setInlineScriptsAllowed(true);
  var resp = HTTP.get(Meteor.absoluteUrl());
  // Safety belt should be inlined.
  test.isTrue(resp.content.indexOf(script) !== -1);

  WebAppInternals.setInlineScriptsAllowed(origInlineScriptsAllowed);
});
