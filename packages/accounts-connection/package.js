Package.describe({
  summary: "Provides a separate DDP connection for accounts",
  version: "1.0.0-winr.3"
});

Package.onUse(function(api){
  // export to both, should be undefined on server
  api.export('Accounts_connection');
  api.addFiles([
    'accounts_connection.js'
  ], 'client');
});
