var semver = Npm.require('semver');

// Setup mock data for tests
var Packages = new LocalCollection;
var Versions = new LocalCollection;
var Builds = new LocalCollection;

Packages.insert({ name: "sparky-forms" });
Packages.insert({ name: "forms" });
Packages.insert({ name: "sparkle" });
Packages.insert({ name: "awesome-dropdown" });
Packages.insert({ name: "dropdown" });
Packages.insert({ name: "jquery-widgets" });
Packages.insert({ name: "jquery" });

var insertVersion = function (name, version, ecv, deps) {
  var constructedDeps = {};
  _.each(deps, function (constraint, name) {
    constructedDeps[name] = {
      constraint: constraint,
      references: [
        { arch: "os", targetSlice: "main", weak: false,
          implied: false, unordered: false },
        { arch: "browser", targetSlice: "main", weak: false,
          implied: false, unordered: false }]
    };
  });
  Versions.insert({ packageName: name, version: version, earliestCompatibleVersion: ecv,
                    dependencies: constructedDeps });
};
insertVersion("sparky-forms", "1.1.2", "1.0.0", {"forms": "=1.0.1", "sparkle": "=2.1.1"});
insertVersion("forms", "1.0.1", "1.0.0", {"sparkle": "2.1.0", "jquery-widgets": "1.0.0"});
insertVersion("sparkle", "2.1.0", "2.1.0", {"jquery": "1.8.2"});
insertVersion("sparkle", "2.1.1", "2.1.0", {"jquery": "1.8.2"});
insertVersion("sparkle", "1.0.0", "1.0.0");
insertVersion("awesome-dropdown", "1.5.0", "1.0.0", {"dropdown": "=1.2.2"});
insertVersion("dropdown", "1.2.2", "1.0.0", {"jquery-widgets": "1.0.0"});
insertVersion("jquery-widgets", "1.0.0", "1.0.0", {"jquery": "1.8.0", "sparkle": "2.1.1"});
insertVersion("jquery-widgets", "1.0.2", "1.0.0", {"jquery": "1.8.0", "sparkle": "2.1.1"});
insertVersion("jquery", "1.8.0", "1.8.0");
insertVersion("jquery", "1.8.2", "1.8.0");

var insertBuild = function (name, version, ecv) {
  Builds.insert({ packageName: name, version: version,
                  earliestCompatibleVersion: ecv, architecture: [ "browser", "os" ] });
};

insertBuild("sparky-forms", "1.1.2", "1.1.0");
insertBuild("forms", "1.0.1", "1.0.0");
insertBuild("sparkle", "2.1.1", "2.1.0");
insertBuild("sparkle", "2.1.0", "2.1.0");
insertBuild("sparkle", "1.0.0", "1.0.0");
insertBuild("awesome-dropdown", "1.5.0", "1.0.0");
insertBuild("dropdown", "1.2.2", "1.0.0");
insertBuild("jquery-widgets", "1.0.0", "1.0.0");
insertBuild("jquery-widgets", "1.0.2", "1.0.0");
insertBuild("jquery", "1.8.0", "1.0.0");
insertBuild("jquery", "1.9.0", "1.0.0");

// XXX Temporary hack: make a catalog stub to pass in to the constraint
// solver. We'll soon move constraint-solver into tools and just run
// tests with self-test, passing a real Catalog object.
var catalogStub = {
  packages: Packages,
  versions: Versions,
  builds: Builds,
  getAllPackageNames: function () {
    return _.pluck(Packages.find().fetch(), 'name');
  },
  getPackage: function (name) {
    return this.packages.findOne({ name: name });
  },
  getSortedVersions: function (name) {
    return _.pluck(
      this.versions.find({
        packageName: name
      }, { fields: { version: 1 } }).fetch(),
      'version'
    ).sort(semver.compare);
  },
  getVersion: function (name, version) {
    return this.versions.findOne({
      packageName: name,
      version: version
    });
  }
};

var resolver = new ConstraintSolver.PackagesResolver(catalogStub);

var currentTest = null;
var splitArgs = function (deps) {
  var dependencies = [], constraints = [];

  _.each(deps, function (constr, dep) {
    dependencies.push(dep);
    if (constr)
      constraints.push({ packageName: dep, type: (constr.indexOf("=") !== -1 ? "exactly" : "compatible-with"), version: constr.replace("=", "")});
  });
  return {dependencies: dependencies, constraints: constraints};
};

