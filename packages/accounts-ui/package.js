Package.describe({
  summary: "Simple templates to add login widgets to an app",
  version: '1.4.3-rc300.7',
});

Package.onUse(api => {
  // Export Accounts (etc) to packages using this one.
  api.imply('accounts-base', ['client', 'server']);
  api.use('accounts-ui-unstyled', 'client');
  api.use('less@3.0.2 || 4.0.0', 'client');

  api.addFiles(['login_buttons.less'], 'client');
});
