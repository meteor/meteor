Package.describe({
  summary: "The Meteor command-line tool",
  version: '1.0.0'
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
