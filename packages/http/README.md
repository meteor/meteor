# http

`HTTP` provides an HTTP request API on the client and server.  To use
these functions, add the HTTP package to your project with `$ meteor add http`.

See the [HTTP section in the Meteor docs](http://docs.meteor.com/#http) for more details.

## Direct access to npm request API

On the server, the `http` package is implemented using the
[npm `request` module](https://www.npmjs.com/package/request).  If you'd like
direct access to this module, you can find it at
`HTTPInternals.NpmModules.request.module`. Its version can be read at
`HTTPInternals.NpmModules.request.version`.

Additionally, you can override any `request` option when using `HTTP.call` (or
`HTTP.get`, etc) by including a `npmRequestOptions` option.

The version of `request` used may change incompatibly from version to version of
Meteor (or we may even replace it with an entirely different implementation);
use at your own risk.
