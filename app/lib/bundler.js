// Bundle contents:
// main.js [run to start the server]
// /static [served by node for now]
// /server
//   server.js, db.js, .... [contents of app/server]
//   node_modules [for now, contents of (meteor_root)/lib/node_modules]
// /app.html
// /app [user code]
// /app.json: [data for server.js]
//  - load [list of files to load, relative to root, presumably under /app]
// /dependencies.json: files to monitor for changes in development mode
//  - extensions [list of extensions registered for user code, with dots]
//  - packages [map from package name to list of paths relative to the package]
//  - core [paths relative to 'app' in meteor tree]
//  - app [paths relative to top of app tree]
//  - exclude [list of regexps for files to ignore (everywhere)]
//  (for 'core' and 'apps', if a directory is given, you should
//  monitor everything in the subtree under it minus the stuff that
//  matches exclude, and if it doesn't exist yet, you should watch for
//  it to appear)
//
// The application launcher is expected to execute /main.js with node,
// setting the PORT and MONGO_URL environment variables. The enclosed
// node application is expected to do the rest, including serving
// /static.

var files = require('./files.js');
var packages = require('./packages.js');
var crypto = require('crypto');
var path = require('path');
var fs = require('fs');
var uglify = require('uglify-js');
var cleanCSS = require('clean-css');
var _ = require('./third/underscore.js');

// files to ignore when bundling. node has no globs, so use regexps
var ignore_files = [
    /~$/, /^\.#/, /^#.*#$/,
    /^\.DS_Store$/, /^ehthumbs\.db$/, /^Icon.$/, /^Thumbs\.db$/
];

///////////////////////////////////////////////////////////////////////////////
// Bundle
///////////////////////////////////////////////////////////////////////////////

var Bundle = function () {
  var self = this;

  // map from environment, to list of filenames
  self.js = {client: [], server: []};

  // list of filenames
  self.css = [];

  // Map from environment, to path name (server relative), to contents
  // of file as buffer.
  self.files = {client: {}, server: {}};

  // list of segments of additional HTML for <head>/<body>
  self.head = [];
  self.body = [];

  // the public API
  self.api = {
    /**
     * This is the ultimate low-level API to add data to the bundle.
     *
     * type: "js", "css", "head", "body"
     *
     * environments: an environment, or a list of one or more
     * environments ("client", "server", "tests") -- for non-JS
     * resources, the only legal environment is "client"
     *
     * path: the (absolute) path at which the file will be
     * served. ignored in the case of "head" and "body".
     *
     * source_file: the absolute path to read the data from. if path
     * is set, will default based on that. overridden by data.
     *
     * data: the data to send. overrides source_file if present. you
     * must still set path (except for "head" and "body".)
     */
    add_resource: function (options) {
      var source_file = options.source_file || options.path;

      var data = options.data;
      if (options.data) {
        var data = options.data;
        if (!(data instanceof Buffer)) {
          if (!(typeof data === "string"))
            throw new Error("Bad type for data");
          data = new Buffer(data, 'utf8');
        }
      } else {
        if (!source_file)
          throw new Error("Need either source_file or data");
        var data = fs.readFileSync(source_file);
      }

      var environments = options.environments;
      if (typeof environments === "string")
        environments = [environments];
      if (!environments)
        throw new Error("Must specify environments");

      _.each(environments, function (env) {
        if (options.type === "js") {
          if (!options.path)
            throw new Error("Must specify path")

          if (env === "client" || env === "server") {
            self.files[env][options.path] = data;
            self.js[env].push(options.path);
          } else {
            throw new Error("Invalid environment");
          }
        } else if (options.type === "css") {
          if (env !== "client")
            throw new Error("CSS resources can only go to the client");
          if (!options.path)
            throw new Error("Must specify path")
          self.files.client[options.path] = data;
          self.css.push(options.path);
        } else if (options.type === "head" || options.type === "body") {
          if (env !== "client")
            throw new Error("HTML segments can only go to the client");
          self[options.type].push(data);
        } else {
          throw new Error("Unknown type " + options.type);
        }
      });
    }
  };
};

