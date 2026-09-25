import assert from 'assert';
import { Meteor } from 'meteor/meteor';
import { getMessage } from '@legacy/legacy-message';
import notice from '@legacy/message.notice';

describe('legacy test entry', function () {
  it('uses the legacy Rspack compilation, loader, and async chunk', async function () {
    const { getBuildArch } = await import('@legacy/lazy');
    assert.strictEqual(Meteor.isModern, false);
    assert.strictEqual(getBuildArch(), 'web.browser.legacy');
    assert.strictEqual(notice, 'RSPACK LOADER');
    assert.strictEqual(getMessage(), 'missing');
    document.documentElement.setAttribute('data-legacy-test', 'passed');
  });
});
