
# Using Core Types

Using core types with zodern:types

For MeteorJS in its version 2.8.1 we have introduced to our core packages an integration with the [zodern:types](https://github.com/zodern/meteor-types) package. 
This package allows you to use the TypeScript types for the Meteor core packages in your TypeScript code or JavaScript code. 
in order to use the types you need to install the package by running the command:

```bash
meteor add zodern:types
```

And add the following line to your `tsconfig.json` file (if you do not have one, create one and add the code bellow):

```json
{
  "compilerOptions": {
    "preserveSymlinks": true,
    "paths": {
      "meteor/*": [
        "node_modules/@types/meteor/*",
        ".meteor/local/types/packages.d.ts"
      ]
    }
  }
}
```

then run the command:

```bash
meteor lint
```

this will create a file within your .meteor folder that will have your types for the core packages.
You can continue to use your code as you did before, but now you can use the types for the core packages even if you are in JavaScript.

for more information about the package please visit the [zodern:types](https://github.com/zodern/meteor-types).
