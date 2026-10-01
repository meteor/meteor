Plugin.registerTestRunner({
  id: 'fake-two',
  apiVersion: 1,
  activationPackages: ['fake-provider-two'],
}, () => ({
  validate() {},
  prepare() {
    return { mode: 'native-only', metadata: {} };
  },
}));
