var gju = GeoJSON;

Tinytest.add("geojson-utils - line intersects", function (test) {
  var diagonalUp = { "type": "LineString","coordinates": [
    [0, 0], [10, 10]
  ]}
  var diagonalDown = { "type": "LineString","coordinates": [
    [10, 0], [0, 10]
  ]}
  var farAway = { "type": "LineString","coordinates": [
    [100, 100], [110, 110]
  ]}

  test.isTrue(gju.lineStringsIntersect(diagonalUp, diagonalDown));
  test.isFalse(gju.lineStringsIntersect(diagonalUp, farAway));
});

// Used by two tests
var box = {
  "type": "Polygon",
  "coordinates": [
    [ [0, 0], [10, 0], [10, 10], [0, 10] ]
  ]
};

Tinytest.add("geojson-utils - inside/outside of the box", function (test) {

  var inBox = {"type": "Point", "coordinates": [5, 5]}
  var outBox = {"type": "Point", "coordinates": [15, 15]}

  test.isTrue(gju.pointInPolygon(inBox, box));
  test.isFalse(gju.pointInPolygon(outBox, box));
});

Tinytest.add("geojson-utils - drawCircle", function (test) {
  test.length(gju.drawCircle(10, {"type": "Point", "coordinates": [0, 0]}).
               coordinates[0], 15);
  test.length(gju.drawCircle(10, {"type": "Point", "coordinates": [0, 0]}, 50).
              coordinates[0], 50);
});

Tinytest.add("geojson-utils - centroid", function (test) {
  var centroid = gju.rectangleCentroid(box)
  test.equal(centroid.coordinates[0], 5);
  test.equal(centroid.coordinates[1], 5);
});

Tinytest.add("geojson-utils - point distance", function (test) {
  var fairyLand = {"type": "Point",
    "coordinates": [37.80919060818706, -122.260000705719]}
  var navalBase = {"type": "Point",
    "coordinates": [37.78774223089045, -122.32083320617676]}
  test.equal(Math.floor(gju.pointDistance(fairyLand, navalBase)), 5852);
});

