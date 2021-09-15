## Meteor API Documentation - http://docs.meteor.com

This is a [hexo](https://hexo.io) static site used to generate the [Meteor API Docs](http://docs.meteor.com).

## Contributing

We'd love your contributions! Please send us Pull Requests or open issues on [github](https://github.com/meteor/docs). Also, read the [contribution guidelines](https://github.com/meteor/docs/blob/master/Contributing.md).

If you are making a larger contribution, you may need to run the site locally:

### Running locally

#### Submodules

This repo has two submodules, one the theme, the other full Meteor repository.

We have the Meteor repo to generate the `data.js` file (see below).

After cloning, or updating the repo, it makes sense to run

```
git submodule update --init
```

Generally you should not commit changes to the submodules, unless you know what you are doing.

#### Generating `data.js`

To generate the api boxes, the site uses a file `data/data.js` which is generated from the js docs in the [Meteor source code](https://github.com/meteor/meteor). This will automatically happen whenever you start your local hexo server.

#### Starting hexo

Ensure you've run `npm install`. Then simply `npm start`.

### Developing with local meteor source

When developing jsdoc documentation within the meteor code you will
need to make some local modifications to get the documentation to work locally for testing.

1. Modify `url` in `_config.yml` so links within `localhost:4000` will not jump out to `https://docs.meteor.com`
```diff
- url: http://docs.meteor.com/
+ url: http://localhost:4000/
```
2. reconnect the meteor submodule in `/code` to your local meteor folder.
```bash
# REMOVE submodule
# Remove the submodule entry from .git/config
git submodule deinit -f code

# Remove the submodule directory from the superproject's
# .git/modules directory
rm -rf .git/modules/code

# Remove the entry in .gitmodules and remove the submodule directory
# located at path/to/submodule
git rm -f code

# ADD your local meteor submodule
git submodule add /path/to/local/meteor code
```

3. Hexo builds if you are just changing md files in sources then
hexo will watch for changes and update.  If you are making changes
in the `/code` folder then you will need to `npm clean && npm start`.

Of course, do not commit any of these changes.
