var selftest = require('../selftest.js');
var Sandbox = selftest.Sandbox;

selftest.define("springboard", ['checkout'], function () {
  var s = new Sandbox({
    warehouse: {
      v1: { tools: 'tools1', notices: ["kitten"] },
      v2: { tools: 'tools2', notices: ["puppies"], upgraders: ["cats"],
            latest: true }}
  });
  var run;

  // If run not in an app dir, runs the latest version ...
  run = s.run("--version");
  run.read('Release v2\n');
  run.expectEnd();
  run.expectExit(0);

  // ... unless you asked for a different one.
  run = s.run("--version", "--release", "v1");
  run.read('Release v1\n');
  run.expectEnd();
  run.expectExit(0);

  // Apps are created with the latest release ...
  run = s.run("create", "myapp").expectExit(0);
  s.cd('myapp');
  run = s.run("--version");
  run.read('Release v2\n');
  run.expectExit(0);

  // ... unless you asked for a different one.
  s.cd('..');
  run = s.run("create", "myapp2", "--release", "v1").expectExit(0);
  s.cd('myapp2');
  run = s.run("--version");
  run.read('Release v1\n');
  run.expectExit(0);
});


// XXX add a tools-version command to confirm we're springboarding

selftest.define("checkout", ['checkout'], function () {
  var s = new Sandbox;
  var run;

  // Can't specify a release when running Meteor from a checkout
  run = s.run("--release", "v1");
  run.matchErr("Can't specify");
  run.expectExit(1);

});








/*
"Sorry, this project uses Meteor " + name + ", which is not installed and\n"+
"could not be downloaded. Please check to make sure that you are online.\n");


"Sorry, Meteor " + name + " is not installed and could not be downloaded.\n"+
"Please check to make sure that you are online.\n");

"Problem! This project says that it uses version " + name + " of Meteor,\n" +
"but you don't have that version of Meteor installed and the Meteor update\n" +
"servers don't have it either. Please edit the .meteor/release file in the\n" +
"project and change it to a valid Meteor release.\n");

"You must specify a Meteor version with --release when you work with this\n" +
"project. It was created from an unreleased Meteor checkout and doesn't\n" +
"have a version associated with it.\n" +
"\n" +
"You can permanently set a release for this project with 'meteor update'.\n");

"=> Running Meteor from a checkout -- overrides project version (%s)\n",


*/