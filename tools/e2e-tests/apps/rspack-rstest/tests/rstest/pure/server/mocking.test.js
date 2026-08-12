import { expect, rs, test } from '@rstest/core';
import { resolveCompiler } from './mock-target.js';

rs.mock('./mock-target.js', () => ({
  resolveCompiler: rs.fn(() => 'mocked-rspack'),
}));

test('pure Rstest hoists module mocks through Meteor Rspack config', () => {
  expect(resolveCompiler()).toBe('mocked-rspack');
  expect(resolveCompiler).toHaveBeenCalledTimes(1);
});
