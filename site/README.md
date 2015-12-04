# Static Site Shell (WIP)

This is a setup to generate a static site from the markdown files location in `/content` using [Hexo](https://hexo.io/).

### Notes on Content Authoring

- In order for Hexo to pick up the title of a page, each markdown file should provide a `title` field using [YAML front matter](http://jekyllrb.com/docs/frontmatter/). We can optionally include more meta information for each article, e.g. `authors`, if needed.

- Use **relative links** when linking to other pages in the guide. This is necessary because we are deploying multiple versions/branches of the site into nested folders.

### Theme Development

``` bash
npm install -g hexo-cli

# in /site
npm install
# serve at localhost:4000
hexo server
```

The static site theme is in `themes/meteor` and is responsible for the visual representation of the site. For more information, check out the [Hexo docs](https://hexo.io/docs/index.html).

### Continuous Deployment

- The `master` branch is automatically deployed to the root of the S3 bucket on every push.

- Any branch that starts with `version-` will be automatically deployed in a sub-folder on every push. A branch with the name `version-1.2` will be deployed under the `v1.2` folder.

- To make a branch available in the site's version selection dropdown, make sure to add it to the `versions` list in `site/_config.yaml`!

- Any other branch is ignored by default. If you want to enable auto-deploy for a branch, you should edit [the branch field in the deployment section of `circle.yml`](https://github.com/meteor/guide/blob/master/circle.yml#L18) to match the name of the branch. The branch will be then be deployed with the `branch-` prefix automatically. For example, branch `test` will be deployed under the `branch-test` folder.

### Manual Deployment

In the `site` directory:

1. Create `keys.json` (search for "guide_push" in LastPass):

  ``` json
  {
    "key": "xxx",
    "secret": "xxx"
  }
  ```

2. `node deploy`.
