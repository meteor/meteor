import { defineConfig } from "@meteorjs/rspack";
import { TsCheckerRspackPlugin } from "ts-checker-rspack-plugin";

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
export default defineConfig((Meteor) => {
  return {
    ...(Meteor.isClient && {
      plugins:
        !Meteor.isTest && !Meteor.isAppTest
          ? [
              new TsCheckerRspackPlugin({
                typescript: { tsgo: true },
                issue: {
                  // Meteor generates this package declaration during startup.
                  exclude: ({ code, message }) =>
                    code === "TS2307" && message.includes("meteor/react-meteor-data/suspense"),
                },
              }),
            ]
          : [],
      module: {
        rules: [
          {
            test: /\.css$/,
            use: ["postcss-loader"],
            type: "css",
          },
        ],
      },
    }),
  };
});
