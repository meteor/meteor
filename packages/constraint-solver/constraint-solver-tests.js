var makeResolver = function (data) {
  var Packages = new LocalCollection;
  var Versions = new LocalCollection;
  var Builds = new LocalCollection;

  _.each(data, function (versionDescription) {
    var packageName = versionDescription.shift();
    var version = versionDescription.shift();
    var ecv = (typeof versionDescription[0] === "string"
               ? versionDescription.shift()
               : PackageVersion.defaultECV(version));
    var deps = versionDescription.shift();

    if (!Packages.findOne({name: packageName})) {
      Packages.insert({name: packageName});
    }

    var constructedDeps = {};
    _.each(deps, function (constraint, name) {
      constructedDeps[name] = {
        constraint: constraint,
        references: [
          { arch: "os" },
          { arch: "web.browser"},
          { arch: "web.cordova"},
        ]
      };
    });
    Versions.insert({ packageName: packageName, version: version,
                      earliestCompatibleVersion: ecv,
                    dependencies: constructedDeps });
    Builds.insert({ packageName: packageName, version: version,
                    buildArchitectures: "os+web.cordova+web.browser" });
  });

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
      ).sort(PackageVersion.compare);
    },
    getVersion: function (name, version) {
      return this.versions.findOne({
        packageName: name,
        version: version
      });
    }
  };
  return new ConstraintSolver.PackagesResolver(catalogStub);
};

var defaultResolver = makeResolver([
  ["sparky-forms", "1.1.2", {"forms": "=1.0.1", "sparkle": "=2.1.1"}],
  ["sparky-forms", "1.0.0", {"awesome-dropdown": "=1.4.0"}],
  ["forms", "1.0.1", {"sparkle": "2.1.0", "jquery-widgets": "1.0.0"}],
  ["sparkle", "2.1.0", "2.1.0", {"jquery": "1.8.2"}],
  ["sparkle", "2.1.1", "2.1.0", {"jquery": "1.8.2"}],
  ["sparkle", "1.0.0"],
  ["awesome-dropdown", "1.4.0", {"dropdown": "=1.2.2"}],
  ["awesome-dropdown", "1.5.0", {"dropdown": "=1.2.2"}],
  ["dropdown", "1.2.2", {"jquery-widgets": "1.0.0"}],
  ["jquery-widgets", "1.0.0", {"jquery": "1.8.0", "sparkle": "2.1.1"}],
  ["jquery-widgets", "1.0.2", {"jquery": "1.8.0", "sparkle": "2.1.1"}],
  ["jquery", "1.8.0", "1.8.0"],
  ["jquery", "1.8.2", "1.8.0"]
]);

var splitArgs = function (deps) {
  var dependencies = [], constraints = [];

  _.each(deps, function (constr, dep) {
    if (constr && constr[0] === 'w') {
      constr = constr.slice(1);
    } else {
      dependencies.push(dep);
    }
    if (constr) {
      constraints.push(PackageVersion.parseConstraint(dep + "@" + constr));
    }
  });
  return {dependencies: dependencies, constraints: constraints};
};

var testWithResolver = function (test, resolver, f) {
  var t = function (deps, expected, options) {
    var dependencies = splitArgs(deps).dependencies;
    var constraints = splitArgs(deps).constraints;

    var resolvedDeps = resolver.resolve(dependencies, constraints, options);
    test.equal(resolvedDeps, { answer: expected });
  };

  var FAIL = function (deps, regexp) {
    test.throws(function () {
      var dependencies = splitArgs(deps).dependencies;
      var constraints = splitArgs(deps).constraints;

      var resolvedDeps = resolver.resolve(dependencies, constraints,
                                          {_testing: true});
    }, regexp);
  };
  f(t, FAIL);
};

