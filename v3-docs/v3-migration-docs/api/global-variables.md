# Global Variables

In Meteor 3, there are important changes regarding the definition of global variables in applications. This document provides guidelines on how to properly define globals in Meteor 3 and explains the implications of strict mode enforcement.

### Previous Approach

In previous versions of Meteor, you might have defined a global variable in your application using the following syntax:

```javascript
GlobalVar = { ... };
```

### New Approach in Meteor 3

With the introduction of strict mode in Meteor 3, the recommended approach for defining global variables in your application has changed. You should now use the `global` object to define globals:

```javascript
global.GlobalVar = { ... };
```

This change is necessary because strict mode, which is automatically enforced in certain situations in Meteor 3, does not support defining globals in the traditional way.

## Defining Global Variables in Packages

For packages, the process of defining global variables remains unchanged from Meteor 2. You can continue to define globals as you have previously without any modifications.

In Meteor packages, Meteor automatically adds a variable declaration within the package scope. This behavior prevents the need for using the `global` object and avoids the strict mode restrictions.

However, in applications, there is no equivalent "app scope," so globals defined in applications must be true globals, requiring the use of the `global` object.

Meteor 3 enforces strict mode for modules that use top-level await (TLA) or the `import` syntax. This enforcement aligns with JavaScript specifications and improves the overall consistency and compliance of your code.

For more detailed information on strict mode and its implications, refer to the [Strict Mode](./strict-mode.md) document.

## Conclusion

By following these guidelines, you can ensure that your global variable definitions are compatible with Meteor 3 and its strict mode enforcement. This will help maintain the stability and compliance of your application as you transition to the latest version of Meteor.