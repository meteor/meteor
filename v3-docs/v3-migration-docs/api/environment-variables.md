
# Environment Variables

Meteor provides the `Meteor.EnvironmentVariable` class, which helps maintain context across different boundaries.

With Meteor 3.0, we added support for asynchronous flows and improved how context is managed. As a result, some packages began losing context data, as described [in this issue](https://github.com/meteor/meteor/issues/13258).

If your app or package uses `EnvironmentVariable`, make sure to use `EnvironmentVariable.withValue` at the top level to correctly preserve and propagate the context.

For instance, when updating publish behavior and introducing a `new EnvironmentVariable` context, you need to adjust your code as follows:

```javascript
const _publishConnectionId = new Meteor.EnvironmentVariable<
  string | undefined
  >();

// Before
function patchPublish(publish: typeof Meteor.publish) {
  return function (this: typeof Meteor, name, func, ...args) {
    return publish.call(
      this,
      name,
      function (...args) {
        return _publishConnectionId.withValue(this?.connection?.id, () =>
          func.apply(this, args),
        );
      },
      ...args,
    );
  } as typeof Meteor.publish;
}

// After
function patchPublish(publish: typeof Meteor.publish) {
  return function (this: typeof Meteor, name, func, ...args) {
    return _publishConnectionId.withValue(this?.connection?.id, () => {
      return publish.call(
        this,
        name,
        function (...args) {
          return func.apply(this, args);
        },
        ...args,
      );
    });
  } as typeof Meteor.publish;
}
```

This example demonstrates the migration applied to the [`universe:i18n` package](https://github.com/vazco/meteor-universe-i18n/pull/191).
