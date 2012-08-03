Package.describe({
  summary: "Meteor's machinery for making arbitrary templates reactive",
  internal: true
});

Package.on_use(function (api) {
  api.use('livedata');
  api.use('universal-events');
  api.use(['underscore', 'session', 'liverange'], 'client');

  // XXX Depends on jquery because we need a selector engine to resolve
  // event maps. What would be nice is, if you've included jquery or
  // zepto, use one of those; if not, ship our own copy of sizzle (but,
  // you still want the event object normalization that jquery provides?)
  api.use('jquery');

  api.add_files(['livedocument.js'], 'client');
  api.add_files(['liveui.js', 'patcher.js'],
                'client');
});
