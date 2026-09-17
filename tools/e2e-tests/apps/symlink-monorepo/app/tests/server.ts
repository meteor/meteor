import assert from 'assert';
import { getTestPayload } from './server-linked/helper';

describe('symlink-monorepo server', function () {
  it('resolves test helper imports relative to the server test symlink', function () {
    const payload = getTestPayload('server-test');
    assert.deepStrictEqual(payload, {
      context: 'server-test',
      peer: 'server-test-peer-from-symlink-location',
      location: 'app/tests/server-linked/peer.ts',
      value: 'server-test:server-test-peer-from-symlink-location',
    });
    console.log('SYMLINK_E2E_TEST_SERVER_OK');
  });
});
