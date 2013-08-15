  <h2 id="usingpackages">Using packages</h2>

All of the functionality you've read about so far is implemented as
standard Meteor packages. This is possible thanks to Meteor's
unusually powerful package and build system. The same packages work in
the browser and on the server, and packages can contain plugins that
extend the build process, such as `coffeescript` ([CoffeeScript](http://coffeescript.org)
compilation) or `templating` (compiling HTML templates).

You can see a list of available packages
with [`meteor list`](#meteorlist), add packages to your project
with [`meteor add`](#meteoradd), and remove them
with [`meteor remove`](#meteorremove).

By default all apps include the `standard-app-packages` package. This
automatically pulls in the packages that make up the core Meteor
stack. To keep things simple, these core packages are also hidden in
the output for `meteor list`, but you can read the
[source code of `standard-app-packages`](https://github.com/meteor/meteor/blob/master/packages/standard-app-packages/package.js)
to see what they are (as Meteor is pre-1.0, they may change from release to
release). If you want to build your own custom stack, just remove
`standard-app-packages` from your app and add back in whichever of the standard
packages you want to keep.

In addition to the packages in the official Meteor release being used
by your app, `meteor list` and `meteor add` also search the `packages`
directory at the top of your app. If you've downloaded an unofficial
package from Atmosphere you should unpack it into that directory (the
unofficial [Meteorite](http://oortcloud.github.io/meteorite/) tool
streamlines this process). You can also use the `packages` directory
to break your app into subpackages for your convenience &mdash; if you
are willing to brave the fact that the Meteor package format is not
documented yet and will change significantly before Meteor 1.0. See
[Writing Packages](#writingpackages).



XXX XXX old text:

Meteor supports a variety of add-on packages and third party
libraries. While you can build great applications using only the Meteor
core functionality, optional packages can make development even faster
and better.

Packages can be added and removed from a Meteor project with:

    $ meteor add <package_name>

and removed with:

    $ meteor remove <package_name>
