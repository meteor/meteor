Tracker.autorun(function () {
  // returns a "location" like object with all of the url parts
  var current = Iron.Location.get();

  console.log(current);
  if (current.path === "/basic") {
    Session.set("fullApi", false);
  } else if (current.path === "/full") {
    Session.set("fullApi", true);
  } else {
    if (current.hash) {
      // XXX COMPAT WITH old docs
      Iron.Location.go("/full");
    } else {
      Iron.Location.go("/basic");
    }
  }

  Tracker.afterFlush(function () {
    setTimeout(function () {
      console.log($(".main-content").offset(), $(current.hash).offset());
      $(".main-content").animate({
          scrollTop: $(".main-content").scrollTop() + $(current.hash).offset().top
      }, 1000);
    }, 0);
  });
});