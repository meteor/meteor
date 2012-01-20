// Bundle contents:
// main.js [run to start the server]
// /static [served by node for now]
// /server
//   server.js, db.js, .... [contents of app/server]
//   node_modules [for now, contents of (skybreak_root)/lib/node_modules]
// /app.html
// /app [user code]
// /app.json: [data for server.js]
//  - load [list of files to load, relative to root, presumably under /app]
// /dependencies.json: files to monitor for changes in development mode
//  - extensions [list of extensions registered for user code]
//  - packages [map from package name to list of paths relative to the package]
//  - core [paths relative to 'app' in skybreak tree]
//  - app [paths relative to top of app tree]
//  (for 'core' and 'apps', if a directory is given, you should
//  monitor everything in the subtree under it, and if it doesn't
//  exist yet, you should watch for it to appear)
//
// The application launcher is expected to execute /main.js with node,
// setting the PORT and MONGO_URL environment variables. The enclosed
// node application is expected to do the rest, including serving
// /static.

var files = require('./files.js');
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

var Bundle = function () {
  var self = this;

  self.loading = null;
  self.loaded = {};
  self.extensions = {};

  // Map from path name (server relative) to contents of file as buffer.
  self.client_files = {};
  self.server_files = {};

  // list of files to load on the server
  self.server_load = [];

  // list of javascript files to tell the client to load
  self.serve_js = [];

  // list of css files to tell the client to load
  self.serve_css = [];

  // extra HTML to add to <head> and <body>
  self.head_extra = '';
  self.body_extra = '';

  // Map from package name to list of files that the package depends
  // on (the files that, if changed, should trigger a reload),
  // relative to the top-level directory for each package.
  self.package_dependencies = {};

  self.api = {
    describe: function () {},

    require: function (name) {
      if (name in self.loaded)
        return;

      var was_loading = self.loading;
      self.loading = name;
      try {
        self.api.add_dependency("package.js");
        var fullpath = path.join(files.get_package_dir(), name, 'package.js');
        var code = fs.readFileSync(fullpath).toString();
        // \n is necessary in case final line is a //-comment
        var wrapped = "(function(Package,require){" + code + "\n})";
        // XXX it'd be nice to runInNewContext so that the package
        // setup code can't mess with our globals, but objects that
        // come out of runInNewContext have bizarro antimatter
        // prototype chains and break 'instanceof Array'. for now,
        // steer clear
        var func = require('vm').runInThisContext(wrapped, fullpath, true);
        // XXX would be nice to eliminate require. packages like
        // 'templating' use this to load other code to run at
        // bundle-time. and to pull in, eg, 'fs' and 'path' to access
        // the file system
        func(self.api, require);
        // XXX catch circular dependencies
        self.loaded[name] = true;
      } finally {
        self.loading = was_loading;
      }
    },

    // XXX probably unify this into a much smaller number of routines
    // that take more complicated parameters. eg, a hash with keys
    // filename, data (if you want to provide the data yourself rather
    // than have it be read from the filename), type (defaulting to
    // js.) and maybe call it Package.serve for the client and
    // Package.load for the server?

    // XXX should rename to something like client_js_file
    client_file: function (file) {
      var name = path.join("/packages", self.loading, file);
      var fullpath = path.join(__dirname, '../..', name);
      self.serve_js.push(name);
      self.client_files[name] = fs.readFileSync(fullpath);
      self.api.add_dependency(file);
    },

    // XXX should rename to something like server_js_file
    server_file: function (file) {
      var name = path.join("/packages", self.loading, file);
      var fullpath = path.join(__dirname, '../..', name);
      self.server_files[name] = fs.readFileSync(fullpath);
      self.server_load.push(name);
      self.api.add_dependency(file);
    },

    register_extension: function (extension, callback) {
      if (extension in self.extensions)
        // XXX improve error message (eg, name the packages in conflict)
        // XXX do something more graceful than printing a stack trace and
        // exiting! this isn't javaland!
        throw new Error("Conflict: two packages are both trying " +
                        "to handle ." + extension);
      self.extensions[extension] = callback;
    },

    // XXX figure out what the hell we're doing with encodings (and get
    // consistent about the use of strings vs buffers)

    server_js_buffer: function (path, contents) {
      // XXX raise error if there is already a file at that path
      // XXX raise error if contents is not a buffer .. or .. something
      self.server_files[path] = contents;
      self.server_load.push(path);
    },

    client_js_buffer: function (path, contents) {
      // XXX raise error if there is already a file at that path
      // XXX raise error if contents is not a buffer .. or .. something
      self.client_files[path] = contents;
      self.serve_js.push(path);
    },

    client_css_buffer: function (path, contents) {
      // XXX raise error if there is already a file at that path
      // XXX raise error if contents is not a buffer .. or .. something
      self.client_files[path] = contents;
      self.serve_css.push(path);
    },

    client_css_file: function (file) {
      var name = path.join("/packages", self.loading, file);
      var fullpath = path.join(__dirname, '../..', name);
      self.serve_css.push(name);
      self.client_files[name] = fs.readFileSync(fullpath);
      self.api.add_dependency(file);
    },

    append_head: function (buffer) {
      // XXX raise error if contents is not a buffer .. or .. something
      if (self.head_extra) self.head_extra += "\n";
      self.head_extra += buffer;
    },

    append_body: function (buffer) {
      // XXX raise error if contents is not a buffer .. or .. something
      if (self.body_extra) self.body_extra += "\n";
      self.body_extra += buffer;
    },

    // Not necessary when using *_file
    add_dependency: function (file) {
      var fullpath = path.join(__dirname, '../..', 'packages',
                               self.loading, file);
      try {
        fs.statSync(fullpath);
      } catch (e) {
        throw new Error("No such file '" + file + "' in package " +
                        self.loading);
      }

      if (!(self.loading in self.package_dependencies))
        self.package_dependencies[self.loading] = [];
      self.package_dependencies[self.loading].push(file);
    }
  };

  self.api.register_extension(
    "js", function (filename, rel_filename, is_client, is_server) {
      var contents = fs.readFileSync(filename);
      if (is_client)
        self.api.client_js_buffer(rel_filename, contents);
      if (is_server)
        self.api.server_js_buffer(rel_filename, contents);
    });

  self.api.register_extension(
    "css", function (filename, rel_filename, is_client, is_server) {
      if (!is_client) return; // only for the client.
      self.api.client_css_buffer(rel_filename, fs.readFileSync(filename));
    });
};

