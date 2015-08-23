// 'url' is assigned to in a statement before this.
var page = require('webpage').create();

var isReady = function () {
  return page.evaluate(function () {
    if (typeof Meteor === 'undefined'
        || Meteor.status === undefined
        || !Meteor.status().connected) {
      return false;
    }
    if (typeof Package === 'undefined'
        || Package.spiderable === undefined
        || Package.spiderable.Spiderable === undefined) {
      return false;
    }
    
    // Remove all script tags except JSON-LD
    var scriptTags = document.querySelectorAll('script:not([type="application/ld+json"])');
    for (var i = 0; i < scriptTags.length; i++) {
      scriptTags[i].parentNode.removeChild(scriptTags[i]);
    }

    // Remove meta fragment content
    var fragment = document.querySelector('meta[name="fragment"][content="!"]');
    fragment.parentNode.removeChild(fragment);
    
    return Package.spiderable.Spiderable.isReady();
  });
};

page.open(url, function(status) {
  if (status === 'fail')
    phantom.exit();
});

setInterval(function() {
  if (isReady()) {
    console.log(page.content);
    phantom.exit();
  }
}, 100);
