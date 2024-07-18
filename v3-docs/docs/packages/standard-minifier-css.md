# Standard Minifier CSS

This package is the default css minifier in Meteor apps. In addition to minifying the css code in production builds, it also runs any PostCSS plugins configured for the app.

## Post CSS

This package can optionally run [PostCSS](https://postcss.org/) plugins on the css files in your app. To enable:

1. Install npm peer dependencies:

```sh
meteor npm install -D postcss postcss-load-config
```

2. Add PostCSS Config. Create a `postcss.config.js` file and add a config:

```js
module.exports = {
  plugins: {
    autoprefixer: {},
  }
};
```

> The example config enables the `autoprefixer` postcss plugin. You can install the plugin by running `meteor npm install -D autoprefixer`.

Learn more about [configuring postcss](https://github.com/postcss/postcss-load-config#packagejson) or find a list of [available plugins](https://www.postcss.parts/).

After making changes to the PostCSS Config, `meteor` must be restarted for it to use the new config.

### Exclude Meteor Packages

In addition to the css files in your app, PostCSS will also process the css files added from Meteor packages. In case you do not want these files to be processed, or they are not compatible with your PostCSS config, you can have PostCSS ignore them by using the `excludedMeteorPackages` option:

```js
module.exports = {
  plugins: {
    autoprefixer: {},
  },
  excludedMeteorPackages: [
    'github-config-ui',
    'constellation:console'
  ]
};
```

### Tailwind CSS

Tailwind CSS is fully supported. Since HMR applies updates to js files earlier than the css is updated, there can be a delay when using a Tailwind CSS class the first time before the styles are applied.


### Debbuging

_Since Meteor.js 2.11.0 in this [PR](https://github.com/meteor/meteor/pull/12478) we have a debbug mode for the minifier_

#### How standard-minifier-css becomes verbose

- Either of the common debugging commandline arguments
  - `--verbose`
  - `--debug`
- Environment variable
  - `DEBUG_CSS`

Side notes:
`DEBUG_CSS=false` or `DEBUG_CSS=0` will prevent it from being verbose regardless of `--verbose` or `--debug` commandline arguments, because `DEBUG_CSS` is specific.
