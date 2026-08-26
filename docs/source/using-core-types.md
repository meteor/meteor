---
title: Using Core Types
description: Using TypeScript types for Meteor core packages
---

Recent Meteor 3 releases generate TypeScript type declarations for the core packages (and any other installed package that ships types) automatically whenever you run `meteor run`, `meteor build`, or `meteor types`.
No extra package is needed. To use the types in your TypeScript code or JavaScript code, add the following to your `tsconfig.json` file (if you do not have one, create one and add the code bellow):

```json
{
  "compilerOptions": {
    "skipLibCheck": true,
    "paths": {
      "meteor/*": [
        "./.meteor/types/packages.d.ts",
        "./node_modules/@types/meteor/*"
      ]
    }
  }
}
```

then run the command:

```bash
meteor types
```

this will create the `.meteor/types` folder with the types for the core packages (the generator writes a `.gitignore` inside it, so the folder stays out of version control).
You can continue to use your code as you did before, but now you can use the types for the core packages even if you are in JavaScript.

For MeteorJS from version 2.8.1 up to the Meteor 3 releases that do not include the native type generator, use the community [zodern:types](https://github.com/zodern/meteor-types) package instead (`meteor add zodern:types`), which generates the types at `.meteor/local/types` and requires `"preserveSymlinks": true` in your `tsconfig.json`.

for more information please visit the [current documentation](https://docs.meteor.com/cli/using-core-types).
