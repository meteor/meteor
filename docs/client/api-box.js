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

Template.autoApiBox.helpers({
  apiData: apiData,
  typeNames: function (nameList) {
    // change names if necessary
    nameList = _.map(nameList, function (name) {
      if (name === "function") {
        return "Function";
      } else if (name === "EJSONable") {
        return "EJSON-able object";
      }

      return name;
    });

    return nameList.join(" or ");
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
    if (this.scope === "instance") {
      return apiData(this.memberof).instancename + "_" + this.name;
    }

    return this.longname.replace(".", "_").toLowerCase();
  },
  paramsNoOptions: function () {
    return _.reject(this.params, function (param) {
      return param.name === "options";
    });
  }
});