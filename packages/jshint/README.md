# jshint
[Source code of released version](https://github.com/meteor/meteor/tree/master/packages/jshint) | [Source code of development version](https://github.com/meteor/meteor/tree/devel/packages/jshint)
***

JSHint for Meteor
===

This package adds a Linter Plugin that automatically runs all your JavaScript
source files through the [JSHint linter](http://jshint.com/about/), correctly
passing into [JSHint](http://jshint.com/) the global variables in scope for the
environment that file executes inside of.

To configure the plugin, put a `.jshintrc` file into your app's (or package's)
root folder, containing valid JSON with the [JSHint
options](http://jshint.com/docs/options/).


If no `.jshintrc` file is found in your app's (or package's) root folder the default 
configuration will be used. The default configuration is described below.


|  Setting  |   Value    |                                                                                                         | 
|:---------:|:----------:|---------------------------------------------------------------------------------------------------------|
|  undef    |    true    | This option prohibits the use of explicitly undeclared variables                                        |
|  unused   |    true    | This option warns when you define and never use your variables                                          |
|  node     |    true    | This option defines globals available when your code is running inside of the Node runtime environment  |
|  browser  |    true    | This option defines globals exposed by modern browsers                                                  |

