# rspack

The rspack package hooks into the Meteor lifecycle to run the rspack bundler independently, compiling app code while preserving Meteor packages as external. It automatically integrates the rspack dev server and HMR mechanism, and manages client and server bundles for development and production. By default, rspack is configured to support secured code for client and server, tree shaking, full ESM support with export fields in package.json, and so on. It also enables the user to provide custom configuration.
