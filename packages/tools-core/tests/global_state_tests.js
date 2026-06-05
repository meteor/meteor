import { Tinytest } from 'meteor/tinytest';
import {
  getGlobalState,
  setGlobalState,
  removeGlobalState,
} from 'meteor/tools-core/lib/global-state';

Tinytest.add('tools-core - global-state - reads persisted values', test => {
  const key = 'tools-core.test.global-state';

  removeGlobalState(key);
  test.equal(getGlobalState(key, 'default'), 'default');

  setGlobalState(key, 'value');
  test.equal(getGlobalState(key, 'default'), 'value');

  removeGlobalState(key);
  test.equal(getGlobalState(key, 'default'), 'default');
});
