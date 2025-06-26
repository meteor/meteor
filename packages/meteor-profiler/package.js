Package.describe({
  name: 'meteor-profiler',
  version: '1.0.0',
  summary: 'Advanced profiling tool for Meteor applications with hierarchical timing and CPU profiling support',
  documentation: 'README.md',
  git: 'https://github.com/meteor/meteor.git'
});

Package.onUse(function(api) {
  // Core dependencies
  api.use('ecmascript');
  api.use('modules');
  
  // Export the Profile object using mainModule
  api.export('Profile', 'server');
  api.mainModule('meteor-profiler.js', 'server');
});

Package.onTest(function(api) {
  api.use(['ecmascript']);
  api.use('meteor-profiler');
});