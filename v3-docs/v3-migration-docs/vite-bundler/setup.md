# Vite Bundler with Meteor 3

To use Vite as the bundler for your Meteor 3 project, install the `meteor-vite` npm package and Vite as a dev dependency:

```bash
meteor npm i meteor-vite
meteor npm i -D vite@6
```

Then add the `jorgenvatle:vite` package:

```bash
meteor add jorgenvatle:vite
```

::: info
The older `jorgenvatle:vite-bundler` package, used together with `vite@4` and `meteor-vite@2`, is the setup for Meteor 2 only. For Meteor 3, use `jorgenvatle:vite` as shown above.
:::

For the remaining steps you can follow the package guide located [here](https://github.com/JorgenVatle/meteor-vite). There you can also find starter templates for different front-end frameworks.
