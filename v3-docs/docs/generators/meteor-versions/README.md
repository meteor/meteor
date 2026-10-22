## Meteor version generator for docs

This is a generator for the meteor versions for the docs, this is used to generate the links in the docs
to the correct version of the meteor release and docs version.


## Why?

This is a way to ensure that the links in the docs are always pointing to the correct version of the docs and release.
In an automated way.


## How to use

To use this generator you must run the following command:

```bash
node script.js
```

and it will check in the `changelog` dir for every version and generate a `versions.generated.json` file that will be used by the docs to generate the links to the correct version of the docs.

