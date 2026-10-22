import type { Config } from "@swc/core";

const config: Config = {
  jsc: {
    transform: {
      react: {
        runtime: "automatic",
      },
    },
  },
};

export default config;
