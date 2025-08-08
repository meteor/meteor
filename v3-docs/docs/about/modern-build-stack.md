# Modern Build Stack

The Meteor bundler is made up of several key components that enhance your experience both during development and when deploying to production. These include:

- **Transpiler**: Responsible for converting each file into a syntax compatible across different browsers and runtime environments.
- **Bundler**: Handles discovering your app’s files and dependencies, including Meteor packages and core modules, then links them into production-ready bundles. It also applies optimizations to produce lighter builds and faster processes.
- **Dev Server**: During development, it watches for file changes, and supports fast feedback via HMR, bundle visualizers, debug tools, and more. At runtime, it provides a full-featured server environment with support for SSR and modern APIs powered by Express.

To improve the development and deployment experience for all Meteor projects, we’re revamping each of these components with a focus on better performance, smarter tooling, and leaner bundle sizes:

- **Modern Transpiler**: Meteor is adopting **SWC** as a faster alternative to Babel.
- **Modern Bundler**: A new bundler will handle only your app’s code, supporting tree-shaking, popular plugins, and better features for both development and production. Meanwhile, Meteor’s core bundler will continue handling Meteor-specific tasks, such as compiling Atmosphere packages, with optimized workflows.
- **Modern Dev Server**: The dev server remains a core part of Meteor, now with ongoing improvements in performance and developer features. A new bundler will complement the dev server, providing additional enhancements.

## Quick start

Start using the new build stack by creating a Meteor app, or add this to your `package.json` in an existing one:

```json
"meteor": {
  "modern": true
}
```

With this configuration, you enable all improvements from the modern build stack in your Meteor app.

See the following sections to learn about each component and its settings:

- [Transpiler](modern-build-stack/transpiler-swc.md)
- [Bundler](modern-build-stack/bundler.md)
- [Dev Server](modern-build-stack/dev-server.md)
