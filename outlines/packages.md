# Building a package

1. Why you might want to build a package
    1. You have a package-based app
    2. You want to publish some code for people to use in the community
    3. You want to share code within your organization between different apps
2. Creating a package using the command line tool
3. Parts of a Meteor package
    1. What different parts of package.js mean, point to the docs
    2. Depending on other packages and build plugins
         1. You can't depend on a specific version of Meteor; that's not what versionsFrom does
    3. Adding files and assets
    4. About architectures
    5. Semver and the constraint solver
    6. Cordova plugins
    7. NPM packages
        1. NPM on the client with Browserify
        2. Converting asynchronous Node APIs to synchronous-looking Fiber APIs
            1. Meteor.bindEnvironment
            1. Meteor.wrapAsync
            2. Promise and Promise.await
            3. (Probably in Meteor 1.3) `async`/`await`
8. Local packages vs. published packages, and the Isopack format
9. Testing your package (basically just link to testing guide)
9. Structuring your package
    1. Standard template for package.js file
    1. Try to export only one symbol, that matches the name of your package
    2. Different things you might want to have in a package
        1. LESS mixins
        2. Templates
        3. Collections - don't expose the collection directly, have an API for talking to it in case you need to change the schema or guarantees later
10. Build plugins
    1. Build plugins are the way to extend Meteor's build system. If you find yourself writing a package that does something with an app's source code, it almost certainly should be implemented as a build plugin to take advantage of Meteor's built in features, like caching
    2. A basic build plugin that compiles files one-to-one
    3. A caching build plugin that compiles files one-to-one
    4. Compiling inter-related files
    5. Some good examples of build plugins to build off of
