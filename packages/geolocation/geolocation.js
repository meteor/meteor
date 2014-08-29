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
  },
  // simple version of location; just lat and lng
  latLng: function () {
    var loc = Geolocation.currentLocation();

    if (loc) {
      return {
        lat: loc.coords.latitude,
        lng: loc.coords.longitude
      };
    }

    return null;
  }
};