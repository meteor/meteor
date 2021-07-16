let Method;

if (Meteor.isClient) {
  Method = require('./method_client').default;
}

if (Meteor.isServer) {
  Method = require('./method_server').default;
}

export let serverOnlyCount = 0;
export let serverCount = 0;
export let clientCount = 0;
export const commonMethodServerOnly = new Method({ name: 'method_test_common_1' });
export const commonMethodServerAndClient = new Method({ name: 'method_test_common_2' });
export const throwingMethod = new Method({ name: 'method_test_common_3' });

commonMethodServerOnly.addBeforeHook(() => {
  serverOnlyCount += 1;
})

if (Meteor.isServer) {
  commonMethodServerOnly.setHandler((a, b) => {
    return a * b;
  });
}

commonMethodServerAndClient.setHandler((a) => {
  return a + 1;
});

commonMethodServerAndClient.addAfterHook(({ result }) => {
  if (Meteor.isServer) {
    serverCount = result + 1;
  }

  if (Meteor.isClient) {
    clientCount = result + 1;
  }
});

throwingMethod.setHandler(() => {
  throw new Meteor.Error('threw');
})