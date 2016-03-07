# modules

To run the tests, first install the npm dependencies, then run the app:

```sh
npm install
npm test # just does `meteor run`
```

then visit [localhost:3000](//localhost:3000) in your browser.

### jiku

Maybe related issues with PIXI through Webpack

[1](https://github.com/pixijs/pixi.js/issues/1854)
[2](https://github.com/pixijs/pixi.js/issues/2078)

Where they set

```javascript
node: {
    fs: "empty"
}
```
