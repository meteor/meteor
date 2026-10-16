import { expect, test } from '@rstest/core';

test('colocated @rstest/core import selects native Rstest', () => {
  expect({ compiler: 'rspack', runtime: 'node' }).toEqual({
    compiler: 'rspack',
    runtime: 'node',
  });
});
