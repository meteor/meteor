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
        { slice: "main", arch: "os", targetSlice: "main", weak: false,
          implied: false, unordered: false },
        { slice: "main", arch: "browser", targetSlice: "main", weak: false,
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
var t = function (deps, expected, options) {
  var resolvedDeps = resolver.resolve(deps, options);
  currentTest.equal(resolvedDeps, expected);
};

var t_progagateExact = function (deps, expected) {
  var resolvedDeps = resolver.propagatedExactDeps(deps);
  currentTest.equal(resolvedDeps, expected);
};

var FAIL = function (deps, regexp) {
  currentTest.throws(function () {
    var resolvedDeps = resolver.resolve(deps);
  }, regexp);
};

Tinytest.add("constraint solver - exact dependencies", function (test) {
  currentTest = test;
  t_progagateExact({ "sparky-forms": "=1.1.2" }, { "sparky-forms": "1.1.2", "forms": "1.0.1", "sparkle": "2.1.1" });
  t_progagateExact({ "sparky-forms": "=1.1.2", "forms": "=1.0.1" }, { "sparky-forms": "1.1.2", "forms": "1.0.1", "sparkle": "2.1.1" });
  t_progagateExact({ "sparky-forms": "=1.1.2", "sparkle": "=2.1.1" }, { "sparky-forms": "1.1.2", "forms": "1.0.1", "sparkle": "2.1.1" });
  t_progagateExact({ "awesome-dropdown": "=1.5.0" }, { "awesome-dropdown": "1.5.0", "dropdown": "1.2.2" });

  FAIL({ "sparky-forms": "=1.1.2", "sparkle": "=1.0.0" }, /(.*sparkle.*sparky-forms.*)|(.*sparky-forms.*sparkle.*).*jquery-widgets/);
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
  }, { mode: "CONSERVATIVE" });

  t({ "sparky-forms": "=1.1.2", "awesome-dropdown": "=1.5.0" }, {
    "sparky-forms": "1.1.2",
    "forms": "1.0.1",
    "sparkle": "2.1.1",
    "jquery-widgets": "1.0.0",
    "jquery": "1.8.2",
    "awesome-dropdown": "1.5.0",
    "dropdown": "1.2.2"
  }, { mode: "CONSERVATIVE" });
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
  }, { mode: "CONSERVATIVE" });
});

Tinytest.add("constraint solver - no constraint dependency - anything", function (test) {
  currentTest = test;
  var versions = resolver.resolve({ "sparkle": "none" }, { mode: "CONSERVATIVE" });
  test.isTrue(_.isString(versions.sparkle));
  versions = resolver.resolve({ "sparkle": null }, { mode: "CONSERVATIVE" });
  test.isTrue(_.isString(versions.sparkle));
});


Tinytest.add("constraint solver - no constraint dependency - transitive dep still picked right", function (test) {
  currentTest = test;
  var versions = resolver.resolve({ "sparkle": "none", "sparky-forms": "1.1.2" }, { mode: "CONSERVATIVE" });
  test.equal(versions.sparkle, "2.1.1");
  var versions = resolver.resolve({ "sparkle": null, "sparky-forms": "1.1.2" }, { mode: "CONSERVATIVE" });
  test.equal(versions.sparkle, "2.1.1");
});

Tinytest.add("constraint solver - benchmark on gems - sinatra", function (test) {
  var r = new ConstraintSolver.PackagesResolver(getCatalogStub(sinatraGems));

  r.resolve({
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
});

var railsCatalog = getCatalogStub(railsGems);
Tinytest.add("constraint solver - benchmark on gems - rails", function (test) {
  var r = new ConstraintSolver.PackagesResolver(railsCatalog);

  r.resolve({
    'rails': '4.0.4'
  });
});

Tinytest.add("constraint solver - benchmark on gems - rails, gitlabhq", function (test) {
  var r = new ConstraintSolver.PackagesResolver(railsCatalog);

  r.resolve({
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
    'github-markup': '0.7.4',
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

      // These gems didn't really follow the semver and they prevent our
      // generated tests from being resolved. We set the ECV manually so we can
      // get some results as the correctness is not as important as the speed.
      if (_.contains(['railties', 'rails', 'activesupport', 'actionpack', 'activerecord', 'activemodel'], packageVersion.packageName) && semver.gte(exactVersion(packageVersion.version), "3.0.0"))
        packageVersion.earliestCompatibleVersion = "3.0.0";
      if (_.contains(['devise'], packageVersion.packageName) && semver.gte(exactVersion(packageVersion.version), "3.0.0") && semver.lte(exactVersion(packageVersion.version), "3.2.0"))
        packageVersion.earliestCompatibleVersion = "2.2.0";
      if (packageVersion.packageName === "redis")
        packageVersion.earliestCompatibleVersion = "0.0.1";

      _.each(gem.dependencies, function (dep) {
        var name = dep[0];
        var constraints = dep[1];

        packageVersion.dependencies[name] = {
          constraint: convertConstraints(constraints)[0], // XXX pick first one only
          references: [{
            "slice": "main",
            "arch": "browser"
          }, {
            "slice": "main",
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
    if (s === ">= 0.0.0")
      return "none";
    var x = s.split(' ');
    if (x[0] === '~>' || x[0] === '>=' || x[0] === '>')
      x[0] = '';
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