var t = function (deps, expected, options) {
  var dependencies = splitArgs(deps).dependencies;
  var constraints = splitArgs(deps).constraints;

  var resolvedDeps = resolver.resolve(dependencies, constraints, options);
  currentTest.equal(resolvedDeps, expected);
};

var t_progagateExact = function (deps, expected) {
  var dependencies = splitArgs(deps).dependencies;
  var constraints = splitArgs(deps).constraints;

  var resolvedDeps = resolver.propagateExactDeps(dependencies, constraints);
  currentTest.equal(resolvedDeps, expected);
};

var FAIL = function (deps, regexp) {
  currentTest.throws(function () {
    var dependencies = splitArgs(deps).dependencies;
    var constraints = splitArgs(deps).constraints;

    var resolvedDeps = resolver.resolve(dependencies, constraints);
  }, regexp);
};

Tinytest.add("constraint solver - exact dependencies", function (test) {
  currentTest = test;
  t_progagateExact({ "sparky-forms": "=1.1.2" }, { "sparky-forms": "1.1.2", "forms": "1.0.1", "sparkle": "2.1.1" });
  t_progagateExact({ "sparky-forms": "=1.1.2", "forms": "=1.0.1" }, { "sparky-forms": "1.1.2", "forms": "1.0.1", "sparkle": "2.1.1" });
  t_progagateExact({ "sparky-forms": "=1.1.2", "sparkle": "=2.1.1" }, { "sparky-forms": "1.1.2", "forms": "1.0.1", "sparkle": "2.1.1" });
  t_progagateExact({ "awesome-dropdown": "=1.5.0" }, { "awesome-dropdown": "1.5.0", "dropdown": "1.2.2" });

  FAIL({ "sparky-forms": "=1.1.2", "sparkle": "=1.0.0" }, /(.*sparkle.*sparky-forms.*)|(.*sparky-forms.*sparkle.*).*sparkle/);
  // something that isn't available for your architecture
  FAIL({ "sparky-forms": "=1.1.2", "sparkle": "=2.0.0" });
  FAIL({ "sparky-forms": "=0.0.1" });
  FAIL({ "sparky-forms-nonexistent": "0.0.1" }, /Cannot find anything about.*sparky-forms-nonexistent/);
});

Tinytest.add("constraint solver - simple exact + regular deps", function (test) {
  currentTest = test;

  t({ "sparky-forms": "=1.1.2" }, {
    "sparky-forms": "1.1.2",
    "forms": "1.0.1",
    "sparkle": "2.1.1",
    "jquery-widgets": "1.0.0",
    "jquery": "1.8.2"
  }, { _testing: true });

  t({ "sparky-forms": "=1.1.2", "awesome-dropdown": "=1.5.0" }, {
    "sparky-forms": "1.1.2",
    "forms": "1.0.1",
    "sparkle": "2.1.1",
    "jquery-widgets": "1.0.0",
    "jquery": "1.8.2",
    "awesome-dropdown": "1.5.0",
    "dropdown": "1.2.2"
  }, { _testing: true });
});

Tinytest.add("constraint solver - non-exact direct dependency", function (test) {
  currentTest = test;
  // sparky-forms 1.0.0 won't be chosen because it depends on a very old
  // jquery, which is not compatible with the jquery that
  // awesome-dropdown uses.
  t({ "sparky-forms": "1.0.0", "awesome-dropdown": "=1.5.0" }, {
    "sparky-forms": "1.1.2",
    "forms": "1.0.1",
    "sparkle": "2.1.1",
    "jquery-widgets": "1.0.0",
    "jquery": "1.8.2",
    "awesome-dropdown": "1.5.0",
    "dropdown": "1.2.2"
  }, { _testing: true });
});

Tinytest.add("constraint solver - no constraint dependency - anything", function (test) {
  currentTest = test;
  var versions = resolver.resolve(["sparkle"], [], { _testing: true });
  test.isTrue(_.isString(versions.sparkle));
});


