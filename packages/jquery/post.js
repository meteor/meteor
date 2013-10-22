// Put jQuery and $ in our exported package-scope variables and remove window.$.
// (Sadly, we don't call noConflict(true), which would also remove
// window.jQuery, because bootstrap very specifically relies on window.jQuery.)
$ = jQuery = window.jQuery.noConflict();