Tinytest.add("constraint solver - simple exact + regular deps", function (test) {
  testWithResolver(test, defaultResolver, function (t) {
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
});

Tinytest.add("constraint solver - non-exact direct dependency", function (test) {
  testWithResolver(test, defaultResolver, function (t) {
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
});

Tinytest.add("constraint solver - no results", function (test) {
  var resolver = makeResolver([
    ["bad-1", "1.0.0", {indirect: "1.0.0"}],
    ["bad-2", "1.0.0", {indirect: "2.0.0"}],
    ["indirect", "1.0.0"],
    ["indirect", "2.0.0"]
  ]);
  testWithResolver(test, resolver, function (t, FAIL) {
    FAIL({ "bad-1": "1.0.0", "bad-2": "" }, function (error) {
      return error.message.match(/indirect@2\.0\.0 is not satisfied by 1\.0\.0/)
        && error.message.match(/bad-1@1\.0\.0/)
        && error.message.match(/bad-2@1\.0\.0/)
        // We shouldn't get shown indirect itself in a pathway: that would just
        // be an artifact of there being a path that passes through another
        // unibuild.  (Note: we might change our mind and decide that all these
        // lines should end in the relevant constraint, which would probably be
        // nice! But in that case, we should test that no line ends with TWO
        // mentions of indirect.)
        && ! error.message.match(/-> indirect/)
        // Lines should be unique.
        && ! error.message.match(/bad-1[^]+bad-1/);
    });
  });

  resolver = makeResolver([
    ["foo", "1.0.0"],
    ["foo", "1.1.0"],
    ["foo", "2.0.0"],
    ["foo", "2.1.0"],
    ["bar", "1.0.0", {foo: "1.0.0"}]
  ]);
  testWithResolver(test, resolver, function (t, FAIL) {
    FAIL({foo: "2.0.0", bar: "1.0.0"},
         /constraints on foo[^]+top level[^]+bar@1.0.0/);
  });

  testWithResolver(test, makeResolver([]), function (t, FAIL) {
    FAIL({foo: "1.0.0"}, /unknown package: foo/);
  });

  resolver = makeResolver([
    ["foo", "2.0.0"],
    ["bar", "1.0.0", {foo: ""}]
  ]);
  testWithResolver(test, resolver, function (t, FAIL) {
    FAIL({foo: "w1.0.0", bar: "1.0.0"},
         /constraints on foo[^]+top level/);
  });
});


Tinytest.add("constraint solver - any-of constraint", function (test) {
  var resolver = makeResolver([
    ["one-of", "1.0.0", {indirect: "1.0.0 || 2.0.0"}],
    ["important", "1.0.0", {indirect: "2.0.0"}],
    ["indirect", "1.0.0"],
    ["indirect", "2.0.0"]
  ]);

  testWithResolver(test, resolver, function (t, FAIL) {
    t({ "one-of": "=1.0.0", "important": "1.0.0" }, {
      "one-of": "1.0.0",
      "important": "1.0.0",
      "indirect": "2.0.0"
    }, { _testing: true });
  });

  resolver = makeResolver([
    ["one-of", "1.0.0", {indirect: "1.0.0 || 2.0.0"}],
    ["one-of-equal", "1.0.0", {indirect: "1.0.0 || =2.0.1"}],
    ["important", "1.0.0", {indirect: "1.0.0"}],
    ["indirect", "1.0.0"],
    ["indirect", "2.0.0"],
    ["indirect", "2.0.1"]
  ]);

  testWithResolver(test, resolver, function (t, FAIL) {
    t({ "one-of": "=1.0.0", "important": "1.0.0" }, {
      "one-of": "1.0.0",
      "important": "1.0.0",
      "indirect": "1.0.0"
    }, { _testing: true });

    t({ "one-of-equal": "1.0.0", "indirect": "2.0.0" }, {
      "one-of-equal": "1.0.0",
      "indirect": "2.0.1"
    }, { _testing: true });

    t({ "one-of-equal": "1.0.0", "one-of": "1.0.0" }, {
      "one-of-equal": "1.0.0",
      "one-of": "1.0.0",
      "indirect": "1.0.0"
    }, { _testing: true });

    FAIL({"one-of-equal": "1.0.0",
          "one-of": "1.0.0",
          "indirect" : "=2.0.0"},
         /constraints on indirect[^]+top level[^]+one-of-equal@1.0.0/
    );
  });
});

Tinytest.add("constraint solver - previousSolution", function (test) {
  testWithResolver(test, defaultResolver, function (t, FAIL) {
    // This is what you get if you lock sparky-forms to 1.0.0.
    t({ "sparky-forms": "=1.0.0" }, {
      "sparky-forms": "1.0.0",
      "awesome-dropdown": "1.4.0",
      "dropdown": "1.2.2",
      "jquery-widgets": "1.0.0",
      "jquery": "1.8.2",
      "sparkle": "2.1.1"
    }, { _testing: true });

    // If you just requires something compatible with 1.0.0, we end up choosing
    // 1.1.2.
    t({ "sparky-forms": "1.0.0" }, {
      "sparky-forms": "1.1.2",
      "forms": "1.0.1",
      "sparkle": "2.1.1",
      "jquery-widgets": "1.0.0",
      "jquery": "1.8.2"
    }, { _testing: true });

    // But if you ask for something compatible with 1.0.0 and have a previous
    // solution with 1.0.0, the previous solution works (since it is achievable).
    t({ "sparky-forms": "1.0.0" }, {
      "sparky-forms": "1.0.0",
      "awesome-dropdown": "1.4.0",
      "dropdown": "1.2.2",
      "jquery-widgets": "1.0.0",
      "jquery": "1.8.2",
      "sparkle": "2.1.1"
    }, { _testing: true, previousSolution: {
      "sparky-forms": "1.0.0"
    }});

    // On the other hand, if the previous solution is incompatible with the
    // constraints, it's not an error: we can try something that isn't the
    // previous solution in this case!
    t({ "sparky-forms": "1.1.2" }, {
      "sparky-forms": "1.1.2",
      "forms": "1.0.1",
      "sparkle": "2.1.1",
      "jquery-widgets": "1.0.0",
      "jquery": "1.8.2"
    }, { _testing: true, previousSolution: {
      "sparky-forms": "1.0.0"
    }});
  });
});


Tinytest.add("constraint solver - no constraint dependency - anything", function (test) {
  var versions = defaultResolver.resolve(["sparkle"], [], { _testing: true }).answer;
  test.isTrue(_.isString(versions.sparkle));
});


Tinytest.add("constraint solver - no constraint dependency - transitive dep still picked right", function (test) {
  var versions = defaultResolver.resolve(
    ["sparkle", "sparky-forms"],
    [PackageVersion.parseConstraint("sparky-forms@1.1.2")],
    { _testing: true }).answer;
  test.equal(versions.sparkle, "2.1.1");
});

var runBenchmarks = !!process.env.CONSTRAINT_SOLVER_BENCHMARK;

runBenchmarks && Tinytest.add("constraint solver - benchmark on gems - sinatra", function (test) {
  var r = new ConstraintSolver.PackagesResolver(getCatalogStub(sinatraGems));

  var args = splitArgs({
    'capistrano': '2.14.2',
    'data-mapper': '1.2.0',
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

// Add a few versions that are referenced by other versions but don't exist. We
// now require referenced versions to exist.
railsGems.push({name: "bcrypt", number: "3.0.0", dependencies: []});
railsGems.push({name: "mime-types", number: "1.16.0", dependencies: []});
railsGems.push({"name":"pyu-ruby-sasl","number":"0.3.1","platform":"ruby","dependencies":[]});
railsGems.push({"name":"backports","number":"3.0.0","platform":"ruby","dependencies":[]});
railsGems.push({"name":"diff-lcs","number":"1.1.0","platform":"ruby","dependencies":[]});
var railsCatalog = getCatalogStub(railsGems);
runBenchmarks && Tinytest.add("constraint solver - benchmark on gems - rails", function (test) {
  var r = new ConstraintSolver.PackagesResolver(railsCatalog);

  var args = splitArgs({
    'rails': '4.0.4'
  });

  r.resolve(args.dependencies, args.constraints);
});

runBenchmarks && Tinytest.add("constraint solver - benchmark on gems - rails, gitlabhq", function (test) {
  var r = new ConstraintSolver.PackagesResolver(railsCatalog);

  var args = splitArgs({
    'rails': '4.0.0',
    'protected-attributes': null,
    'rails-observers': null,
    'actionpack-page-caching': null,
    'actionpack-action-caching': null,
    'default-value-for': '3.0.0',
    'mysql2': null,
    'devise': '3.0.4',
    'devise-async': '0.8.0',
    'omniauth': '1.1.3',
    'omniauth-google-oauth2': null,
    'omniauth-twitter': null,
    'omniauth-github': null,
    'gitlab-git': '5.7.1',
    'gitlab-grack': '2.0.0',
    'gitlab-omniauth-ldap': '1.0.4',
    'gitlab-gollum-lib': '1.1.0',
    'gitlab-linguist': '3.0.0',
    'grape': '0.6.1',
    'rack-cors': null,
    'email-validator': '1.4.0',
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
    'state-machine': null,
    'acts-as-taggable-on': null,
    'slim': null,
    'sinatra': null,
    'sidekiq': null,
    'httparty': null,
    'colored': null,
    'settingslogic': null,
    'foreman': null,
    'version-sorter': null,
    'redis-rails': null,
    'tinder': '1.9.2',
    'hipchat': '0.14.0',
    'gemnasium-gitlab-service': '0.2.1',
    'slack-notifier': '0.2.0',
    'd3-rails': '3.1.4',
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
    'gitlab-emoji': '0.0.1',
    'gon': '5.0.0'
  });

  r.resolve(args.dependencies, args.constraints);
});

runBenchmarks && Tinytest.add("constraint solver - benchmark on gems - rails, gitlabhq, additions to the existing smaller solution", function (test) {
  var r = new ConstraintSolver.PackagesResolver(railsCatalog);

  var args = splitArgs({
    'rails': '4.0.0',
    'protected-attributes': null,
    'rails-observers': null,
    'actionpack-page-caching': null,
    'actionpack-action-caching': null,
    'default-value-for': '3.0.0',
    'mysql2': null,
    'devise': '3.0.4',
    'devise-async': '0.8.0',
    'omniauth': '1.1.3',
    'omniauth-google-oauth2': null,
    'omniauth-twitter': null,
    'omniauth-github': null,
    'gitlab-git': '5.7.1',
    'gitlab-grack': '2.0.0',
    'gitlab-omniauth-ldap': '1.0.4',
    'gitlab-gollum-lib': '1.1.0',
    'gitlab-linguist': '3.0.0',
    'grape': '0.6.1',
    'rack-cors': null,
    'email-validator': '1.4.0',
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
    'state-machine': null,
    'acts-as-taggable-on': null,
    'slim': null,
    'sinatra': null,
    'sidekiq': null,
    'httparty': null,
    'colored': null,
    'settingslogic': null,
    'foreman': null,
    'version-sorter': null,
    'redis-rails': null,
    'tinder': '1.9.2',
    'hipchat': '0.14.0',
    'gemnasium-gitlab-service': '0.2.1',
    'slack-notifier': '0.2.0',
    'd3-rails': '3.1.4',
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
    'gitlab-emoji': '0.0.1',
    'gon': '5.0.0'
  });

  var previousSolution = {
    "actionmailer": "4.0.0",
    "actionpack": "4.0.0",
    "activemodel": "4.0.0",
    "activerecord": "4.0.0",
    "activerecord-deprecated-finders": "1.0.3",
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
    "d3-rails": "3.1.4",
    "default-value-for": "3.0.0",
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
    "multi-json": "1.9.0",
    "multipart-post": "2.0.0",
    "oauth": "0.4.7",
    "oauth2": "0.8.1",
    "omniauth": "1.1.4",
    "omniauth-github": "1.0.2",
    "omniauth-google-oauth2": "0.2.2",
    "omniauth-oauth": "1.0.1",
    "omniauth-oauth2": "1.1.1",
    "omniauth-twitter": "1.0.1",
    "orm-adapter": "0.5.0",
    "polyglot": "0.3.4",
    "posix-spawn": "0.3.8",
    "protected-attributes": "1.0.3",
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
    "thread-safe": "0.3.1",
    "tilt": "1.4.1",
    "treetop": "1.4.15",
    "turbolinks": "2.2.0",
    "tzinfo": "0.3.39",
    "uglifier": "2.5.0",
    "warden": "1.2.3"
  };

  var solution = r.resolve(args.dependencies, args.constraints, { previousSolution: previousSolution }).answer;

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
      return !!_.findWhere(gems, {name: name});
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
          return PackageVersion.getValidServerVersion(v);
        })
        .sort(PackageVersion.compare)
        .uniq(true)
        .value();
    },
    getVersion: function (name, version) {
      var gem = _.find(gems, function (pv) {
        return pv.name === name && exactVersion(pv.number) === version;
      });

      var ecv = function (version) {
        // hard-coded, because lots of the constraints are > or >= which we
        // don't support anymore.  But constant ECV means that "compatible-with"
        // is interpreted as >=.
        return "0.0.0";
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
            "arch": "web"
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
      return "";
    var x = s.split(' ');
    if (x[0] === '~>' || x[0] === '>' || x[0] === '>=')
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
