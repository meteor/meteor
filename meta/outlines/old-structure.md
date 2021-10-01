# Application structure and code style

XXX will change majorly before Guide release due to ES2015 modules

1. What's different between Meteor and other kinds of apps?
    1. All JavaScript, enables code sharing
    2. Structure is flexible
    2. Client vs. server vs. both
2. General JavaScript stucture
    1. Directory structure around features, not client/server
    2. LESS/SCSS files are in the same directory as components
    3. One file per unit - template, method, collection, etc
    4. Example app structure, model after todos XXX
7. Splitting your project into multiple apps/entry points
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
