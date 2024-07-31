# babel-preset-meteor

> Babel preset for all Meteor plugins.

## Install

```sh
$ npm install --save-dev babel-preset-meteor
```

## Updating dependency versions

```sh
$ cd path/to/babel-preset-meteor
$ npm run update-versions
```

## Usage

### Via `.babelrc` (Recommended)

**.babelrc**

```json
{
  "presets": ["meteor"]
}
```

### Via CLI

```sh
$ babel script.js --presets meteor 
```

### Via Node API

```javascript
require("babel-core").transform("code", {
  presets: ["meteor"]
});
```
