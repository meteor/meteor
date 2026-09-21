import assert from 'assert';
import * as selftest from '../tool-testing/selftest';
import { ignoreHarmlessErrors } from '../isobuild/bundler';

selftest.define('IPC errors during app restarts', () => {
  for (const code of ['EPIPE', 'ERR_IPC_CHANNEL_CLOSED']) {
    const error = Object.assign(new Error('IPC send failed'), { code });
    assert.doesNotThrow(() => ignoreHarmlessErrors(error));
  }
  for (const message of ['process exited', 'channel closed']) {
    assert.doesNotThrow(() => ignoreHarmlessErrors(new Error(message)));
  }

  const unexpected = Object.assign(new Error('unexpected IPC failure'), { code: 'EINVAL' });
  assert.throws(() => ignoreHarmlessErrors(unexpected), error => error === unexpected);
});
