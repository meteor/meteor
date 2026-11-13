# Changelog

## 1.9.2, unreleased

- Update the deprecated Meteor fork to Underscore 1.9.2, [PR#12994](https://github.com/meteor/meteor/pull/12994).
- Preserve Meteor's handling of plain objects with a numeric `length` field and the `_.template(text, data, settings)` API. Pass `null` as the second argument to compile with custom settings.
