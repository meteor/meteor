Package.describe({
  name: "meteor-tool",
  summary: "The Meteor command-line tool",
  version: '2.0.1',
  internal: true
});

Package.includeTool([
  'meteor',
  'livedata',
  'minifiers',
  'dev-bundle-fetcher',
  'js-analyze',
  'logging',
  'mongo-livedata',
  'minimongo',
  'constraint-solver',
  'package-version-parser'
]);
