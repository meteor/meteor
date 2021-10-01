# coffeescript-compiler
[Source code of released version](https://github.com/meteor/meteor/tree/master/packages/coffeescript-compiler) | [Source code of development version](https://github.com/meteor/meteor/tree/devel/packages/coffeescript-compiler)
***

This package supports the [`coffeescript`](../coffeescript/README.md) package,
and any other packages that wish to compile CoffeeScript code into JavaScript.
Like the [`babel-compiler`](../babel-compiler/README.md) package, the actual
compilation is separated out from the build plugin so that packages besides
the official `coffeescript` package can compile CoffeeScript code.

### Testing This Package

Testing the `coffeescript` package also tests this one:

```bash
./meteor test-packages packages/non-core/coffeescript
```
