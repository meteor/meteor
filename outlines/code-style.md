# Code style

1. Benefits of consistent code style
  1. Integration with default linters, checkers, transpilers, etc
  2. Easy for new people to get started on your code
  3. All Meteor code samples can follow your style
2. JavaScript and ES2015
  1. Use JavaScript and compile all of your code with the `ecmascript` package
  1. Follow the Meteor style guide, based on the AirBnB style guide
  2. Use ESLint using the standard config, which is made to work with `ecmascript`
    1. Running ESLint
    1. Setting up linting in your editor
    1. Setting up a linter commit hook
    1. Adding linting to your CI alongside tests
3. Meteor components
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
