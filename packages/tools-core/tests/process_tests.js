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

import { spawnProcess } from "../lib/process.js";

Tinytest.addAsync(
  "tools-core - spawnProcess - removes explicitly unset environment variables",
  async (test) => {
    const variableName = "TOOLS_CORE_UNSET_ENV_TEST";
    const previousValue = process.env[variableName];
    process.env[variableName] = "parent-value";

    try {
      const output = await new Promise((resolve, reject) => {
        let stdout = "";

        spawnProcess(
          process.execPath,
          [
            "-e",
            `process.stdout.write(JSON.stringify({ unset: process.env.${variableName}, kept: process.env.TOOLS_CORE_KEPT_ENV_TEST }))`,
          ],
          {
            env: {
              [variableName]: "option-value",
              TOOLS_CORE_KEPT_ENV_TEST: "kept-value",
            },
            unsetEnv: [variableName],
            onStdout(data) {
              stdout += data;
            },
            onExit(code) {
              if (code === 0) {
                resolve(stdout);
              } else {
                reject(new Error(`child exited with code ${code}`));
              }
            },
            onError: reject,
          },
        );
      });

      test.equal(JSON.parse(output), {
        kept: "kept-value",
      });
    } finally {
      if (previousValue === undefined) {
        delete process.env[variableName];
      } else {
        process.env[variableName] = previousValue;
      }
    }
  },
);
