var _ = require('underscore');
var files = require('./files.js');

// scheme - Object, representing paths to correct. Ex.:
// {
//   format: false,
//   arch: false,
//   load: [
//     {
//       node_modulus: true,
//       sourceMap: true,
//       sourceMapRoot: true,
//       path: true
//     }
//   ]
// }
var convertByScheme = function (val, scheme) {
  if (scheme === true)
    return convert(val);
  else if (scheme === false)
    return val;

  if (_.isArray(scheme)) {
    if (! _.isArray(val))
      throw new Error("Expected an array");

    return _.map(val, function (subval, i) {
      return convertByScheme(subval, scheme[0]);
    });
  }

  if (! _.isObject(scheme))
    throw new Error("Unexpected type of scheme: " + typeof(scheme));

  var ret = _.clone(val);
  _.each(scheme, function (subscheme, key) {
    if (_.has(ret, key))
      ret[key] = convertByScheme(val[key], subscheme);
  });

  return ret;
};

var convert = function (str) {
  return files.adaptLegacyPath(str);
};

var ISOPACK_SCHEME = {
  builds: [{
    path: true
  }],
  plugins: [{
    path: true
  }]
};

var UNIBUILD_SCHEME = {
  node_modules: true,
  resources: [{
    file: true,
    sourceMap: true,
    servePath: true
  }]
};

var JAVASCRIPT_IMAGE_SCHEME = {
  load: [{
    sourceMap: true,
    sourceMapRoot: true,
    path: true,
    node_modules: true
  }]
};

exports.convertIsopack = function (data) {
  return convertByScheme(data, ISOPACK_SCHEME);
};

exports.convertUnibuild = function (data) {
  return convertByScheme(data, UNIBUILD_SCHEME);
};

exports.convertJSImage = function (data) {
  return convertByScheme(data, JAVASCRIPT_IMAGE_SCHEME);
};

exports.convert = convert;

