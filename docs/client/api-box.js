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

Template.autoApiBox.helpers({
  apiData: apiData,
  typeNames: function (nameList) {
    // change names if necessary
    nameList = _.map(nameList, function (name) {
      if (name === "function") {
        return "Function";
      } else if (name === "EJSONable" || name === "EJSON") {
        return typeLink("EJSON-able Object", "ejson");
      } else if (name === "Tracker.Computation") {
        return typeLink("Tracker.Computation", "tracker_computation");
      } else if (name === "MongoSelector") {
        return [
          typeLink("Mongo Selector", "selectors"),
          typeLink("Object ID", "mongo_object_id"),
          "String"
        ];
      } else if (name === "MongoModifier") {
        return typeLink("Mongo Modifier", "modifiers");
      } else if (name === "MongoSortSpecifier") {
        return typeLink("Mongo Sort Specifier", "sortspecifiers");
      } else if (name === "MongoFieldSpecifier") {
        return typeLink("Mongo Field Specifier", "fieldspecifiers");
      } else if (name === "JSONCompatible") {
        return "JSON-compatible Object";
      }

      return name;
    });

    nameList = _.flatten(nameList);

    return toOrSentence(nameList);
  },
  signature: function () {
    var signature;

    var beforeParens;
    if (this.scope === "instance") {
      beforeParens = "<em>" + apiData(this.memberof).instancename + "</em>." + this.name;
    } else if (this.kind === "class") {
      beforeParens = "new " + this.longname;
    } else {
      beforeParens = this.longname;
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
