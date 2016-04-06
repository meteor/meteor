# Using packages

1. Npm vs Atmosphere
  1. Npm packages:
    - Originally designed for server-side
    - Systems like webpack and browserify let you bundle them for the client
    - Meteor's module system seamlessly lets you `import` them from the client.
    - You can find them at npmjs.org
  1. Atmosphere packages are custom built for Meteor
    - The Meteor package system has some advantages
    - Code can be targeted at client *or* server
    - Packages can be run through the build tool (e.g. coffeescript, less packages)
    - Packages can define build plugins!
    - Packages are namespaced to the author
    - Binary stuff?
    - You can find them atmospherejs.com
2. Installing and using Atmosphere packages
  1. Install with `meteor add X:Y`
  2. Installed to `.meteor/packages` -- resolved in `.meteor/versions`
    - Actual files are at `~/.meteor/packages`
  3. `.meteor/versions` means repeatable builds (?)
  4. Atmosphere packages can include npm dependencies, managed for you.
3. Installing and using Npm packages
  1. You should install npm 2.
  2. You should create a `package.json` -- `npm init`
  3. Install with `npm install --save package-name`
  4. Then run `npm-shinkwrap`
    - So that you can maintain repeatable builds.
  6. Add `node_modules/` to `.gitignore` (don't ignore `node_shrinkpacks`).
  7. Node modules installed at the app level can be `import`-ed from at the app or package level.
    - Some packages may rely on you installing a certain version of a node module in your app.
    - https://paper.dropbox.com/doc/node_modules-guidespec-HoFTXTb77FlFR287yYZYW
4. Advanced Package use:
  1. Dealing w/ callbacks in npm packages (content from http://guide.meteor.com/build-tool.html#npm-callbacks)
  2. Overriding core/3rd party Atmosphere packages (content from http://guide.meteor.com/build-tool.html#atmosphere
  3. Overriding npm packages? (actually I don't know how to do this)
  4. Using `shrinkpack` to avoid depending on npm for deployments etc.