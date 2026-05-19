import assert from 'assert';
import { createClientMessage, createServerMessage } from '@example/shared';

describe('pnpm-monorepo', function () {
  it('package.json has correct name', async function () {
    const { name } = await import('../package.json');
    assert.strictEqual(name, 'meteor-pnpm-app');
  });

  it('loads compiled workspace packages', function () {
    assert.strictEqual(createClientMessage('test'), 'domain:client:test');
    assert.strictEqual(createServerMessage('test'), 'domain:server:test');
    console.log('pnpm workspace packages compiled');
  });

  if (Meteor.isClient) {
    it('client is not server', function () {
      assert.strictEqual(Meteor.isServer, false);
    });
  }

  if (Meteor.isServer) {
    it('server is not client', function () {
      assert.strictEqual(Meteor.isClient, false);
    });
  }

  it('is test', function () {
    assert.strictEqual(Meteor.isTest, true);
    assert.strictEqual(Meteor.isAppTest, false);
  });
});
