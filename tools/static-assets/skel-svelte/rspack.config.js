const { defineConfig } = require("@meteorjs/rspack");
const sveltePreprocess = require("svelte-preprocess");

/**
 * Rspack configuration for Meteor projects.
 *
 * Provides typed flags on the `Meteor` object, such as:
 * - `Meteor.isClient` / `Meteor.isServer`
 * - `Meteor.isDevelopment` / `Meteor.isProduction`
 * - …and other flags available
 *
 * Use these flags to adjust your build settings based on environment.
 */
module.exports = defineConfig((Meteor) => {
  return {
    ...(Meteor.isClient && {
      resolve: {
        extensions: [".mjs", ".js", ".ts", ".svelte", ".json"],
        mainFields: ["svelte", "browser", "module", "main"],
        conditionNames: ["svelte", "browser", "import", "module", "default"],
      },
      module: {
        rules: [
          {
            test: /\.svelte$/,
            use: [
              {
                loader: "svelte-loader",
                options: {
                  compilerOptions: { dev: !Meteor.isProduction },
                  emitCss: Meteor.isProduction,
                  hotReload: !Meteor.isProduction,
                  preprocess: sveltePreprocess({
                    sourceMap: !Meteor.isProduction,
                    postcss: true,
                  }),
                },
              },
            ],
          },
        ],
      },
    }),
  };
});
