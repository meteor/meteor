if (Package.markdown) {
  var decodeEntitiesAndHighlight;

  if (Meteor.isClient) {
    decodeEntitiesAndHighlight = function (codeWithEntities) {
      var decoded = $('<div/>').html(codeWithEntities).text();
      return hljs.highlightAuto(decoded);
    };
  } else {
    var entities = Npm.require("html-entities").XmlEntities;
    entities = new entities();
    decodeEntitiesAndHighlight = function (codeWithEntities) {
      var decoded = entities.decode(codeWithEntities);
      return hljs.highlightAuto(decoded);
    };
  }

  var oldConstructor = Package.markdown.Showdown.converter;

  Package.markdown.Showdown.converter = function (options) {
    var converter = new oldConstructor(options);
    var oldMakeHtml = converter.makeHtml;

    converter.makeHtml = function (text) {
      text = oldMakeHtml(text);

      text = text.replace(/<pre><code>([\s\S]*?)<\/code><\/pre>/g, function (fullBlock, codeOnly) {
        var result = decodeEntitiesAndHighlight(codeOnly);
        return "<pre><code class='hljs " + result.language + "'>" + result.value + "</code></pre>";
      });

      return text;
    };

    return converter;
  };
}