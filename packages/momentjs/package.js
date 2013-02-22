var path = require('path');

Package.describe({
  summary: "A javascript date library for parsing, validating, manipulating, and formatting dates. Full Documentation available at momentjs.com"
});

Package.on_use(function (api) {

  api.add_files(path.join('js', 'moment.min.js'), 'client');


  // XXX this makes the paths to the icon sets absolute. it needs
  // to be included _after_ the standard bootstrap css so
  // that its styles take precedence.
  
  });