---
title: Using Core Types
description: Using TypeScript types for Meteor core packages
---

Recent Meteor 3 releases can generate TypeScript type declarations for the core packages (and any other installed package that ships types) whenever you run `meteor run`, `meteor build`, or `meteor types`.
Meteor 3.6 projects that list `zodern:types` directly keep that provider until it is removed. To opt in to the native declarations, use the following `tsconfig.json` paths:

```json
{
  "compilerOptions": {
    "skipLibCheck": true,
    "paths": {
      "meteor/*": [
        "./.meteor/types/packages/*",
        "./node_modules/@types/meteor/*",
        "./.meteor/types/packages.d.ts"
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

The per-package native adapters take precedence over `@types/meteor`; the
barrel listed last supplies native sub-path and scoped-package declarations.
The declarations may expose application type errors that older ambient types accepted.
Keep `skipLibCheck` enabled during migration, run `meteor types` followed by
your local TypeScript compiler with `--noEmit`, and fix application code rather
than editing files under `.meteor/types`, which are regenerated automatically.

For MeteorJS from version 2.8.1 up to the Meteor 3 releases that do not include the native type generator, use the community [zodern:types](https://github.com/zodern/meteor-types) package instead (`meteor add zodern:types`), which generates the types at `.meteor/local/types` and requires `"preserveSymlinks": true` in your `tsconfig.json`. Meteor 3.6 also continues to honor a direct `zodern:types` installation without loading native declarations simultaneously.

for more information please visit the [current documentation](https://docs.meteor.com/cli/using-core-types).
