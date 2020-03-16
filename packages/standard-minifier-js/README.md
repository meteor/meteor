# standard-minifier-js
[Source code of released version](https://github.com/meteor/meteor/tree/master/packages/standard-minifier-js) | [Source code of development version](https://github.com/meteor/meteor/tree/devel/packages/standard-minifier-js)
***

Standard Minifier for JS
========================

This package provides a minifier plugin used for Meteor apps by default. 

The behavior of this plugin in development and production modes are depicted below
in the table.


|               | DEV   | PROD   |
|---------------|:-----:|:------:|
| Minified      |   N   |    Y   | 
| Concatenated  |   N   |    Y   | 
| Source Map    |   Y   |    N   | 



The options that are set that differ from the default settings are the following:

```
drop_debugger: false
unused:        false 
safari10:       true
```

It should also be noted that by default terser will make one pass while compressing 
source code, but additional passes could be configured to increase compression.