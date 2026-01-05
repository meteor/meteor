Package.describe({
  summary: "Simple templates to add login widgets to an app",
  version: '1.5.0-rc340.2',
});

Package.onUse(api => {
  // Export Accounts (etc) to packages using this one.
  api.imply('accounts-base', ['client', 'server']);
  api.use('accounts-ui-unstyled', 'client');

  api.addFiles(['login_buttons.css'], 'client');
});
