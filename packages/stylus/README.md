# stylus

[Stylus](http://learnboost.github.com/stylus/) is a CSS pre-processor with a simple syntax and expressive
dynamic behavior. It allows for more compact stylesheets and
helps reduce code duplication in CSS files.

With the `stylus` package installed, `.styl` files in your application are
automatically compiled to CSS and the results are included in the client
CSS bundle.

The `stylus` package also includes `nib` support. Add `@import 'nib'` to
your `.styl` files to enable cross-browser mixins such as
`linear-gradient` and `border-radius`.

If you want to `@import` a file, give it the extension `.import.styl`
to prevent Meteor from processing it independently.

See <http://tj.github.io/nib/> for documentation of the nib extensions of Stylus.
