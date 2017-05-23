Package.describe({
  summary: "Chosen makes long, unwieldy select boxes much more user-friendly."
});

Package.on_use(function (api) {
  api.add_files('css/chosen.css', 'client');
  api.add_files('js/chosen.jquery.min.js', 'client');
  api.add_files('img/chosen-sprite.png', 'client');

  // XXX this makes the paths to the icon sets absolute. it needs
  // to be included _after_ the standard chosen css so
  // that its styles take precedence.
  api.add_files('css/override.css', 'client');
});
