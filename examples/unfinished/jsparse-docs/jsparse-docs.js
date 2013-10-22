

if (Meteor.isClient) {
  Template.page.nodespec = function (fn) {
    var parts = [fn()];
    var replaceParts = function(regex, replacementFunc) {
      var newParts = [];
      _.each(parts, function (part) {
        if (typeof part !== 'string') {
          newParts.push(part);
          return;
        }
        regex.lastIndex = 0;
        var charsTaken = 0;
        var matchResult;
        while ((matchResult = regex.exec(part))) {
          var matchIndex = matchResult.index;
          if (matchIndex > charsTaken)
            newParts.push(part.substring(charsTaken, matchIndex));
          charsTaken = regex.lastIndex;
          var replacementParts = replacementFunc(matchResult);
          newParts.push.apply(newParts, _.toArray(replacementParts));
        }
        if (charsTaken < part.length)
          newParts.push(part.slice(charsTaken));
      });
      parts = newParts;
    };

    parts.unshift(['<div class="nodespec">']);
    parts.push(['</div>']);
    replaceParts(/".*?"/g, function (match) {
      return [['<span class="str">', Handlebars._escape(match[0]), '</span>']];
    });
    replaceParts(/`(.*?)`/g, function (match) {
      return [['<span class="token">', Handlebars._escape(match[1]), '</span>']];
    });
    replaceParts(/[A-Z]{3,}/g, function (match) {
      return [['<span class="tokentype">', Handlebars._escape(match[0]), '</span>']];
    });
    replaceParts(/[a-z]\w*/g, function (match) {
      return [['<span class="ref">', Handlebars._escape(match[0]), '</span>']];
    });
    replaceParts(/[\[\]()|.,*?]/g, function (match) {
      return [['<span class="punc">'], match[0], ['</span>']];
    });
    replaceParts(/,/g, function (match) {
      return [['<span class="comma">'], match[0], ['</span>']];
    });
    replaceParts(/\|/g, function (match) {
      return [['<span class="or">'], match[0], ['</span>']];
    });

    var html = _.map(parts, function (part) {
      if (typeof part === "string")
        return Handlebars._escape(part);
      return part.join('');
    }).join('');

    return new Handlebars.SafeString(html);
  };

  Template.page.spacer = function () {
    return new Handlebars.SafeString('<div class="spacer">&nbsp;</div>');
  };

}
