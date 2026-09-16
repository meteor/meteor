# standard-minifier-js
[Source code of released version](https://github.com/meteor/meteor/tree/master/packages/standard-minifier-js) | [Source code of development version](https://github.com/meteor/meteor/tree/devel/packages/standard-minifier-js)
***

Standard Minifier for JS
===

# Credits and Acknowledgments

This package uses SWC (Speedy Web Compiler) for JavaScript minification, which provides significant performance improvements over traditional minifiers. The SWC implementation was initially based on the work from [zodern/minify-js-sourcemaps](https://github.com/zodern/minify-js-sourcemaps).

We also use Terser as a fallback minifier for cases where SWC's stricter module parsing might not be compatible with some Meteor packages.

Special thanks to the contributors of both projects for making efficient JavaScript minification possible in Meteor applications.

This package provides a minifier plugin used for Meteor apps by default. 

The behavior of this plugin in development and production modes are depicted below
in the table.


|               | DEV   | PROD   |
|---------------|:-----:|:------:|
| Minified      |   N   |    Y   | 
| Concatenated  |   N   |    Y   | 
| Source Maps   |   Y   |    Soon   | 



The options that are set that differ from the default settings used by terser are the following:

```
drop_debugger: false
unused:        false 
safari10:       true
```
