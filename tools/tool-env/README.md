Uninteresting files that run on tool's startup (set up profilers, transpilers,
etc) and exit (clean up code, flush the output).


## ES2015 compilation for tool

There are two different configurations of Babel for the tools code:

- local development from git checkout
- running in production from a release

In the first case, it is enough to register Babel's hook for `require`. For the
latter, this hook should be removed (`#RemoveInProd`) and the files should be
explicitly compiled.

The listing of Babel-compiled files can be found in `isopack.js`, the
`Isopack#_writeTool` method runs all the preprocessing when tools files are
copied for a release package.
