# Types for Meteor 3

Meteor 3.6 can generate TypeScript type declarations for all installed packages with the explicit `meteor types` command. The declarations are written to `.meteor/types/` (the generator adds a `.gitignore` there, so they stay out of version control). Ordinary build commands do not change either provider tree, and a directly installed `zodern:types` keeps ownership until the project removes it.

To get types for Meteor core packages working in your IDE, you need to have a valid `tsconfig.json` file in your project root, including the following:

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

Then run `meteor types`. If the project already defines `files` or `include`,
append the generated barrel and retain the existing source patterns.

You can learn more in the [Using core types](https://docs.meteor.com/cli/using-core-types) guide.

::: tip Older Meteor 3 releases
On Meteor 3 versions that do not yet include the native type generator, add the community [`zodern:types`](https://github.com/zodern/meteor-types) package instead:

```bash
meteor add zodern:types
```

and point `paths` at `.meteor/local/types/packages.d.ts` (the folder `zodern:types` generates), with `"preserveSymlinks": true` in your `compilerOptions`.
:::