_.extend(Bundle.prototype, {
  generate_app_html: function () {
    var self = this;

    var template = fs.readFileSync(path.join(__dirname, "app.html.in"));
    var f = require('handlebars').compile(template.toString());
    return f({
      scripts: self.js.client,
      head_extra: self.head.join('/n'),
      body_extra: self.body.join('/n'),
      stylesheets: self.css
    });
  },

  // Returns: map from environments to (load) ordered list of packages
  // objects in each environment. root is allowed to be an app
  // packages with no name, but all of the other packages will have
  // library packages with names, because there is no way to depend on
  // anything but a library package (since the depend() API only takes
  // names.) empty string for environment means 'this package was
  // used, but doesn't necessarily have any files to output', in other
  // words the bundler environment, or possibly 'this package doesn't
  // care where it was invoked from, since it always outputs the same
  // sources.'
  compute_packages: function (root) {
    // map from a token, to a map of tokens that must be loaded before
    // it (to true). tokens are of the form
    // 'env_packagename'. presence of a token in 'before' means that
    // the package is required in the corresponding environment.
    var before = {};

    // add an arc: before 'after' is loaded in 'after_env', 'before'
    // must be loaded in 'before_env'. before and after are
    // package objects.
    var add_arc = function (after_pkg, after_env, before_pkg, before_env) {
      var before_token = before_env + "_" + (before_pkg.name || '');
      var after_token = after_env + "_" + (after_pkg.name || '');
      before[after_token][before_token] = true;
    };

    // add a requirement that a package is loaded in a particular
    // environment
    var require = function (pkg, env) {
       var token = env + "_" + (pkg.name || '');
      if (token in before)
        return; // already processed
      before[token] = {};

      for (var other_env in pkg.depends) {
        var eff_other_env = other_env || env; // '' -> env required from
        for (var other_pkg_name in pkg.depends[other_env]) {
          var other_pkg = packages.get(other_pkg_name);
          require(other_pkg, eff_other_env);
          add_arc(pkg, env, other_pkg, eff_other_env);
        };
      };
    };

    require(root, 'client');
    require(root, 'server');

    // topological sort based on arcs. no attempt has been made to
    // make this efficient.
    var ret = {};
    while (_.keys(before).length) {
      var satisfied = [];
      for (var token in before) {
        if (_.keys(before[token]).length)
          continue; // dependencies not satisfied

        var parts = token.match(/^([^_]*)_(.*)$/);
        var env = parts[1];
        var pkg = (parts[2] === '') ? root :
          packages.get(parts[2]);

        if (!(env in ret))
          ret[env] = [];
        ret[env].push(pkg);
        satisfied.push(token);
      }
      if (!satisfied.length)
        throw new Error("Circular dependency in packages");

      _.each(satisfied, function (token) {
        delete before[token];
      });

      for (var token in before) {
        _.each(satisfied, function (token2) {
          delete before[token][token2];
        });
      }
    }

    return ret;
  },

  // input: output from packages_used
  // output: map from environment to ordered list of source files,
  // each given as an object with keys 'pkg' (package) and 'rel_path'
  // (path relative to pkg.source_root)
  compute_sources: function (packages_used) {
    var ret = {};

    for (var env in packages_used) {
      ret[env] = [];
      _.each(packages_used[env], function (pkg) {
        var make_obj = function (rel_path) {
          return {pkg: pkg, rel_path: rel_path};
        };

        ret[env] = ret[env].concat(_.map(pkg.sources[''], make_obj));
        ret[env] = ret[env].concat(_.map(pkg.sources[env], make_obj));
      });
    }

    // deduplicate, taking just the first appearance
    var take_first = function (array) {
      var seen = {};
      var ret = [];
      _.each(array, function (source) {
        var key = path.join(source.pkg.source_root, source.rel_path);
        if (key in seen)
          return;
        seen[key] = true;
        ret.push(source);
      });
      return ret;
    };

    for (var env in ret) {
      ret[env] = take_first(ret[env]);
    }

    return ret;
  }
});


