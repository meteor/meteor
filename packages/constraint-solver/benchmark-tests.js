// "Benchmarks" here are just slow tests of the constraint solver.
// You can see roughly how long they take by looking at how long the
// test takes to run.  Because they are slow, they don't run when you
// run tests unless you turn them on with an environment variable.

// The benchmarks can totally be run on the client, it's just harder to
// detect the environment variable.
var runBenchmarks = Meteor.isServer && !!process.env.CONSTRAINT_SOLVER_BENCHMARK;

var railsCatalog = getCatalogStub(railsGems);
var sinatraCatalog = getCatalogStub(sinatraGems);

runBenchmarks && Tinytest.add("constraint solver - benchmark on gems - sinatra", function (test) {
  var r = new ConstraintSolver.PackagesResolver(sinatraCatalog);

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
    "d3-rails": "3.1.10",
    "default-value-for": "3.0.0",
    "devise": "3.0.4",
    "devise-async": "0.8.0",
    "erubis": "2.7.0",
    "execjs": "2.0.2",
    "faraday": "0.9.0",
    "github-markup": "1.1.0",
    "haml": "4.0.5",
    "haml-rails": "0.5.3",
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
    "omniauth-github": "1.0.3",
    "omniauth-google-oauth2": "0.2.2",
    "omniauth-oauth": "1.0.1",
    "omniauth-oauth2": "1.1.1",
    "omniauth-twitter": "1.0.1",
    "orm-adapter": "0.5.0",
    "polyglot": "0.3.4",
    "posix-spawn": "0.3.8",
    "protected-attributes": "1.0.7",
    "rack": "1.5.2",
    "rack-test": "0.6.2",
    "rails": "4.0.4",
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
    "turbolinks": "2.2.1",
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
    getSortedVersionRecords: function (name) {
      var versions = _.chain(gems)
        .filter(function (pv) { return pv.name === name; })
        .pluck('number')
        .filter(function (v) {
          return PackageVersion.getValidServerVersion(v);
        })
        .sort(PackageVersion.compare)
        .uniq(true)
        .value();
      return _.map(versions, function (version) {
        var gem = _.find(gems, function (pv) {
          return pv.name === name && pv.number === version;
        });

        var packageVersion = {
          packageName: gem.name,
          version: gem.number,
          dependencies: {}
        };

        _.each(gem.dependencies, function (dep) {
          var name = dep[0];
          var constraint = dep[1];

          packageVersion.dependencies[name] = {
            constraint: constraint,
            references: [{
              "arch": "web"
            }, {
              "arch": "os" }]
          };
        });

        return packageVersion;
      });
    }
  };
}
