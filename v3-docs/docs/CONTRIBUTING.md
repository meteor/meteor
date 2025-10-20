# Contributing to Meteor JS documentation

We welcome contributions to the Meteor JS documentation! 

Since documentation is always evolving, your help is really valuable to ensure content is accurate and up-to-date.

## How to Contribute

### Identify elements that need improvement

Are you new here? Please check our [documentation issues](https://github.com/meteor/meteor/issues?q=is%3Aissue%20state%3Aopen%20label%3AProject%3ADocs).

If in doubt about the best way to implement something, please create additional conversation on the issue.

Issues are not assigned, you don’t need to wait for approval before contributing. Jump right in and open a PR — this increases your chances of getting your work merged, since issues can be claimed fast.


### Do the changes and share them 

Documentation live in the `v3-docs/docs` directory of the [Meteor GitHub repository](https://github.com/meteor/meteor/tree/devel/v3-docs/docs)

You should start your work from the `devel` branch.

You must test your contibution locally before submitting a pull request. To do so, here are the steps:
1. `cd v3-docs/docs && npm run docs:dev` will run the docs locally at [http://localhost:5173/](http://localhost:5173/)
2. Make your changes and verify them in the browser.
3. run `npm run docs:build` to ensure the build works correctly.
4. Push your work and submit a documented pull request to the `devel` branch.

If you add a new page to the documentation, please make sure the configuration creates a link to access it (see [.vitepress/config.mts](https://github.com/meteor/meteor/blob/devel/v3-docs/docs/.vitepress/config.mts)).
