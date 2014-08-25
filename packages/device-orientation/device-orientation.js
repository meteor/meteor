var headingDep = new Deps.Dependency();
var heading = null;
var headingRefresh = false;

var callback = function (newHeading) {
  heading = newHeading;
  headingDep.changed();
};

var throttled = _.throttle(callback, 100);

var enableHeadingRefresh = function () {
  if (! headingRefresh && navigator.compass) {
    navigator.compass.watchHeading(throttled);
    headingRefresh = true;
  }
};

document.addEventListener("deviceready", enableHeadingRefresh);

DeviceOrientation = {
  heading: function () {
    headingDep.depend();
    return heading;
  }
};