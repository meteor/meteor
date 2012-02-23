(function() {
  var queue = [];
  var loaded = document.readyState === "loaded" ||
    document.readyState == "complete";

  var ready = function() {
    loaded = true;
    while (queue.length)
      (queue.shift())();
  };

  if (document.addEventListener) {
    document.addEventListener('DOMContentLoaded', ready, false);
    window.addEventListener('load', ready, false);
  } else {
    document.attachEvent('onreadystatechange', function () {
      if (document.readyState === "complete")
        ready();
    });
    window.attachEvent('load', ready);
  }

  Meteor.startup = function (cb) {
    var doScroll = !document.addEventListener &&
      document.documentElement.doScroll;

    if (!doScroll || window !== top) {
      if (loaded)
        cb();
      else
        queue.push(cb);
    } else {
      try { doScroll('left'); }
      catch (e) {
        setTimeout(function() { Meteor.startup(cb); }, 50);
        return;
      };
      cb();
    }
  };
})();
