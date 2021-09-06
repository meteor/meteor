/* global hexo */

var path = require('path');
var fs = require('fs');
var handlebars = require('handlebars');
var _ = require('underscore');
var parseTagOptions = require('./parseTagOptions');
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
  var name = args.shift();
  var options = parseTagOptions(args)

  var dataFromApi = apiData({ name: name });

  if (! dataFromApi) {
    throw new Error("Cannot render apibox without API data: " + name);
    return;
  }

  var defaults = {
    // by default, nest if it's a instance method
    nested: name.indexOf('#') !== -1,
    instanceDelimiter: '#'
  };
  var data = _.extend({}, defaults, options, dataFromApi);

  data.id = data.longname.replace(/[.#]/g, "-");

  data.signature = signature(data, { short: false });
  data.title = signature(data, {
    short: true,
    instanceDelimiter: data.instanceDelimiter,
  });
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

signature = function (data, options) {
  var escapedLongname = _.escape(data.longname);

  var paramsStr = '';

  if (!options.short) {
    if (data.istemplate || data.ishelper) {
      var params = data.params;

      var paramNames = _.map(params, function (param) {
        var name = param.name;

        name = name + "=" + name;

        if (param.optional) {
          return "[" + name + "]";
        }

        return name;
      });

      paramsStr = ' ' + paramNames.join(" ") + ' ';
    } else {
      // if it is a function, and therefore has arguments
      if (_.contains(["function", "class"], data.kind)) {
        var params = data.params;

        var paramNames = _.map(params, function (param) {
          if (param.optional) {
            return "[" + param.name + "]";
          }

          return param.name;
        });

        paramsStr= "(" + paramNames.join(", ") + ")";
      }
    }
  }

  if (data.istemplate) {
    return '{{> ' + escapedLongname + paramsStr + ' }}';
  } else if (data.ishelper){
    return '{{ ' + escapedLongname + paramsStr + ' }}';
  } else {
    if (data.kind === "class" && !options.short) {
      escapedLongname = 'new ' + escapedLongname;
    }

    // In general, if we are looking at an instance method, we want to show it as
    //   Something#foo or #foo (if short). However, when it's on something called
    //   `this`, we'll do the slightly weird thing of showing `this.foo` in both cases.
    if (data.scope === "instance") {
      // the class this method belongs to.
      var memberOfData = apiData(data.memberof) || apiData(`${data.memberof}#${data.memberof}`);

      // Certain instances are provided to the user in scope with a specific name
      // TBH I'm not sure what else we use instanceName for (why we are setting for
      // e.g. `reactiveVar` if we don't want to show it here) but we opt into showing it
      if (memberOfData.showinstancename) {
        escapedLongname = memberOfData.instancename + "." + data.name;
      } else if (options.short) {
        // Something#foo => #foo
        return options.instanceDelimiter + escapedLongname.split('#')[1];
      }
    }

    // If the user passes in a instanceDelimiter and we are a static method,
    // we are probably underneath a heading that defines the object (e.g. DDPRateLimiter)
    if (data.scope === "static" && options.instanceDelimiter && options.short) {
      // Something.foo => .foo
      return options.instanceDelimiter + escapedLongname.split('.')[1];
    }

    return escapedLongname + paramsStr;
  }
};

var importName = function(doc) {
  const noImportNeeded = !doc.module
    || doc.scope === 'instance'
    || doc.ishelper
    || doc.isprototype
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
  MongoFieldSpecifier: typeLink("Mongo Field Specifier", "collections.html#fieldspecifiers"),
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

handlebars.registerHelper('hTag', function() {
  return this.nested ? 'h3' : 'h2';
});