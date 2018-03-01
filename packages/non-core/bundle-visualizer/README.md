# bundle-visualizer

The `bundle-visualizer` package is an analysis tool which provides a visual
representation within the web browser showing what is included in the initial
client bundle.  The initial client bundle is the primary package of code
downloaded and executed by the browser to run a Meteor application and includes
packages which have been added via `meteor add <package>` or Node modules
included in the `node_modules` directory and used in an application.

This visualization can uncover details about which files or packages are
occupying space within the initial client bundle.  This can be useful in
determining which imports might be candidates for being converted to dynamic
`import()` statements (which are excluded from the initial client bundle), or
for identifying packages which have been inadvertently included in a project.

## How it works

This package utilizes the `<hash>.stats.json` files which are written alongside
file bundles when the application is ran with the `--production` flag.  The
specific details for the minified file sizes is added by the minifier package
and therefore it's important to review the minifier requirements below.

## Requirements

This package requires data provided by the project's minifier.  For this reason,
it is necessary to use the official `standard-minifier-js` package or a minifier
which includes file-size details obtained during minification.

## Usage

Since bundle analysis is only truly accurate on a minified bundle and
minification does not take place during development (as it is a complex and
CPU-intensive process which would substantially slow down normal development)
this package must be used in conjunction with the `--production` flag to the
`meteor` tool to simulate production bundling and enable minification.

> **IMPORTANT:** Since this package is active in production mode, it is critical
> to only add this package temporarily.  This can be easily accomplished using
> the `--extra-packages` option to `meteor`.

### Enabling
```sh
$ cd app/
$ meteor --extra-packages bundle-visualizer --production
```

### Viewing

Once enabled, view the application in a web-browser as usual
(e.g. `http://localhost:3000/`) and the chart will be displayed on top of the
application.

### Disabling

If you used `--extra-packages`, simply remove `bundle-visualizer` from the list
of included packages and run `meteor` as normal.

> If you've added `bundle-visualizer` permanently with `meteor add`, it is
> important to remove this package prior to bundling or deploying to
> production with `meteor remove bundle-visualizer`.
