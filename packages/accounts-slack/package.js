Package.describe({
  summary: 'Login service for Slack accounts',
  version: '1.0.0',
});

Package.onUse(api => {
  api.use('ecmascript');
  api.use('accounts-base', ['client', 'server']);
  api.imply('accounts-base', ['client', 'server']);

  api.use('accounts-oauth', ['client', 'server']);
  api.use('slack-oauth');
  api.imply('slack-oauth');

  api.use(
    ['accounts-ui', 'slack-config-ui'],
    ['client', 'server'],
    {weak: true}
  );
  api.addFiles('notice.js');
  api.addFiles('slack.js');
});
