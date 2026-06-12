Package.describe({
  summary: "Integrate Capacitor as a mobile target on top of Meteor's web.cordova build",
  version: '0.1.0-alpha.0',
});

Package.registerToolExtension({
  id: 'meteor:capacitor',
  label: 'Meteor Capacitor',
  apiVersion: '1.0',
  platforms: [
    {
      name: 'android',
      kind: 'mobile',
      provider: 'capacitor',
      claimsBuiltIn: true,
      aliases: ['capacitor:android'],
      buildTargets: ['web.capacitor'],
      nativeProjectDir: 'android',
      hcpMode: 'native-runtime',
    },
    {
      name: 'ios',
      kind: 'mobile',
      provider: 'capacitor',
      claimsBuiltIn: true,
      aliases: ['capacitor:ios'],
      buildTargets: ['web.capacitor'],
      nativeProjectDir: 'ios',
      hcpMode: 'native-runtime',
    },
  ],
  buildTargets: [
    {
      name: 'web.capacitor',
      baseArch: 'web.cordova',
      outputKind: 'web-dir',
      runtime: 'native-webview',
      hcpMode: 'native-runtime',
    },
  ],
  capabilities: {
    run: true,
    build: true,
    addPlatform: true,
    removePlatform: true,
    nativeSync: true,
    nativeOpen: true,
    targetSelection: true,
    hcp: true,
  },
});

Package.registerBuildPlugin({
  name: 'capacitor',
  sources: [
    'lib/constants.js',
    'lib/dependencies.js',
    'lib/build-context.js',
    'lib/transforms.js',
    'lib/readiness.js',
    'lib/processes.js',
    'lib/command.js',
    'capacitor_plugin.js',
  ],
  use: ['modules@0.8.2', 'ecmascript', 'tools-core', 'boilerplate-generator'],
});

Package.onUse(function (api) {
  api.use('ecmascript', ['client', 'server']);
  api.use(['tools-core', 'webapp']);

  api.mainModule('capacitor_server.js', 'server');
});

Package.onTest(function (api) {
  api.use(['tinytest', 'ecmascript', 'capacitor', 'tools-core']);
  api.addFiles(['capacitor_tests.js'], 'server');
});
