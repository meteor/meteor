import { expect, test as rstestTest } from '@rstest/core';

rstestTest('same-package Rstest registry remains explicit', () => {
  expect(21 * 2).toBe(42);
});

Tinytest.add('same-package Tinytest registry remains explicit', test => {
  test.equal(21 * 2, 42);
});
