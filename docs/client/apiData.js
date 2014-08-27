apiData = function (longname) {
  var root = DocsData;

  _.each(longname.split("."), function (pathSegment) {
    root = root[pathSegment];
  });

  if (! root) {
    console.log("API Data not found: " + longname);
  }

  return root;
};

idForLongname = function (longname) {
  return longname.replace(/#|\./g, "-");
};
