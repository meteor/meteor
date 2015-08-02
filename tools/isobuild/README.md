# Isobuild

Isobuild is the build system used by the Meteor Tool. See the
[high level description](https://www.meteor.com/isobuild) for more.

## Terms

The terms Isobuild operates on often have two names: internal names and public
concepts.

- `packageSource` - an abstract representation of a package/app source with metadata
- `isopack` - a compiled version of a package/app
- `unibuild` - a part of an isopack for a specific target (browser, server, tool, etc)
- `isopackCache` - an abstract representation of cached isopacks on disk
- `build plugin` - a part of an isopack that plugs into the build process
- `linked file` - a wrapped file by linker

### Compiler

Takes care of compiling an individual package and returning an Isopack.

XXX needs a new name not to be confused with Compiler Plugins

### Bundler

Builds an individual app or a build plugin (that appears to be just an app that
is run in the context of the build).

Bundler introduces additional terms:

- `JsImage` - is a representation of a built App or a build plugin.
- `ClientTarget` and `ServerTarget` are representations of two separate types of
  "programs" in a built App.

### Builder

Manages the files written to the filesystem.

### Linker

A Meteor-specific transform. Wraps every file into a closure, creates "package
local variables" and sets up the "global imports" to look like
`var Minimongo = Package.minimongo.Minimongo;`.