Tinytest.add("constraint solver - no constraint dependency - transitive dep still picked right", function (test) {
  currentTest = test;
  var versions = resolver.resolve(["sparkle", "sparky-forms"], [{ packageName: "sparky-forms", version: "1.1.2", type: "compatible-with" }], { _testing: true });
  test.equal(versions.sparkle, "2.1.1");
});

Tinytest.add("constraint solver - benchmark on gems - sinatra", function (test) {
  var r = new ConstraintSolver.PackagesResolver(getCatalogStub(sinatraGems));

  var args = splitArgs({
    'capistrano': '2.14.2',
    'data_mapper': '1.2.0',
    'dm-core': '1.2.0',
    'dm-sqlite-adapter': '1.2.0',
    'dm-timestamps': '1.2.0',
    'haml': '3.1.7',
    'sass': '3.2.1',
    'shotgun': '0.9.0',
    'sinatra': '1.3.5',
    'sqlite3': '1.3.7'
  });

  r.resolve(args.dependencies, args.constraints);
});

var railsCatalog = getCatalogStub(railsGems);
Tinytest.add("constraint solver - benchmark on gems - rails", function (test) {
  var r = new ConstraintSolver.PackagesResolver(railsCatalog);

  var args = splitArgs({
    'rails': '4.0.4'
  });

  r.resolve(args.dependencies, args.constraints);
});

Tinytest.add("constraint solver - benchmark on gems - rails, gitlabhq", function (test) {
  var r = new ConstraintSolver.PackagesResolver(railsCatalog);

  var args = splitArgs({
    'rails': '4.0.0',
    'protected_attributes': null,
    'rails-observers': null,
    'actionpack-page_caching': null,
    'actionpack-action_caching': null,
    'default_value_for': '3.0.0',
    'mysql2': null,
    'devise': '3.0.4',
    'devise-async': '0.8.0',
    'omniauth': '1.1.3',
    'omniauth-google-oauth2': null,
    'omniauth-twitter': null,
    'omniauth-github': null,
    'gitlab_git': '5.7.1',
    'gitlab-grack': '2.0.0',
    'gitlab_omniauth-ldap': '1.0.4',
    'gitlab-gollum-lib': '1.1.0',
    'gitlab-linguist': '3.0.0',
    'grape': '0.6.1',
    'rack-cors': null,
    'email_validator': '1.4.0',
    'stamp': null,
    'enumerize': null,
    'kaminari': '0.15.1',
    'haml-rails': null,
    'carrierwave': null,
    'fog': '1.3.1',
    'six': null,
    'seed-fu': null,
    'redcarpet': '2.2.2',
    'github-markup': null,
    'asciidoctor': null,
    'unicorn': '4.6.3',
    'unicorn-worker-killer': null,
    'state_machine': null,
    'acts-as-taggable-on': null,
    'slim': null,
    'sinatra': null,
    'sidekiq': null,
    'httparty': null,
    'colored': null,
    'settingslogic': null,
    'foreman': null,
    'version_sorter': null,
    'redis-rails': null,
    'tinder': '1.9.2',
    'hipchat': '0.14.0',
    'gemnasium-gitlab-service': '0.2.0',
    'slack-notifier': '0.2.0',
    'd3_rails': '3.1.4',
    'underscore-rails': '1.4.4',
    'sanitize': null,
    'rack-attack': null,
    'ace-rails-ap': null,
    'sass-rails': null,
    'coffee-rails': null,
    'uglifier': null,
    'therubyracer': null,
    'turbolinks': null,
    'jquery-turbolinks': null,
    'select2-rails': null,
    'jquery-atwho-rails': '0.3.3',
    'jquery-rails': '2.1.3',
    'jquery-ui-rails': '2.0.2',
    'modernizr': '2.6.2',
    'raphael-rails': '2.1.2',
    'bootstrap-sass': '3.0.0',
    'font-awesome-rails': '3.2.0',
    'gitlab_emoji': '0.0.1',
    'gon': '5.0.0'
  });

  r.resolve(args.dependencies, args.constraints);
});

