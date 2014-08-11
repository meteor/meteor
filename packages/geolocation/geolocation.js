var locationDep = new Deps.Dependency();
var location = null;
var locationRefresh = false;

var options = {
  enableHighAccuracy: true,
  maximumAge: 0
};

var errCallback = function () {
  // do nothing
};

var callback = function (newLocation) {
  location = newLocation;
  locationDep.changed();
};

var enableLocationRefresh = function () {
  if (! locationRefresh && navigator.geolocation) {
    navigator.geolocation.watchPosition(callback, errCallback, options);
    locationRefresh = true;
  }
};

Geolocation = {
  currentLocation: function () {
    enableLocationRefresh();
    locationDep.depend();
    return location;
  }
};