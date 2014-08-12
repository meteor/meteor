var headingDep = new Deps.Dependency();
var heading = null;
var headingRefresh = false;

var lastHeading = 0;
var callback = function (newHeading) {
  heading = newHeading;
  headingDep.changed();

  if (heading) {
    lastHeading = heading.magneticHeading;
  }
};

var throttled = _.throttle(callback, 100);

var enableHeadingRefresh = function () {
  if (! headingRefresh && navigator.compass) {
    navigator.compass.watchHeading(throttled);
    headingRefresh = true;
  }
};

document.addEventListener("deviceready", enableHeadingRefresh);

var fps = 60;
var speedFactor = 0.005;
var velocity = 0;
var damping = 0.3;
var curAngle = 0;
var curAngleDep = new Deps.Dependency();

var frame = function () {
  var distance = curAngle - lastHeading;
  if (distance > 180) {
    distance = 360 - distance;
  } else if (distance < -180) {
    distance = 360 + distance;
  }

  var accel = -distance * speedFactor;
  velocity = velocity * (1 - damping) + accel;
  curAngle = curAngle + velocity;
  curAngle = curAngle % 360;
  curAngleDep.changed();
  console.log(distance);
};

setInterval(frame, 1000 / fps);

DeviceOrientation = {
  heading: function () {
    headingDep.depend();
    return heading;
  },
  smoothedHeading: function () {
    curAngleDep.depend();
    return curAngle;
  }
};