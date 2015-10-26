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
    3. Naming guidelines for everything
        1. https://github.com/meteor/guide/issues/9#issuecomment-148800085
    4. Templates should have a CSS class that matches the template name, and other Blaze suggestions
    5. Meteor ES2015 style guide (link to it, don't reproduce all of it)
    6. Perhaps this should include copypasta boilerplate - a standard template/component, a standard publication, standard route, etc? Basically the stuff a scaffolding framework would generate for you?
5. Small app
    1. Directory structure around features, not client/server
    2. LESS/SCSS files are in the same directory as components, with a separate directory for reusable mixins, other common stuff
    3. One file per unit - template, method, collection, etc
    4. Each app-scoped variable is a cost to maintainability, use JS scope as much as possible to control access
    5. XXX
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
