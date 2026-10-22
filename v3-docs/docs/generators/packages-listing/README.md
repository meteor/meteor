# Listing of all meteor core packages

This is a script that will generate a list of all meteor core packages, being ran every build.
This ensures that we always have a list of core packages up to date with their correct links to GitHub.


We can always add packages to the list by adding them to the `script.js` constant `OUTSIDE_OF_CORE_PACKAGES`.

Should follow the following format:

```js
{
  name: 'package-name',
  link: 'https://link-to-github.com/meteor/meteor/tree/devel/packages/package-name'
}
```

At the end, this script will update the file located in `docs/source/packages/packages-listing.md` with the new list of packages.
