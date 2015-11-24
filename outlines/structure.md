# Application structure and code style

1. What's different between Meteor and other kinds of apps?
    1. All JavaScript, enables code sharing
    2. Structure is flexible
    3. Currently everything is about magic file names
    4. App scope vs. package scope vs. file scope variables
2. Client vs. server vs. both
3. Smooth path from prototype to production, three sizes of apps, S, M, L
4. General stuff
    1. Filenames - named the same as the export
        1. Every file exports one thing
    2. Avoid depending on load order via namespacing and Meteor.startup
        1. If you depend on load order, your best bet is a package
    3. Naming guidelines for everything [see bottom]
    4. Templates should have a CSS class that matches the template name, and other Blaze suggestions
    5. Meteor ES2015 style guide and linter (link to it, don't reproduce all of it)
    6. Perhaps this should include copypasta boilerplate - a standard template/component, a standard publication, standard route, etc? Basically the stuff a scaffolding framework would generate for you?
5. Small app
    1. Directory structure around features, not client/server
    2. LESS/SCSS files are in the same directory as components
    3. One file per unit - template, method, collection, etc
    4. Each app-scoped variable is a cost to maintainability, use JS scope as much as possible to control access
    5. There is a common directory called `imports` which has reusable JS/LESS/etc code, which can be imported from the rest of app code.
6. Medium app
    1. Why you want to switch to this structure
        1. You're starting to have a lot of app-scoped variables
        2. Load order is getting crazy
        3. You want smaller modules to test individually
    2. All package app structure
    3. app-lib package with all of your app's common dependencies
    4. Reusable packages vs. app-specific packages
        1. Lots of these guidelines go into the guide about building a package
        2. Don't use the username prefix for app local packages
    5. Grab tools from: https://forums.meteor.com/t/tools-meteor-update-testing-for-packages-for-everything/11881/7
7. Large app
    1. Why you want this structure
        1. Lots of different totally separate UIs, and you want to avoid intersecting the code
            1. Admin app
            2. Mobile vs. desktop
            3. Different classes of users
        2. Independently scaled and secured services
        3. Independent development teams
    2. Sharing code between different apps
        1. Local packages
        2. Git submodules
        3. PACKAGE_DIRS
        4. One or many repositories
    3. Sharing data between different apps
        1. Through database directly
        2. Through DDP API
        3. Through REST API
    4. Sharing user accounts between different apps
        1. AccountsClient/AccountsServer
        2. Accounts connection URL

### Appendix: Naming guidelines

#### Collections

- Name is plural
- Instance variable is capitalized camel case
- Collection name in DB is same as the instance variable

```js
FuzzyPinkElephants = new Mongo.Collection('FuzzyPinkElephants');
```

#### Methods and publications

> This part is uncertain! We should also consider dot-separated paths. You can find more details in the article/outline about Forms and Methods, where we are planning on suggesting people wrap Methods in a special object, so the actual method path can be an implementation detail.

- The identifiers of methods and publications should look like URLs: slash-separated, kebab-case
- The first part of the slash is the relevant collection name or module
- Start with a leading slash
- The idea is they can look like URLs and then eventually be URLs if you use a package like `simple:rest` to make them available over HTTP

```js
Meteor.methods({
  "/fuzzy-pink-elephants/add-friends"() { ... }
});
```

As mentioned in the #29 (forms/methods) discussion, we'd like to wrap up methods so that you call them via a module, so these names might end up being more of an implementation detail.

#### Packages, files, and exports

We're aware that currently not all Meteor core packages follow this pattern, but they probably should.

- Packages export at most one thing
- The export is named the same as the unprefixed package name, but capitalized and camel case
- Every file exports at most one thing
- The file is named exactly after the export, down to the casing
- If a package/file is attaching its export to an existing namespace, it's OK as long as the naming convention is preserved; for example it's fine to have a namespace for all of your app-specific packages, and they attach all of their exports there to avoid polluting the global namespace.

#### Templates

It would make sense for templates to be namespaced via dots, like so:

```html
<template name="fuzzyPinkElephants.thumbnailGrid">
  ...
</template>
```

It is probably worth it to make accessing these in JS simpler:

```js
// Before
Template['fuzzyPinkElephants.thumbnailGrid'].helpers({ ... });

// After?
Template.fuzzyPinkElephants.thumbnailGrid.helpers({ ... });
```

I imagine this would be a pretty small change to the `templating` package.

In the future, I hope templates are packaged as ES2015 modules and the whole namespacing question can disappear forever.

#### Everything else

* kebab, split by slashes
    * package names
    * css classes
    * urls
* camel, split by dots
    * JavaScript class names
    * JavaScript function names
    * template names - also namespaced by the module/collection
    * React component names
    * file names
    * database fields
