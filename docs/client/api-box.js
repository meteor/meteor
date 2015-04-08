var apiData = function (options) {
  options = options || {};
  if (typeof options === "string") {
    options = {name: options};
  }

  var root = DocsData[options.name];

  if (! root) {
    console.log("API Data not found: " + options.name);
  }

  if (_.has(options, 'options')) {
    root = _.clone(root);
    var includedOptions = options.options.split(';');
    root.options = _.filter(root.options, function (option) {
      return _.contains(includedOptions, option.name);
    });
  }

  return root;
};

var typeLink = function (displayName, url) {
  return "<a href='" + url + "'>" + displayName + "</a>";
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
  EJSON: typeLink("EJSON-able Object", "#ejson"),
  EJSONable: typeLink("EJSON-able Object", "#ejson"),
  "Tracker.Computation": typeLink("Tracker.Computation", "#tracker_computation"),
  MongoSelector: [
    typeLink("Mongo Selector", "#selectors"),
    typeLink("Object ID", "#mongo_object_id"),
    "String"
  ],
  MongoModifier: typeLink("Mongo Modifier", "#modifiers"),
  MongoSortSpecifier: typeLink("Mongo Sort Specifier", "#sortspecifiers"),
  MongoFieldSpecifier: typeLink("Mongo Field Specifier", "#fieldspecifiers"),
  JSONCompatible: "JSON-compatible Object",
  EventMap: typeLink("Event Map", "#eventmaps"),
  DOMNode: typeLink("DOM Node", "https://developer.mozilla.org/en-US/docs/Web/API/Node"),
  "Blaze.View": typeLink("Blaze.View", "#blaze_view"),
  Template: typeLink("Blaze.Template", "#blaze_template"),
  DOMElement: typeLink("DOM Element", "https://developer.mozilla.org/en-US/docs/Web/API/element"),
  MatchPattern: typeLink("Match Pattern", "#matchpatterns")
};

Template.autoApiBox.helpers({
  apiData: apiData,
  typeNames: function typeNames (nameList) {
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

      if (DocsData[name]) {
        return typeNames(DocsData[name].type);
      }

      return name;
    });

    nameList = _.flatten(nameList);

    return toOrSentence(nameList);
  },
  signature: function () {
    var signature;
    var escapedLongname = _.escape(this.longname);

    if (this.istemplate || this.ishelper) {
      if (this.istemplate) {
        signature = "{{> ";
      } else {
        signature = "{{ ";
      }

      signature += escapedLongname;

      var params = this.params;

      var paramNames = _.map(params, function (param) {
        var name = param.name;

        name = name + "=" + name;

        if (param.optional) {
          return "[" + name + "]";
        }

        return name;
      });

      signature += " " + paramNames.join(" ");

      signature += " }}";
    } else {
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
    }

    return signature;
  },
  id: function () {
    if (Session.get("fullApi") && nameToId[this.longname]) {
      return nameToId[this.longname];
    }

    // fallback
    return this.longname.replace(/[.#]/g, "-");
  },
  paramsNoOptions: function () {
    return _.reject(this.params, function (param) {
      return param.name === "options";
    });
  },
  fullApi: function () {
    return Session.get("fullApi");
  }
});

Template.apiBoxTitle.helpers({
  link: function () {
    return '#/' + (Session.get("fullApi") ? 'full' : 'basic') + '/' + this.id;
  }
});

Template.autoApiBox.onRendered(function () {
  this.$('pre code').each(function(i, block) {
    hljs.highlightBlock(block);
  });
});

