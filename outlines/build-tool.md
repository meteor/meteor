# Build tool outline

1. What does the Meteor build tool do?
    1. Runs constantly and watches files to be served
    2. Runs build plugins to convert “source” files to “compiled” files
    3. Combines all of the packages you're using
    4. Builds for production by applying build plugins and then minifiers
    5. The built format of a Meteor app is completely different from the source code, you definitely don't deploy a Meteor app just by putting up your source code and typing meteor run
2. The build tool enables seamless, zero-configuration usage of many popular transpiled languages
    1. Build plugins transpile only the package or app where they are directly added
    2. Only one source handler per file extension
    3. Supports source maps so that debugging works great
3. JavaScript transpilation
    1. ES2015+ turned on by default with the ecmascript package
        1. Link to docs of all features turned on
        2. Link to the “cost” of ecmascript, and other relevant blog posts
    2. CoffeeScript in the coffeescript package
        1. Basically works out of the box, is very popular in the Meteor community
    3. Typescript is more experimental, link to some of the different options out there but we might not be able to recommend it as a super stable, first-class approach at the moment. This should improve once we have better support for modules
        1. Ask Uri how this ties into Angular 2
4. Templating
    1. The most common one is templating which compiles .html files into Blaze code - you might be using build plugins without knowing it. It comes inside the blaze-html-templates package
    2. You can replace Spacebars with Jade using mquandalle:jade
    3. For React developers there are two main options:
        1. JSX in the jsx package
            1. Works exactly like ecmascript, but with the jsx option enabled.
        2. Compilers that convert HTML templates into React elements, for example timbrandin:sideburns - figure out how mature this is - perhaps this is just a link to the documentation if it's not quite done yet
    4. Angular comes with its own template pre-compiler that works with .ng.html files, comes in the angular package
5. CSS pre-processors
    1. LESS, SASS and Stylus all work very similarly, and have overlapping feature sets - it's up to you which syntax you want to use
    2. “main” files vs. “import” files
        1. Main files get converted to CSS eagerly
        2. Import files are only evaluated when imported from a main file, and should probably only contain mixins/variables, so that if you import them multiple times you don't get multiple copies of the CSS
    3. How to import mixins and variables from packages (enabled in Meteor 1.2)
    4. How to customize Bootstrap/Semantic UI
6. CSS post-processors
    1. In the current Meteor build system, there is not a separate step for CSS post-processors, so they need to be built either into the minifier or compiler
    2. **BIG CODE ITEM: POST-CSS IN MINIFIERS**
7. Minification
    1. Done by default using standard-minifiers
8. Packaging
    1. Meteor packages
        1. Packages on Atmosphere vs. local packages
            1. The built format is totally different
            2. See an example of a built package in `~/.meteor/packages` (we'll pick a specific example and compare the source code and output)
        2. Link to chapter about building a package
    2. NPM
        1. In your app with meteorhacks:npm
        2. This just makes a local package, read about NPM in packages in the package article
        3. Bundle for client-side with cosmos:browserify, link to React guide for React components
    3. Bower
        1. mquandalle:bower, learn more about this. Perhaps it's just a link
