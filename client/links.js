var ignoreWaypoints = false;
var triggeredFromWaypoint = {};

Meteor.startup(function () {
  setTimeout(function () {
    $('.main-content [id]').waypoint(function() {
      if (! ignoreWaypoints) {
        triggeredFromWaypoint["#" + this.id] = true;
        window.location.replace("#" + this.id);
      }
    }, { context: $('.main-content') });
  }, 2000);
});

Tracker.autorun(function () {
  // returns a "location" like object with all of the url parts
  var current = Iron.Location.get();

  // If the URL changes from a waypoint, do nothing
  if (triggeredFromWaypoint[current.hash]) {
    triggeredFromWaypoint[current.hash] = false;
    return;
  }

  // If the URL changes, close the sidebar
  Session.set("sidebarOpen", false);

  // redirect routes with no trailing slash
  if (current.path === "/basic") {
    window.location.replace("/basic/");
    return;
  } else if (current.path === "/full") {
    window.location.replace("/full/");
    return;
  }

  if (current.path === "/basic/") {
    Session.set("fullApi", false);
  } else if (current.path === "/full/") {
    Session.set("fullApi", true);
  } else {
    if (current.hash) {
      // XXX COMPAT WITH old docs
      window.location.replace("/full/");
    } else {
      window.location.replace("/basic/");
    }
  }

  if (current.hash) {
    Tracker.afterFlush(function () {
      setTimeout(function () {
        var targetLocation;

        if (current.hash === "#top") {
          targetLocation = 0;
        } else {
          var foundElement = $(current.hash);
          if (foundElement.get(0)) {
            targetLocation = $(".main-content").scrollTop() + foundElement.offset().top - $(".main-content").offset().top - 10;
          }
        }

        ignoreWaypoints = true;
        $(".main-content").animate({
            scrollTop: targetLocation
        }, 1000, function () {
          ignoreWaypoints = false;
        });
      }, 0);
    });
  }
});