Package.describe({
  name: "meteor-tool",
  summary: "The Meteor command-line tool",
  version: '1.0.0',
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
  'minimongo'
]);
