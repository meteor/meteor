## Contributing to Meteor 

Ongoing Meteor development takes place in the open [on GitHub](https://github.com/meteor/meteor). We encourage pull requests and issues to discuss problems with any changes that could be made to the content. The contribution guidelines are available in the [Meteor GitHub repository](https://github.com/meteor/meteor/blob/devel/CONTRIBUTING.md).

A great start to understand how to contribute to Meteor Core is this video from Meteor Impact 2025:

<iframe width="560" height="315" src="https://www.youtube.com/embed/-EZtClGGmP8?si=LcuhDNrgmcLaNIbH" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>

## Contributing to this documentation

We welcome contributions to the documentation!

Since documentation is always evolving, your help is really valuable to ensure content is accurate and up-to-date.

### How to Contribute

#### Identify elements that need improvement

Are you new here? Please check our [documentation issues](https://github.com/meteor/meteor/issues?q=is%3Aissue%20state%3Aopen%20label%3AProject%3ADocs).

If in doubt about the best way to implement something, please create additional conversation on the issue.

Issues are not assigned, you don’t need to wait for approval before contributing. Jump right in and open a PR — this increases your chances of getting your work merged, since issues can be claimed fast.


#### Do the changes and share them

Documentation live in the `v3-docs/docs` directory of the [Meteor GitHub repository](https://github.com/meteor/meteor/tree/devel/v3-docs/docs)

For small changes, such as fixing typos or formatting, you can simply click the "Edit this page on GitHub" button in the footer to edit the file and submit a PR.

For larger changes, you need to fork meteor repo and start your work from the `devel` branch.

You must test your contribution locally before submitting a pull request. To do so, here are the steps:
1. `cd v3-docs/docs && npm run docs:dev` will run the docs locally at [http://localhost:5173/](http://localhost:5173/)
2. Make your changes and verify them in the browser.
3. run `npm run docs:build` to ensure the build works correctly.
4. Push your work and submit a documented pull request to the `devel` branch.

If you add a new page to the documentation, please make sure the configuration creates a link to access it (see [.vitepress/config.mts](https://github.com/meteor/meteor/blob/devel/v3-docs/docs/.vitepress/config.mts)).
