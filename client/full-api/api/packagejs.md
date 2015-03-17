{{#template name="apiPackagejs"}}

<h2 id="packagejs"><span>Package.js</span></h2>

{{#markdown}} A package is a directory containing a package.js file, which
contains roughly three major sections: a basic description, a package
definition, and a test definition. By default, the directory name is the name of
the package.

The `package.js` file below is an example of how to use the packaging API. The
rest of this section will explain the specific API commands in greater detail.


    /* Information about this package */
    Package.describe({
      // Short two-sentence summary.
      summary: "What this does",
      // Version number.
      version: "1.0.0",
      // Optional.  Default is package directory name.
      name: "username:package-name",
      // Optional github URL to your source repository.
      git: "https://github.com/something/something.git",
    });

    /* This defines your actual package */
    Package.onUse(function (api) {
      // If no version is specified for an 'api.use' dependency, use the
      // one defined in Meteor 0.9.0.
      api.versionsFrom('0.9.0');
      // Use Underscore package, but only on the server.
      // Version not specified, so it will be as of Meteor 0.9.0.
      api.use('underscore', 'server');
      // Use iron:router package, version 1.0.0 or newer.
      api.use('iron:router@1.0.0');
      // Give users of this package access to the Templating package.
      api.imply('templating')
      // Export the object 'Email' to packages or apps that use this package.
      api.export('Email', 'server');
      // Specify the source code for the package.
      api.addFiles('email.js', 'server');
    });

    /* This defines the tests for the package */
    Package.onTest(function (api) {
      // Sets up a dependency on this package
      api.use('username:package-name');
      // Allows you to use the 'tinytest' framework
      api.use('tinytest@1.0.0');
      // Specify the source code for the package tests
      api.addFiles('email_tests.js', 'server');
    });

    /* This lets you use npm packages in your package*/
    Npm.depends({
      simplesmtp: "0.3.10",
      "stream-buffers": "0.2.5"});

Build plugins are created with
[`Package.registerBuildPlugin`](#Package-registerBuildPlugin). See the
coffeescript package for an example. Build plugins are fully-fledged Meteor
programs in their own right and have their own namespace, package dependencies,
source files and npm requirements.

<h3 id="packagedescription"><span>Package Description</span></h3>

Provide basic package information with `Package.describe(options)`. To publish a
package, you must define `summary` and `version`.

{{/markdown}}

{{> autoApiBox "Package.describe"}}


<h3 id="packagedefinition"><span>Package Definition</span></h3>

{{#markdown}}
Define dependencies and expose package methods with the
`Package.onUse` handler. This section lets you define what packages your package
depends on, what packages are implied by your package, and what object your
package is exported to.
{{/markdown}}

{{> autoApiBox "Package.onUse"}}

{{> autoApiBox "PackageAPI#versionsFrom" }}
{{> autoApiBox "PackageAPI#use" }}
{{> autoApiBox "PackageAPI#imply" }}
{{> autoApiBox "PackageAPI#export" }}
{{> autoApiBox "PackageAPI#addFiles" }}

<h3 id="packagetests"><span>Unit Tests</span></h3>

{{#markdown}}
Set up your tests with the `Package.onTest` handler, which has an interface
that's parallel to that of the `onUse` handler. The tests will need to depend on
the package that you have just created. For example, if your package is the
`email` package, you have to call `api.use('email')` in order to test the
package.

If you used `meteor create` to set up your package, Meteor will create the
required scaffolding in `package.js`, and you'll only need to add unit test code
in the `_test.js` file that was created.
{{/markdown}}

{{> autoApiBox "Package.onTest"}}


<h3><span>External Packages and Plugins</span></h3>

{{#markdown}}
Meteor packages can include NPM packages and Cordova plugins by using
`Npm.depends` and `Cordova.depends` in the `package.js` file.
{{/markdown}}

{{> autoApiBox "Npm.depends"}}
{{> autoApiBox "Npm.require"}}
{{> autoApiBox "Cordova.depends"}}
{{> autoApiBox "Package.registerBuildPlugin"}}
{{> autoApiBox "Plugin.registerSourceHandler"}}

{{/template}}