Tinytest.add("constraint solver - benchmark on gems - rails, gitlabhq, additions to the existing smaller solution", function (test) {
  var r = new ConstraintSolver.PackagesResolver(railsCatalog);

  var args = splitArgs({
    'rails': '4.0.0',
    'protected_attributes': null,
    'rails-observers': null,
    'actionpack-page_caching': null,
    'actionpack-action_caching': null,
    'default_value_for': '3.0.0',
    'mysql2': null,
    'devise': '3.0.4',
    'devise-async': '0.8.0',
    'omniauth': '1.1.3',
    'omniauth-google-oauth2': null,
    'omniauth-twitter': null,
    'omniauth-github': null,
    'gitlab_git': '5.7.1',
    'gitlab-grack': '2.0.0',
    'gitlab_omniauth-ldap': '1.0.4',
    'gitlab-gollum-lib': '1.1.0',
    'gitlab-linguist': '3.0.0',
    'grape': '0.6.1',
    'rack-cors': null,
    'email_validator': '1.4.0',
    'stamp': null,
    'enumerize': null,
    'kaminari': '0.15.1',
    'haml-rails': null,
    'carrierwave': null,
    'fog': '1.3.1',
    'six': null,
    'seed-fu': null,
    'redcarpet': '2.2.2',
    'github-markup': null,
    'asciidoctor': null,
    'unicorn': '4.6.3',
    'unicorn-worker-killer': null,
    'state_machine': null,
    'acts-as-taggable-on': null,
    'slim': null,
    'sinatra': null,
    'sidekiq': null,
    'httparty': null,
    'colored': null,
    'settingslogic': null,
    'foreman': null,
    'version_sorter': null,
    'redis-rails': null,
    'tinder': '1.9.2',
    'hipchat': '0.14.0',
    'gemnasium-gitlab-service': '0.2.0',
    'slack-notifier': '0.2.0',
    'd3_rails': '3.1.4',
    'underscore-rails': '1.4.4',
    'sanitize': null,
    'rack-attack': null,
    'ace-rails-ap': null,
    'sass-rails': null,
    'coffee-rails': null,
    'uglifier': null,
    'therubyracer': null,
    'turbolinks': null,
    'jquery-turbolinks': null,
    'select2-rails': null,
    'jquery-atwho-rails': '0.3.3',
    'jquery-rails': '2.1.3',
    'jquery-ui-rails': '2.0.2',
    'modernizr': '2.6.2',
    'raphael-rails': '2.1.2',
    'bootstrap-sass': '3.0.0',
    'font-awesome-rails': '3.2.0',
    'gitlab_emoji': '0.0.1',
    'gon': '5.0.0'
  });

  var previousSolution = {
    "actionmailer": "4.0.0",
    "actionpack": "4.0.0",
    "activemodel": "4.0.0",
    "activerecord": "4.0.0",
    "activerecord-deprecated_finders": "1.0.3",
    "activesupport": "4.0.0",
    "arel": "4.0.2",
    "asciidoctor": "0.1.4",
    "bcrypt": "3.1.7",
    "bcrypt-ruby": "3.1.5",
    "builder": "3.1.4",
    "carrierwave": "0.10.0",
    "coffee-rails": "4.0.1",
    "coffee-script": "2.2.0",
    "coffee-script-source": "1.7.0",
    "d3_rails": "3.1.4",
    "default_value_for": "3.0.0",
    "devise": "3.0.4",
    "devise-async": "0.8.0",
    "erubis": "2.7.0",
    "execjs": "2.0.2",
    "faraday": "0.9.0",
    "github-markup": "1.1.0",
    "haml": "4.0.5",
    "haml-rails": "0.5.1",
    "hashie": "2.0.3",
    "hike": "1.2.3",
    "httpauth": "0.2.1",
    "i18n": "0.6.9",
    "jquery-turbolinks": "2.0.2",
    "json": "1.8.1",
    "jwt": "0.1.10",
    "kaminari": "0.15.1",
    "mail": "2.5.4",
    "mime-types": "1.25.1",
    "minitest": "4.7.5",
    "multi_json": "1.9.0",
    "multipart-post": "2.0.0",
    "oauth": "0.4.7",
    "oauth2": "0.8.1",
    "omniauth": "1.1.4",
    "omniauth-github": "1.0.2",
    "omniauth-google-oauth2": "0.2.2",
    "omniauth-oauth": "1.0.1",
    "omniauth-oauth2": "1.1.1",
    "omniauth-twitter": "1.0.1",
    "orm_adapter": "0.5.0",
    "polyglot": "0.3.4",
    "posix-spawn": "0.3.8",
    "protected_attributes": "1.0.3",
    "rack": "1.5.2",
    "rack-test": "0.6.2",
    "rails": "4.0.0",
    "rails-observers": "0.1.2",
    "railties": "4.0.0",
    "rake": "10.1.1",
    "redcarpet": "2.2.2",
    "ref": "1.0.5",
    "sass": "3.2.17",
    "sass-rails": "4.0.2",
    "seed-fu": "2.3.0",
    "six": "0.2.0",
    "sprockets": "2.11.0",
    "sprockets-rails": "2.0.1",
    "therubyracer": "0.12.1",
    "thor": "0.19.1",
    "thread_safe": "0.3.1",
    "tilt": "1.4.1",
    "treetop": "1.4.15",
    "turbolinks": "2.2.0",
    "tzinfo": "0.3.39",
    "uglifier": "2.5.0",
    "warden": "1.2.3"
  };

  var solution = r.resolve(args.dependencies, args.constraints, { previousSolution: previousSolution });

  // check that root deps are the same
  _.each(args.dependencies, function (dep) {
    if (previousSolution[dep])
      test.equal(solution[dep], previousSolution[dep], dep);
  });
});

