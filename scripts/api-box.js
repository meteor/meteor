/* global hexo */

var path = require('path');
var fs = require('fs');
var handlebars = require('handlebars');
var _ = require('underscore');
var nameToId = require(path.join(__dirname, 'nameToId.js'));
var showdown  = require('showdown');
var converter = new showdown.Converter();

// can't put this file in this folder annoyingly
var html = fs.readFileSync(path.join(__dirname, '..', 'assets', 'api-box.html'), 'utf8');
var template = handlebars.compile(html);

if (!hexo.config.api_box || !hexo.config.api_box.data_file) {
  throw new Error("You need to provide the location of the api box data file in config.api_box.data_file");
}

var dataPath = path.join(hexo.base_dir, hexo.config.api_box.data_file);
var DocsData = require(dataPath);

hexo.extend.tag.register('apibox', function(args) {
  var name = args[0];
  var nested = !!args[1];
  var data = _.extend({ nested: nested }, apiData({ name: name }));

  if (nameToId[data.longname]) {
    data.id = nameToId[data.longname];
  } else {
    // fallback
    data.id = data.longname.replace(/[.#]/g, "-");
  }

  data.name = signature(data);
  data.importName = importName(data);
  data.paramsNoOptions = paramsNoOptions(data);

  return template(data);
});


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

var signature = function (data) {
  var signature;
  var escapedLongname = _.escape(data.longname);

  if (data.istemplate || data.ishelper) {
    if (data.istemplate) {
      signature = "{{> ";
    } else {
      signature = "{{ ";
    }

    signature += escapedLongname;

    var params = data.params;

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
    if (data.scope === "instance") {
      beforeParens = "<em>" + apiData(data.memberof).instancename + "</em>." + data.name;
    } else if (data.kind === "class") {
      beforeParens = "new " + escapedLongname;
    } else {
      beforeParens = escapedLongname;
    }

    signature = beforeParens;

    // if it is a function, and therefore has arguments
    if (_.contains(["function", "class"], data.kind)) {
      var params = data.params;

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
};

var importName = function(doc) {
  const noImportNeeded = !doc.module
    || doc.scope === 'instance'
    || doc.ishelper
    || doc.istemplate;

  // override the above we've explicitly decided to (i.e. Template.foo.X)
  if (!noImportNeeded || doc.importfrompackage) {
    if (doc.memberof) {
      return doc.memberof.split('.')[0];
    } else {
      return doc.name;
    }
  }
};

var paramsNoOptions = function (doc) {
  return _.reject(doc.params, function (param) {
    return param.name === "options";
  });
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
  MatchPattern: typeLink("Match Pattern", "#matchpatterns"),
  "DDP.Connection": typeLink("DDP Connection", "#ddp_connect")
};

handlebars.registerHelper('typeNames', function typeNames (nameList) {
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
});

handlebars.registerHelper('markdown', function(text) {
  return converter.makeHtml(text);
});
