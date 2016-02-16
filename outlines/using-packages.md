# Using packages

1. Packages vs modules
  - Packages are useful for sharing content between apps and users
  - It's usually better to leverage someone else's work and use a package if it does what you need
2. Npm vs Atmosphere
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
3. Installing and using Atmosphere packages
  1. Install with `meteor add X:Y`
  2. Installed to `.meteor/packages` -- resolved in `.meteor/versions`
  3. `.meteor/versions` means repeatable builds (?)
  4. Atmosphere packages can include npm dependencies, managed for you.
4. Installing and using Npm packages
  1. You should install NPM 2.
  2. You should create a `package.json` -- `npm init`
  3. Install with `npm install --save package-name`
  4. Then run `npm-shinkwrap`
    - So that you can maintain repeatable builds.
  5. Optional: Use `shrinkpack` to avoid depending on npm for deployments etc.
  6. Add `node_modules/` to `.gitignore` (don't ignore `node_shrinkpacks`).
  7. Node modules installed at the app level can be `import`-ed from at the app or package level.
    - Some packages may rely on you installing a certain version of a node module in your app.
