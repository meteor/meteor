var apiData = function (longname) {
  var root = DocsData;

  _.each(longname.split("."), function (pathSegment) {
    root = root[pathSegment];
  });

  if (! root) {
    console.log("API Data not found: " + longname);
  }

  return root;
};

var typeLink = function (displayName, id) {
  return "<a href='#" + id + "'>" + displayName + "</a>";
};

var toOrSentence = function (array) {
  if (array.length === 1) {
    return array[0];
  } else if (array.length === 2) {
    return array.join(" or ");
  }

  return _.initial(array).join(", ") + ", or " + _.last(array);
};

var typeNameTranslation = {
  "function": "Function",
  EJSON: typeLink("EJSON-able Object", "ejson"),
  EJSONable: typeLink("EJSON-able Object", "ejson"),
  "Tracker.Computation": typeLink("Tracker.Computation", "tracker_computation"),
  MongoSelector: [
    typeLink("Mongo Selector", "selectors"),
    typeLink("Object ID", "mongo_object_id"),
    "String"
  ],
  MongoModifier: typeLink("Mongo Modifier", "modifiers"),
  MongoSortSpecifier: typeLink("Mongo Sort Specifier", "sortspecifiers"),
  MongoFieldSpecifier: typeLink("Mongo Field Specifier", "fieldspecifiers"),
  JSONCompatible: "JSON-compatible Object",
  EventMap: typeLink("Event Map", "eventmaps"),
  DOMNode: "DOM Node",
  "Blaze.View": typeLink("Blaze.View", "blaze_view"),
  Template: typeLink("Blaze.Template", "blaze_template")
};

Template.autoApiBox.helpers({
  apiData: apiData,
  typeNames: function (nameList) {
    // change names if necessary
    nameList = _.map(nameList, function (name) {

      // decode the "Array.<Type>" syntax
      if (name.slice(0, 7) === "Array.<") {
        // get the part inside angle brackets like in Array<String>
        name = name.match(/<([^>]+)>/)[1];

        if (name && typeNameTranslation.hasOwnProperty(name)) {
          return "Array of " + typeNameTranslation[name] + "s";
        }

        if (name) {
          return "Array of " + name + "s";
        }

        console.log("no array type defined");
        return "Array";
      }

      if (typeNameTranslation.hasOwnProperty(name)) {
        return typeNameTranslation[name];
      }

      return name;
    });

    nameList = _.flatten(nameList);

    return toOrSentence(nameList);
  },
  signature: function () {
    var signature;
    var escapedLongname = _.escape(this.longname);

    var beforeParens;
    if (this.scope === "instance") {
      beforeParens = "<em>" + apiData(this.memberof).instancename + "</em>." + this.name;
    } else if (this.kind === "class") {
      beforeParens = "new " + escapedLongname;
    } else {
      beforeParens = escapedLongname;
    }

    signature = beforeParens;

    // if it is a function, and therefore has arguments
    if (_.contains(["function", "class"], this.kind)) {
      var params = this.params;

      var paramNames = _.map(params, function (param) {
        if (param.optional) {
          return "[" + param.name + "]";
        }

        return param.name;
      });

      signature += "(" + paramNames.join(", ") + ")";
    }

    return signature;
  },
  link: function () {
    if (nameToId[this.longname]) {
      return nameToId[this.longname];
    }

    // fallback
    return this.longname.replace(".", "-");
  },
  paramsNoOptions: function () {
    return _.reject(this.params, function (param) {
      return param.name === "options";
    });
  }
});
