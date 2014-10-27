{{#template name="basicPackages"}}

# Packages

Meteor is all about splitting functionality into modular packages. In addition
to the core packages documented above, there are many others that you can add to
your app to enable useful functionality.

Add or remove packages with `meteor add` and `meteor remove`:

```bash
# add the less package
meteor add less

# remove the less package
meteor remove less
```

Your app will restart itself automatically when you add or remove a package.
Every app's package dependencies are tracked in `.meteor/packages`, so all of
your collaborators will also get the package when they pull your source code.

See which packages are used by your app with `meteor list`.

## Searching for packages

Currently the best way to search for packages available on the official Meteor
package server is [Atmosphere](https://atmospherejs.com/), the community package
search website maintained by Percolate Studio. You can also search for packages
directly using the `meteor search` command.

Packages that have a `:` in the name, such as `mquandalle:jade`, are written and
maintained by community members. The prefix before the colon is the name of the
user or organization who created that package. Unprefixed packages are
maintained by Meteor Development Group alongside the Meteor framework.

There are currently over 2000 packages available on Atmosphere. Below is a small
selection of some of the most useful packages.

## accounts-ui

This is a drop-in user interface to Meteor's accounts system. After adding the
package, include it in your templates with `{{dstache}}> loginButtons}}`. The UI
automatically adapts to include controls for any added login services, such as
`accounts-password`, `accounts-facebook`, etc.

[See the docs about accounts-ui above.](#/basic/accounts).

## coffeescript

Use [CoffeeScript](http://coffeescript.org/) in your app. With this package, any
files with a `.coffee` extension will be compiled to JavaScript by Meteor's
build system.

## email

Send emails from your app. See the [email section of the full API
docs](#/full/email).

## mquandalle:jade

Use the [Jade](http://jade-lang.com/) templating language in your app. After
adding this package, any files with a `.jade` extension will be compiled into
Meteor templates. See the [page on
Atmosphere](https://atmospherejs.com/mquandalle/jade) for details.

## jquery

JQuery makes HTML traversal and manipulation, event handling, and animation
easy with a simple API that works across most browsers.

JQuery is automatically included in every Meteor app since the framework uses it
extensively. See the [JQuery docs](http://jquery.com/) for more details.

## http

This package allows you to make HTTP requests from the client or server using
the same API. See the [http docs](#/full/http) to see how to use it.

## less

Use the [LESS](http://lesscss.org/) CSS pre-processor in your app. With this
package, `.less` files are automatically compiled into CSS. If you want to use
`@import` to include other files and not have Meteor automatically compile them,
use the `.import.less` extension.

## markdown

Include [Markdown](http://daringfireball.net/projects/markdown/syntax) code in your templates. It's as easy as using the `{{dstache}}# markdown}}` helper:

```html
<div class="my-div">
{{dstache}}#markdown}}
# My heading

Some paragraph text
{{dstache}}/markdown}}
</div>
```

Just make sure to keep your markdown unindented, since whitespace matters.

## underscore

[Underscore](http://underscorejs.org/) provides a collection of useful functions
[to manipulate arrays, objects, and functions. `underscore` is included in every
[Meteor app because the framework itself uses it extensively.

## spiderable

This package gives your app server-side rendering to allow search engine
crawlers and other bots see your app's contents. If you care about SEO, you
should add this package.

{{/template}}