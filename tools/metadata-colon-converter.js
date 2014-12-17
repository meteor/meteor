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
    return converted(val);
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
    ret[key] = convertByScheme(subscheme, val[key]);
  });

  return ret;
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
    servePath: false
  }]
};

var JAVASCRIPT_IMAGE_SCHEME = {
  load: [{
    sourceMap: true,
    sourceMapRoot: true,
    path: true
  }]
};