_.extend(Bundle.prototype, {
  // XXX note that this includes dots
  registeredExtensions: function () {
    var ret = [];
    for (var ext in this.extensions)
      ret.push("." + ext);
    return ret;
  },

  add_standard_packages: function () {
    // standard client packages (for now), for the classic skybreak stack
    this.api.require('deps');
    this.api.require('session');
    this.api.require('livedata');
    this.api.require('liveui');
    this.api.require('templating');
    this.api.require('startup');
  },

  // returns paths relative to app_dir
  compute_user_files: function (app_dir) {
    // find everything in tree, sorted depth-first alphabetically.
    var file_list = files.file_list_sync(app_dir,
                                       this.registeredExtensions());
    file_list = _.reject(file_list, function (file) {
      return _.any(ignore_files, function (pattern) {
        return file.match(pattern);
      });
    });
    file_list.sort(files.sort);

    // (Note: we used to have some functionality to let users push
    // some files to the front of the load order. It was removed
    // because once we had packages, no app seemed to need it. But you
    // could fish it out of version control if you wanted to bring it
    // back.)

    // now push html (template) files ahead of everything else. this
    // is important because the user wants to be able to say
    // Template.foo.events = { ... }
    //
    // XXX this is kind of hacky. maybe all of the templates should go
    // in one file? packages should probably have a way to request
    // this treatment (load order depedency tags?) .. who knows.
    var htmls = [];
    _.each(file_list, function (filename) {
      if (path.extname(filename) === '.html') {
        htmls.push(filename);
        file_list = _.reject(file_list, function (f) { return f === filename;});
      }
    });
    file_list = htmls.concat(file_list);

    // now make everything relative to app_dir
    var prefix = app_dir;
    if (prefix[prefix.length - 1] !== '/')
      prefix += '/';
    file_list = file_list.map(function (abs) {
      if (app_dir.length >= abs.length ||
          abs.substr(0, app_dir.length) !== app_dir)
        // XXX audit to make sure it works in all possible symlink
        // scenarios
        throw new Error("internal error: source file outside of app_dir?");
      return abs.substr(app_dir.length);
    });

    return file_list;
  },

  generate_app_html: function () {
    var template = fs.readFileSync(path.join(__dirname, "app.html.in"));
    var f = require('handlebars').compile(template.toString());
    return f({
      scripts: this.serve_js,
      head_extra: this.head_extra,
      body_extra: this.body_extra,
      stylesheets: this.serve_css
    });
  }
});

/**
 * Take the Skybreak application in app_dir, and compile it into a
 * bundle at output_path. output_path will be created if it doesn't
 * exist (it will be a directory), and removed if it does exist.
 *
 * options include:
 * - no_minify : don't minify the assets
 * - skip_dev_bundle : don't put any node_modules in the bundle.
 * - symlink_dev_bundle : symlink bundle's node_modules to prebuilt
 *   local installation (to save startup time when running locally,
 *   used by skybreak run).
 */
