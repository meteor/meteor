var ignoreUrlChange = false;
var ignoreWaypoints = false;

var deHash = function (hashString) {
  return hashString.slice(1);
};

// need an actual function to only debounce inside the if statement
var actuallyUpdateUrl = _.debounce(function (el) {
  var docsType = Session.get("fullApi") ? "full" : "basic";
  ignoreUrlChange = true;
  window.location.replace("#/" + docsType + "/" + el.id);
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
      $('.main-content [id]').each(function (i, el) {
        if (! $("#nav [href='#/" + docsType + '/' + el.id + "']").get(0)) {
          // only add waypoints to things that have sidebar links
          return;
        }

        $(el).waypoint(function() {
          updateUrlFromWaypoint(this);
        }, { context: $('.main-content') });
      });
    });
  });
});

Tracker.autorun(function () {
  // returns a "location" like object with all of the url parts
  var current = Iron.Location.get();

  // If the URL changes from a waypoint, do nothing
  if (ignoreUrlChange) {
    ignoreUrlChange = false;
    return;
  }

  // If the URL changes, close the sidebar
  Session.set("sidebarOpen", false);

  // redirect routes with no trailing slash
  if (current.hash === "#/basic") {
    window.location.replace("#/basic/");
    return;
  } else if (current.hash === "#/full") {
    window.location.replace("#/full/");
    return;
  }

  if (current.hash.match(/^#\/basic\//)) {
    Session.set("fullApi", false);
  } else if (current.hash.match(/^#\/full\//)) {
    Session.set("fullApi", true);
  } else {
    if (current.hash) {
      // XXX COMPAT WITH old docs
      window.location.replace("#/full/" + deHash(current.hash));
    } else {
      window.location.replace("#/basic/");
    }
  }

  Tracker.afterFlush(function () {
    setTimeout(function () {
      var targetLocation;

      var id = current.hash.split('/')[2];

      if (! id) {
        id = "top";
      }

      var selector = '#' + id;
      var foundElement = $(selector);
      if (foundElement.get(0)) {
        targetLocation = $(".main-content").scrollTop() + foundElement.offset().top - $(".main-content").offset().top;
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