// Given a set of gems definitions returns a Catalog-like object
function getCatalogStub (gems) {
  return {
    getAllPackageNames: function () {
      return _.uniq(_.pluck(gems, 'name'));
    },
    getPackage: function (name) {
      throw new Error("Not implemeneted");
    },
    getSortedVersions: function (name) {
      return _.chain(gems)
        .filter(function (pv) { return pv.name === name; })
        .pluck('number')
        .map(function (version) {
          var nv = exactVersion(version);
          if (nv.length < version.length && version.split(".").length === 2)
            return version;
          return nv;
        })
        .filter(function (v) {
          return semver.valid(v);
        })
        .value()
        .sort(semver.compare);
    },
    getVersion: function (name, version) {
      var gem = _.find(gems, function (pv) {
        return pv.name === name && exactVersion(pv.number) === version;
      });

      var ecv = function (version) {
        // hard-code to "x.0.0"
        return parseInt(version) + ".0.0";
      };

      var packageVersion = {
        packageName: gem.name,
        version: gem.number,
        earliestCompatibleVersion: ecv(gem.number),
        dependencies: {}
      };

      _.each(gem.dependencies, function (dep) {
        var name = dep[0];
        var constraints = dep[1];

        packageVersion.dependencies[name] = {
          constraint: convertConstraints(constraints)[0], // XXX pick first one only
          references: [{
            "arch": "browser"
          }, {
            "arch": "os" }]
        };
      });

      return packageVersion;
    }
  };
}

// Naively converts ruby-gems style constraints string to either exact
// constraint or a regular constraint.
function convertConstraints (inp) {
  var out = inp.split(",").map(function (s) {
    return s.trim();
  })
  // remove the constraints we don't support
  .filter(function (s) {
    return !/</g.test(s) && !/!=/.test(s);
  })
  // convert 1.2.3.beta2 => 1.2.3
  // and 0.2 => 0.2.0
  .map(function (s) {
    var x = s.split(" ");
    return [x[0], exactVersion(x[1])].join(" ");
  })
  // convert '= 1.2.3' => '=1.2.3'
  // '~>1.2.3' => '1.2.3'
  // '>=1.2.3' => '1.2.3'
  .map(function (s) {
    if (s.indexOf(">= 0") === 0)
      return "none";
    var x = s.split(' ');
    if (x[0] === '~>')
      x[0] = '';
    else if (x[0] === '>' || x[0] === '>=')
      x[0] = '>=';
    else if (x[0] === '=')
      x[0] = '=';
    else
      throw new Error('unknown operator: ' + x[0]);
    return x.join("");
  });

  return out;
}

function exactVersion (s) {
  s = s.match(/\d+(\.\d+(\.\d+)?)?/)[0];
  if (s.split('.').length < 3)
    s += ".0";
  if (s.split('.').length < 3)
    s += ".0";
  return s;
}

