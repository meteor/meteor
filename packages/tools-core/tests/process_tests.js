import { Tinytest } from 'meteor/tinytest';

import {
  buildProcessEnv,
} from 'meteor/tools-core/lib/process';

Tinytest.add('tools-core - process env removes color override conflicts', test => {
  const originalNoColor = process.env.NO_COLOR;
  process.env.NO_COLOR = '1';

  try {
    const env = buildProcessEnv({
      FORCE_COLOR: '0',
      TERM: 'dumb',
      CUSTOM_VALUE: '1',
    });

    test.equal(env.CUSTOM_VALUE, '1');
    test.equal(env.FORCE_COLOR, '1');
    test.equal(env.TERM, 'xterm-256color');
    test.isFalse('NO_COLOR' in env);
  } finally {
    if (originalNoColor === undefined) {
      delete process.env.NO_COLOR;
    } else {
      process.env.NO_COLOR = originalNoColor;
    }
  }
});
