Tracker.autorun(function () {
  // returns a "location" like object with all of the url parts
  var current = Iron.Location.get();

  // redirect routes with no trailing slash
  if (current.path === "/basic") {
    Iron.Location.go("/basic/");
    return;
  } else if (current.path === "/full") {
    Iron.Location.go("/full/");
    return;
  }

  if (current.path === "/basic/") {
    Session.set("fullApi", false);
  } else if (current.path === "/full/") {
    Session.set("fullApi", true);
  } else {
    if (current.hash) {
      // XXX COMPAT WITH old docs
      Iron.Location.go("/full/");
    } else {
      Iron.Location.go("/basic/");
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
            targetLocation = $(".main-content").scrollTop() + foundElement.offset().top;
          }
        }

        $(".main-content").animate({
            scrollTop: targetLocation
        }, 1000);
      }, 0);
    });
  }
});