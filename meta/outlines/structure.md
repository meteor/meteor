# Application structure and code style

1. What's different between Meteor and other kinds of apps?
    1. All JavaScript, enables code sharing
    2. Different envrironment: Client vs. server vs. both
    3. Module system is new, but we recommend its use (answer to why `imports/`?)
2. General JavaScript structure
    1. All code in `imports/` apart from initializers in `main/`
    2. Group code into data - `api/` and rendering - `client` (?)
    1. Directory structure around features, not client/server
    2. LESS/SCSS files are in the same directory as components
    3. One file per unit - template, method, collection, test etc
    4. Example app structure, model after todos XXX
3. Splitting your project into multiple apps/entry points
    1. Why you want this structure
        1. Lots of different totally separate UIs, and you want to avoid intersecting the code
            1. Admin app
            2. Mobile vs. desktop
            3. Different classes of users
        2. Independently scaled and secured services
        3. Independent development teams
    2. Sharing code between different apps
        1. Local packages / modules
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
4. Benefits of consistent code style
  1. Integration with default linters, checkers, transpilers, etc
  2. Easy for new people to get started on your code
  3. All Meteor code samples can follow your style
5. JavaScript and ES2015
  1. Use JavaScript and compile all of your code with the `ecmascript` package
  1. Follow the Airbnb style guide
  2. Use ESLint using the standard ABnB config, which is made to work with `ecmascript`
    1. Running ESLint
    1. Setting up linting in your editor
    1. Setting up a linter commit hook
    1. Adding linting to your CI alongside tests
6. Meteor components
  1. Collections
    1. Name is plural
    1. Instance variable is capitalized camel case
    1. Collection name in DB is same as the instance variable
    1. Fields in MongoDB should be camel-cased
  2. Methods and publications
    1. Camel cased, namespaced with dot separators
    1. Use mdg:validated-method to reference methods by JavaScript scope
  3. Packages, files, and exports
    1. Use ES2015 exports
    1. Each file should represent one logical module, rather than having a file called `utils.js` that exports a variety of unrelated things
    1. If a file defines a class or component, the file should be named the same as the class, down to the case
  4. Templates and components
    1. Blaze templates should be namespaced via dots since they can't be exported via modules; the HTML, CSS, and JS file related to the template should have the same name.
    1. React components should be treated as you would normal JavaScript modules/functions
