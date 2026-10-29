import { beforeEach } from '@rstest/core';

beforeEach(({ task }) => {
  globalThis.__meteorRstestSetupLoaded = true;
  task.meta.setupFile = 'meteor-runtime';
});
