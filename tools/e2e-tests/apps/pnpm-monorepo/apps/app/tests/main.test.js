import assert from 'assert';
import { accentColor, createClientMessage, createServerMessage } from '@example/shared';

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

  it('resolves transitive npm dependencies through the pnpm store', function () {
    // `accentColor` is computed by the `color` npm dependency of @example/shared,
    // which pnpm resolves via color-convert/color-name and
    // color-string/simple-swizzle/is-arrayish, none hoisted to the app.
    assert.strictEqual(accentColor, '#40E0D0');
    console.log('pnpm transitive dependencies resolved');
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