exports.bundle = function (app_dir, output_path, options) {
  options = options || {};
  var bundle = new Bundle;
  var base = Date.now();

  ////////// Packages //////////

  // has to come before user packages, because we don't (presently)
  // require packages to declare dependencies on 'standard skybreak
  // stuff' like minimongo
  bundle.add_standard_packages();

  _.each(require('./project.js').get_packages(app_dir), function (p) {
    bundle.api.require(p);
  });

  ////////// User source //////////

  var user_files = bundle.compute_user_files(app_dir);

  _.each(user_files, function (rel_path) {
    var full_path = path.join(app_dir, rel_path);

    // XXX at some point we should re-work our directory structure and
    // how we determine which files are for the client and which are for
    // the server.
    var is_client = (full_path.indexOf('/server/') === -1);
    var is_server = (full_path.indexOf('/client/') === -1);

    var ext = path.extname(full_path).substr(1);

    if (!(ext in bundle.extensions))
      // huh? we used bundle.extensions to build the file list ..
      throw new Error("internal error: don't have handler for extension?");

    bundle.extensions[ext](full_path, rel_path, is_client, is_server);

  });

  ////////// Minify and bundle files //////////

  if (!options.no_minify) {
    /// Javascript
    var js_concat = "";
    _.each(bundle.serve_js, function (js_path) {
      var js_data = bundle.client_files[js_path];
      js_concat = js_concat + "\n;\n" +  js_data.toString('utf8');

      delete bundle.client_files[js_path];
    });

    var ast = uglify.parser.parse(js_concat);
    ast = uglify.uglify.ast_mangle(ast);
    ast = uglify.uglify.ast_squeeze(ast);
    var final_code = uglify.uglify.gen_code(ast);

    var hash = crypto.createHash('sha1');
    hash.update(final_code);
    var digest = hash.digest('hex');
    var name = digest + ".js";

    bundle.client_files[name] = new Buffer(final_code);
    bundle.serve_js = [name];

    /// CSS
    var css_concat = "";
    _.each(bundle.serve_css, function (css_path) {
      var css_data = bundle.client_files[css_path];
      css_concat = css_concat + "\n" +  css_data.toString('utf8');

      delete bundle.client_files[css_path];
    });

    var final_css = cleanCSS.process(css_concat);

    hash = crypto.createHash('sha1');
    hash.update(final_css);
    digest = hash.digest('hex');
    name = digest + ".css";

    bundle.client_files[name] = new Buffer(final_css);
    bundle.serve_css = [name];
  }

  // Socket.io is an exceptional file. Push it in manually after
  // minification (it doesn't like being minified). But still serve it
  // ourselves instead of letting socket.io do it, so we get gzip and
  // such (potentially CDN later).
  bundle.serve_js.unshift('/socketio.static.js');
  bundle.client_files['/socketio.static.js'] =
    fs.readFileSync(path.join(
      files.get_dev_bundle(), 'lib/node_modules',
      'socket.io/node_modules/socket.io-client/dist/socket.io.min.js'));

  ////////// Generate bundle //////////

  var app_json = {};
  var dependencies_json = {core: [], app: []};
  dependencies_json.app.push('.skybreak/packages');

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
  for (var rel_path in bundle.client_files) {
    var full_path = path.join(build_path, 'static', rel_path);
    files.mkdir_p(path.dirname(full_path), 0755);
    fs.writeFileSync(full_path, bundle.client_files[rel_path]);
  }

  app_json.load = [];
  files.mkdir_p(path.join(build_path, 'app'), 0755);
  _.each(bundle.server_load, function (rel_path) {
    var path_in_bundle = path.join('app', rel_path);
    var full_path = path.join(build_path, path_in_bundle);
    app_json.load.push(path_in_bundle);
    files.mkdir_p(path.dirname(full_path), 0755);
    fs.writeFileSync(full_path, bundle.server_files[rel_path]);
  });

  fs.writeFileSync(path.join(build_path, 'app.html'),
                   bundle.generate_app_html());
  dependencies_json.core.push('lib/app.html.in');

  fs.writeFileSync(path.join(build_path, 'unsupported.html'),
                   fs.readFileSync(path.join(__dirname, "unsupported.html")));
  dependencies_json.core.push('lib/server');

  fs.writeFileSync(path.join(build_path, 'main.js'),
"require(require('path').join(__dirname, 'server/server.js'));\n");

  fs.writeFileSync(path.join(build_path, 'README'),
"This is a Skybreak application bundle. It has only one dependency,\n" +
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
"Find out more about Skybreak at skybreakplatform.com.\n");

  // XXX enhance dependencies to include all dependencies, not just
  // user code, so we can get reload behavior when developing packages
  // or skybreak itself. that includes (1) any file that went in the
  // bundle (from 'static', 'app/server', or a package), (2)
  // package.js for each package that was included. also conceptually
  // we need to restart on 'skybreak add'.
  dependencies_json.extensions = bundle.registeredExtensions();
  dependencies_json.packages = {};
  for (var pkg in bundle.package_dependencies)
    dependencies_json.packages[pkg] = _.uniq(bundle.package_dependencies[pkg]);

  fs.writeFileSync(path.join(build_path, 'app.json'),
                   JSON.stringify(app_json));
  fs.writeFileSync(path.join(build_path, 'dependencies.json'),
                   JSON.stringify(dependencies_json));

  // XXX cleaner error handling (no exceptions)
  files.rm_recursive(output_path);
  fs.renameSync(build_path, output_path);
};
