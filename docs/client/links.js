var ignoreUrlChange = false;
var ignoreWaypoints = true;

var deHash = function (hashString) {
  return hashString.slice(1);
};

Session.setDefault('urlHash', location.hash);
$(window).on('hashchange', function () {
  Session.set('urlHash', location.hash);
});

// need an actual function to only debounce inside the if statement
var actuallyUpdateUrl = _.debounce(function (el) {
  var docsType = Session.get("fullApi") ? "full" : "basic";
  var newHash = "#/" + docsType + "/" + el.id;

  if (window.location.hash !== newHash) {
    ignoreUrlChange = true;
    window.location.replace(newHash);
  }
}, 100);

var updateUrlFromWaypoint = function (el) {
  if (! ignoreWaypoints) {
    actuallyUpdateUrl(el);
  }
};

Meteor.startup(function () {
  Tracker.autorun(function () {
    var docsType = Session.get("fullApi") ? "full" : "basic";
    Tracker.afterFlush(function () {
      $.waypoints('destroy');

      // XXX this timeout is a temporary hack to yield more before setting the
      // waypoints.
      setTimeout(function () {
        $('.main-content :not(.hidden) [id]').each(function (i, el) {
          if (! $("#nav [href='#/" + docsType + '/' + el.id + "']").get(0)) {
            // only add waypoints to things that have sidebar links
            return;
          }

          $(el).waypoint(function() {
            updateUrlFromWaypoint(this);
          }, { context: $('.main-content'), offset: -50 });
        });
      }, 0);
    });
  });
});

Tracker.autorun(function () {
  // returns a "location" like object with all of the url parts
  var current = Session.get('urlHash');

  // If the URL changes from a waypoint, do nothing
  if (ignoreUrlChange) {
    ignoreUrlChange = false;
    return;
  }

  // If the URL changes, close the sidebar
  Session.set("sidebarOpen", false);

  // redirect routes with no trailing slash
  if (current === "#/basic") {
    navigate("#/basic/");
    return;
  } else if (current === "#/full") {
    navigate("#/full/");
    return;
  }

  if (current.match(/^#\/basic\//)) {
    Session.set("fullApi", false);
  } else if (current.match(/^#\/full\//)) {
    Session.set("fullApi", true);
  } else {
    if (current) {
      // XXX COMPAT WITH old docs
      navigate("#/full/" + deHash(current));
    } else {
      navigate("#/basic/");
    }
    return;
  }

  Tracker.afterFlush(function () {
    setTimeout(function () {
      var id = current.split('/')[2];

      var targetLocation = 0;
      if (id) {
        // XXX this selector is tied to the structure of the document so tightly
        // because sometimes we have two elements with the same id.
        // For example: "Quick start" section appears in both basic docs and full
        // docs. Since we hide parts of DOM with CSS the user doesn't see both at
        // the same time but they are still both in the DOM. New browsers allow us
        // to query by id even if ids repeat themselves. We cannot change it
        // easily because the markdown parser always produces an id for headings.
        var selector = "#main>:not(.hidden) #" + id;
        var foundElement = $(selector);
        if (foundElement.get(0)) {
          targetLocation = $(".main-content").scrollTop() + foundElement.offset().top - $(".main-content").offset().top;
        }
      }

      ignoreWaypoints = true;
      $(".main-content").animate({
          scrollTop: targetLocation
      }, 500, function () {
        ignoreWaypoints = false;
      });
    }, 0);
  });
});
