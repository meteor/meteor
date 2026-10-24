---
title: Using Core Types
description: Using TypeScript types for Meteor core packages
---

Meteor 3.6 can generate TypeScript type declarations for the core packages (and any other installed package that ships types) with the explicit `meteor types` command. Ordinary `meteor run`, `meteor build`, and `meteor test` commands do not create, remove, or replace either provider's declarations.
Projects that list `zodern:types` directly keep that provider, and `meteor types` exits without changing its output. To opt in to only the native declarations, remove `zodern:types` and use the following `tsconfig.json` paths:

```json
{
  "files": ["./.meteor/types/packages.d.ts"],
  "include": ["**/*.ts", "**/*.tsx"],
  "compilerOptions": {
    "skipLibCheck": true,
    "paths": {
      "meteor/*": [
        "./.meteor/types/packages/*"
      ]
    }
  }
}
```

then run the command:

```bash
meteor types
```

this will create the `.meteor/types` folder with the types for the core packages (the generator writes a `.gitignore` inside it, so the folder stays out of version control). If your project already has `files` or `include`, append the generated barrel and retain your existing source patterns instead of replacing them with the example values.
You can continue to use your code as you did before, but now you can use the types for the core packages even if you are in JavaScript.

Existing templates keep `@types/meteor` and zodern before these native fallback
paths, so upgrading Meteor does not silently change the active declarations.
The native-only configuration above is an explicit migration choice.
Packages that already exposed declarations through zodern keep their Meteor
3.6 declaration files unchanged; corrected native variants are isolated from
zodern's isopack discovery.
The declarations may expose application type errors that older ambient types accepted.
Keep `skipLibCheck` enabled during migration, run `meteor types` followed by
your local TypeScript compiler with `--noEmit`, and fix application code rather
than editing files under `.meteor/types`, which are replaced by the next
`meteor types` command.

For MeteorJS from version 2.8.1 up to the Meteor 3 releases that do not include the native type generator, use the community [zodern:types](https://github.com/zodern/meteor-types) package instead (`meteor add zodern:types`), which generates the types at `.meteor/local/types` and requires `"preserveSymlinks": true` in your `tsconfig.json`. Meteor 3.6 also continues to honor a direct `zodern:types` installation without loading native declarations simultaneously.

for more information please visit the [current documentation](https://docs.meteor.com/cli/using-core-types).
