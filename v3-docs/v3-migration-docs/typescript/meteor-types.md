# Types for Meteor 3

In order to get types working in your Meteor 3 project, you will need to add the following package:

```bash
meteor add zodern:types
```

Also, to get types for Meteor core packages working in your IDE, you need to have a valid `tsconfig.json` file in your project root, including the following:

```json
{
  "compilerOptions": {
    "preserveSymlinks": true,
    "paths": {
      "meteor/*": [
        ".meteor/local/types/packages.d.ts"
      ]
    }
  }
}
```

You can learn more about the `zodern:types` package [here](https://github.com/zodern/meteor-types).