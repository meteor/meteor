Package.describe({
    summary: "Login service for Instagram accounts"
});

Package.on_use(function(api) {
    api.use('accounts-base', ['client', 'server']);
    api.use('accounts-oauth2-helper', ['client', 'server']);
    api.use('http', ['client', 'server']);
    api.use('templating', 'client');

    api.add_files(
        ['instagram_configure.html', 'instagram_configure.js'],
        'client');

    api.add_files('instagram_common.js', ['client', 'server']);
    api.add_files('instagram_server.js', 'server');
    api.add_files('instagram_client.js', 'client');
});
