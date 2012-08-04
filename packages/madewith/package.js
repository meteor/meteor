Package.describe({
  summary: "Made With Meteor badge"
});

Package.on_use(function (api) {
  api.use(['livedata', 'underscore', 'spark', 'templating'], 'client');

  api.add_files([
    'madewith.css',
    'madewith_badge.css',
    'madewith.html',
    'madewith.js'], 'client');
});
