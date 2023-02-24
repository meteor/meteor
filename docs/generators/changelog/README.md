## Changelog Generator

This is a generator for the changelog, you must create a file with the name of
the version that you are generating the changelog for. The script will take care of the rest.

In this file you should follow the EXAMPLE.md file that is within this directory.

The script will generate a file called `history.gen.md` that will be used by the
`changelog.md` file to generate the changelog page.

To get which branches were merged into release you can search in the GitHub
repo by using this query:

```
    is:pr base:<release-branch-name> is:merged 
```

or in GH Cli:
```bash
  gh pr list --state merged --base <release-branch-name>
```

note that it may not be as useful as the first one, since it will not show the
Authors and other related information.
## Why?

Computers with lower memory/ IDEs with high memory usage can have problems with
the changelog file(~10k lines). This is a way to reduce the memory usage of the changelog, also creating a more
organized changelog, since all the files will be reflecting at least one version.
