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
