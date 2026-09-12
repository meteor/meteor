import assert from 'assert';
import { getTestPayload } from './client-linked/helper';

describe('symlink-monorepo client', function () {
  it('resolves test helper imports relative to the client test symlink', function () {
    const payload = getTestPayload('client-test');
    assert.deepStrictEqual(payload, {
      context: 'client-test',
      peer: 'client-test-peer-from-symlink-location',
      location: 'app/tests/client-linked/peer.ts',
      value: 'client-test:client-test-peer-from-symlink-location',
    });
    console.log('SYMLINK_E2E_TEST_CLIENT_OK');
  });
});
