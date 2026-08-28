# Types for Meteor 3

Recent Meteor 3 releases can generate TypeScript type declarations for all installed packages on every `meteor run` or `meteor build`. The declarations are written to `.meteor/types/` (the generator adds a `.gitignore` there, so they stay out of version control). Meteor 3.6 preserves a directly installed `zodern:types` provider until the project removes it.

To get types for Meteor core packages working in your IDE, you need to have a valid `tsconfig.json` file in your project root, including the following:

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

You can learn more in the [Using core types](https://docs.meteor.com/cli/using-core-types) guide.

::: tip Older Meteor 3 releases
On Meteor 3 versions that do not yet include the native type generator, add the community [`zodern:types`](https://github.com/zodern/meteor-types) package instead:

```bash
meteor add zodern:types
```

and point `paths` at `.meteor/local/types/packages.d.ts` (the folder `zodern:types` generates), with `"preserveSymlinks": true` in your `compilerOptions`.
:::
