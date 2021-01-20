# react-fast-refresh
[Source code of released version](https://github.com/meteor/meteor/tree/master/packages/react-fast-refresh) | [Source code of development version](https://github.com/meteor/meteor/tree/devel/packages/react-fast-refresh)
***

This package updates modified React components in the running app for faster
feedback after changing a file. To be enabled, your app must:

- Use the `hot-module-replacement` package
- Use React 16.9.0 or newer

This package is disabled in production. It currently only supports the modern web client.

Learn more in the [React Fast Refresh docs](https://reactnative.dev/docs/fast-refresh)

React Fast Refresh can be disabled by setting the `DISABLE_REACT_FAST_REFRESH` environment variable before starting Meteor.
