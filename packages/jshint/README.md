# jshint
[Source code of released version](https://github.com/meteor/meteor/tree/master/packages/jshint) | [Source code of development version](https://github.com/meteor/meteor/tree/devel/packages/jshint)
***

JSHint for Meteor
===

This packages adds a Linter Plugin that automatically runs all your JavaScript
source files through the [JSHint linter](http://jshint.com/about/), correctly
passing the global imports from the used packages.

To configure the plugin, put a `.jshintrc` file into your app's (or package's)
root, containing a valid JSON with the [JSHint
options](http://jshint.com/docs/options/).



Default confiiguration used when no `.jshintrc` file is found for the application or for each package
being linted by JSHint


|  Setting  |   Value    |                                                                                            | 
|:---------:|:----------:|---------------------------------------------------------------------------------------------------------|
|  undef    |    true    | This option prohibits the use of explicitly undeclared variables                                        |
|  unused   |    true    | This option warns when you define and never use your variables                                          |
|  node     |    true    | This option defines globals available when your code is running inside of the Node runtime environment  |
|  browser  |    true    | This option defines globals exposed by modern browsers                                                  |

