
var fs = require('fs');
var path = require('path');
var semver = require('semver');


var optimist = require('optimist');

var updater = require(path.join(__dirname, '..', 'app', 'lib', 'updater.js'));
var _ = require('underscore');

// What files to update. Relative to project root.
var UPDATE_FILES = [path.join('app', 'lib', 'updater.js'),
                    path.join('app', 'meteor', 'post-upgrade.js'),
                    path.join('admin', 'install-s3.sh'),
                    path.join('admin', 'debian', 'changelog'),
                    path.join('admin', 'meteor.spec'),
                    path.join('docs', 'client', 'docs.js'),
                    path.join('docs', 'client', 'docs.html'),
                    [path.join('admin', 'manifest.json'), 'g']];

// Files to update for dev_bundle
var BUNDLE_FILES = [path.join('admin', 'generate-dev-bundle.sh'), 'meteor'];


var opt = require('optimist')
  .alias('dev_bundle', 'd')
  .boolean('dev_bundle')
  .describe('dev_bundle', 'Update the dev_bundle version, not the main version.')
  .alias('new_version', 'n')
  .describe('new_version', 'A new version number. Default is to increment patch number.')
  .usage('Usage: $0 [options]')
;
var argv = opt.argv;
if (argv.help) {
  process.stdout.write(opt.help());
  process.exit(1);
}

var CURRENT_VERSION = updater.CURRENT_VERSION;
var files = UPDATE_FILES;

if (argv.dev_bundle) {
  var version_path = path.join(__dirname, '..', 'meteor');
  var version_data = fs.readFileSync(version_path, 'utf8');
  var version_match = /BUNDLE_VERSION=([\d\.]+)/.exec(version_data);
  CURRENT_VERSION = version_match[1];
  files = BUNDLE_FILES;
}

var NEW_VERSION = argv.new_version || semver.inc(CURRENT_VERSION, 'patch');

console.log("Updating from " + CURRENT_VERSION + " to " + NEW_VERSION);

_.each(files, function (file) {
  var flags = '';
  if (file instanceof Array) {
    flags = file[1];
    file = file[0];
  }
  var fp = path.join(__dirname, '..', file);
  var text = fs.readFileSync(fp, 'utf8');
  var new_text = text.replace(new RegExp(CURRENT_VERSION, flags), NEW_VERSION);
  fs.writeFileSync(fp, new_text, 'utf8');

  console.log("updated file: " + fp);
});

console.log("Complete");
