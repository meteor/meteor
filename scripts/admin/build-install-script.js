// Running this script outputs the script that will be served at
// https://install.meteor.com/

var fs = require('fs');
var path = require('path');

var template = fs.readFileSync(
  path.join(__dirname, 'install-template.sh'), 'utf8');
var bootstrap = fs.readFileSync(
  path.join(__dirname, 'meteor-bootstrap.sh'), 'utf8');

process.stdout.write(
  template.replace(/SHARHERE/,
                   bootstrap.replace(/^/gm, 'X')));
