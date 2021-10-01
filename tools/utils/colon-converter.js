var _ = require('underscore');

// schema - Object, representing paths to correct. Ex.:
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
var convertBySchema = function (val, schema) {
  if (schema === true) {
    return convert(val);
  } else if (schema === false) {
    return val;
  }

  if (_.isArray(schema)) {
    if (schema.length !== 1) {
      throw new Error("Expected an array with one element in schema");
    }

    if (! _.isArray(val)) {
      throw new Error("Expected an array in value, got " + typeof val);
    }

    return _.map(val, function (subval) {
      return convertBySchema(subval, schema[0]);
    });
  }

  if (! _.isObject(schema)) {
    throw new Error("Unexpected type of schema: " + typeof(schema));
  }

  var ret = _.clone(val);
  _.each(schema, function (subschema, key) {
    if (_.has(ret, key)) {
      ret[key] = convertBySchema(val[key], subschema);
    }
  });

  return ret;
};

var convert = function (path) {
  return path.replace(/:/g, '_');
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
  return convertBySchema(data, ISOPACK_SCHEME);
};

exports.convertUnibuild = function (data) {
  return convertBySchema(data, UNIBUILD_SCHEME);
};

exports.convertJSImage = function (data) {
  return convertBySchema(data, JAVASCRIPT_IMAGE_SCHEME);
};

exports.convert = convert;

