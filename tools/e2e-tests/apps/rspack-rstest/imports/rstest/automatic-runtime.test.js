import { expect, test } from '@rstest/core';
import { runtimeContext } from './runtime-context.js';

test('colocated transitive meteor import selects real Meteor host', () => {
  expect(runtimeContext.isTest || runtimeContext.isAppTest).toBe(true);
  expect(Number(runtimeContext.isServer) + Number(runtimeContext.isClient)).toBe(1);
});
