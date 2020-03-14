# standard-minifier-js
[Source code of released version](https://github.com/meteor/meteor/tree/master/packages/standard-minifier-js) | [Source code of development version](https://github.com/meteor/meteor/tree/devel/packages/standard-minifier-js)
***

Standard Minifier for JS
========================

This package provides a minifier plugin used for Meteor apps by default. The behavior
of this plugin during a development build is that all JS files will not be minified, 
they will include a source map, and are sent to the client as seperate files. The behavior 
during a production build is that all JS files are concatenated into a single, minified JS 
file and this file will not include a source map.

The JS minifier package uses `Terser` version `4.6.6` as of `Meteor` version `1.10.1`. The options 
we setting that differ from the default settings are the following:

```
drop_debugger: false
unused:        false 
safari10:       true
```

The rest of the minification options are the default values that `Terser` uses out of the box.
Additionally, we are only making a single pass over the source in order to compress the 
output and this could be something we want to increase in the future. JS files are only
minified during a production build and the extra time spent on a second or third pass
may be worth the improved compression.