///////////////////////////////////////////////////////////////////////////////
// Main
///////////////////////////////////////////////////////////////////////////////

/**
 * Take the Meteor application in app_dir, and compile it into a
 * bundle at output_path. output_path will be created if it doesn't
 * exist (it will be a directory), and removed if it does exist.
 *
 * options include:
 * - no_minify : don't minify the assets
 * - skip_dev_bundle : don't put any node_modules in the bundle.
 * - symlink_dev_bundle : symlink bundle's node_modules to prebuilt
 *   local installation (to save startup time when running locally,
 *   used by meteor run).
 */
exports.bundle = function (app_dir, output_path, options) {
  options = options || {};

  packages.flush();
  var bundle = new Bundle;
  var app = packages.get_for_app(app_dir, ignore_files);

  var dependencies_json = {core: [], app: [], packages: {}};

  ////////// Compute source files //////////

  var packages_used = bundle.compute_packages(app);

  for (var env in packages_used) {
    _.each(packages_used[env], function (pkg) {
      if (pkg !== app) {
        if (pkg !== app && !(pkg.name in dependencies_json.packages))
          dependencies_json.packages[pkg.name] = {}
        dependencies_json.packages[pkg.name]['package.js'] = true;
      }
    });
  }

  var sources_used = bundle.compute_sources(packages_used);

  ////////// Process source files //////////

  for (var env in sources_used) {
    _.each(sources_used[env], function (source) {
      var ext = path.extname(source.rel_path).substr(1);

      var handler = source.pkg.get_sources_handler(ext);
      handler(bundle.api,
              path.join(source.pkg.source_root, source.rel_path),
              path.join(source.pkg.serve_root, source.rel_path),
              env);

      // XXX should really allow packages to create arbitrary
      // dependencies on files within the packages -- suppose you have
      // a compiler that reads a source file and pulls in other
      // resources based on #includes.
      if (source.pkg !== app)
          dependencies_json.packages[source.pkg.name][source.rel_path] = true;
    });
  }

  ////////// Minify and bundle files //////////

  if (!options.no_minify) {
    /// Javascript
    var js_concat = "";
    _.each(bundle.js.client, function (js_path) {
      var js_data = bundle.files.client[js_path];
      js_concat = js_concat + "\n;\n" +  js_data.toString('utf8');

      delete bundle.files.client[js_path];
    });

    var ast = uglify.parser.parse(js_concat);
    ast = uglify.uglify.ast_mangle(ast);
    ast = uglify.uglify.ast_squeeze(ast);
    var final_code = uglify.uglify.gen_code(ast);

    var hash = crypto.createHash('sha1');
    hash.update(final_code);
    var digest = hash.digest('hex');
    var name = digest + ".js";

    bundle.files.client[name] = new Buffer(final_code);
    bundle.js.client = [name];

    /// CSS
    var css_concat = "";
    _.each(bundle.css, function (css_path) {
      var css_data = bundle.files.client[css_path];
      css_concat = css_concat + "\n" +  css_data.toString('utf8');

      delete bundle.files.client[css_path];
    });

    var final_css = cleanCSS.process(css_concat);

    hash = crypto.createHash('sha1');
    hash.update(final_css);
    digest = hash.digest('hex');
    name = digest + ".css";

    bundle.files.client[name] = new Buffer(final_css);
    bundle.css = [name];
  }

  // Socket.io is an exceptional file. Push it in manually after
  // minification (it doesn't like being minified). But still serve it
  // ourselves instead of letting socket.io do it, so we get gzip and
  // such (potentially CDN later).
  bundle.js.client.unshift('/socketio.static.js');
  bundle.files.client['/socketio.static.js'] =
    fs.readFileSync(path.join(
      files.get_dev_bundle(), 'lib/node_modules',
      'socket.io/node_modules/socket.io-client/dist/socket.io.min.js'));

  ////////// Generate bundle //////////

  var app_json = {};
  dependencies_json.app.push('.meteor/packages');

  // foo/bar => foo/.build.bar
  var build_path = path.join(path.dirname(output_path),
                             '.build.' + path.basename(output_path));

  // XXX cleaner error handling. don't make the humans read an
  // exception (and, make suitable for use in automated systems)
  files.rm_recursive(build_path);
  files.mkdir_p(build_path, 0755);

  files.cp_r(path.join(__dirname, '../server'),
             path.join(build_path, 'server'), {ignore: ignore_files});
  dependencies_json.core.push('server');

  if (options.skip_dev_bundle)
    ;
  else if (options.symlink_dev_bundle)
    fs.symlinkSync(path.join(files.get_dev_bundle(), 'lib/node_modules'),
                   path.join(build_path, 'server/node_modules'));
  else
    files.cp_r(path.join(files.get_dev_bundle(), 'lib/node_modules'),
               path.join(build_path, 'server/node_modules'),
               {ignore: ignore_files});

  if (path.existsSync(path.join(app_dir, 'public'))) {
    files.cp_r(path.join(app_dir, 'public'),
               path.join(build_path, 'static'), {ignore: ignore_files});
  }
  dependencies_json.app.push('public');
  for (var rel_path in bundle.files.client) {
    var full_path = path.join(build_path, 'static', rel_path);
    files.mkdir_p(path.dirname(full_path), 0755);
    fs.writeFileSync(full_path, bundle.files.client[rel_path]);
  }

  app_json.load = [];
  files.mkdir_p(path.join(build_path, 'app'), 0755);
  _.each(bundle.js.server, function (rel_path) {
    var path_in_bundle = path.join('app', rel_path);
    var full_path = path.join(build_path, path_in_bundle);
    app_json.load.push(path_in_bundle);
    files.mkdir_p(path.dirname(full_path), 0755);
    fs.writeFileSync(full_path, bundle.files.server[rel_path]);
  });

  fs.writeFileSync(path.join(build_path, 'app.html'),
                   bundle.generate_app_html());
  dependencies_json.core.push('lib/app.html.in');

  fs.writeFileSync(path.join(build_path, 'unsupported.html'),
                   fs.readFileSync(path.join(__dirname, "unsupported.html")));
  dependencies_json.core.push('lib/unsupported.html');

  fs.writeFileSync(path.join(build_path, 'main.js'),
"require(require('path').join(__dirname, 'server/server.js'));\n");

  fs.writeFileSync(path.join(build_path, 'README'),
"This is a Meteor application bundle. It has only one dependency,\n" +
"node.js (with the 'fibers' package). To run the application:\n" +
"\n" +
"  $ npm install fibers\n" +
"  $ export MONGO_URL='mongodb://user:password@host:port/databasename'\n" +
"  $ node main.js\n" +
"\n" +
"Use the PORT environment variable to set the port where the\n" +
"application will listen. The default is 80, but that will require\n" +
"root on most systems.\n" +
"\n" +
"Find out more about Meteor at meteor.com.\n");

  dependencies_json.extensions = app.registered_extensions();
  dependencies_json.exclude = _.pluck(ignore_files, 'source');
  for (var pkg in dependencies_json.packages)
    dependencies_json.packages[pkg] =
    _.keys(dependencies_json.packages[pkg]);

  fs.writeFileSync(path.join(build_path, 'app.json'),
                   JSON.stringify(app_json));
  fs.writeFileSync(path.join(build_path, 'dependencies.json'),
                   JSON.stringify(dependencies_json));

  // XXX cleaner error handling (no exceptions)
  files.rm_recursive(output_path);
  fs.renameSync(build_path, output_path);
};
