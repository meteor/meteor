# Static Site Shell (WIP)

This is a setup to generate a static site from the markdown files location in `/content` using [Hexo](https://hexo.io/).

Note in order for Hexo to pick up the title of a page, each markdown file should provide a `title` field using [YAML front matter](http://jekyllrb.com/docs/frontmatter/).

### Development

``` bash
npm install -g hexo-cli

# in /site
npm install
# serve at localhost:4000
hexo server
```

The static site shell is in `themes/meteor`.

### Continuous Deployment

For a non-master branch to be automatically deployed to S3 on push, its name must either start with `version-`, or be matched by [the branch regex in the deployment section of `circle.yml`](https://github.com/meteor/guide/blob/master/circle.yml#L18).

The `master` branch is deployed to the root of the S3 bucket.

A branch with the name `version-1.2` will be deployed under the `v1.2` folder.

Any other branch, if added to the regex, will be deployed with the `branch-` prefix. For example, branch `test` will be deployed under the `branch-test` folder.

### Manual Deployment

1. Create `keys.json` (search for "Meteor guide AWS S3 keys" in LastPass):

  ``` json
  {
    "key": "xxx",
    "secret": "xxx"
  }
  ```

2. `node deploy`.
