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
