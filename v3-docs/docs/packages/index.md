# Meteor Package System

Meteor supports two package ecosystems: **Atmosphere packages** built specifically for Meteor, and standard **npm packages**. You can use both in the same app.

## Atmosphere vs. npm

With full npm support since Meteor 1.3, you may wonder when to use Atmosphere packages vs npm packages.

**When to use Atmosphere packages:**

Atmosphere packages are written specifically for Meteor and have several advantages over npm when used with Meteor. In particular, Atmosphere packages can:

- Depend on core Meteor packages, such as `ddp`, `mongo`, or `accounts`
- Explicitly include non-JavaScript files including CSS, Less, Sass, Stylus, and static assets
- Take advantage of Meteor's [build system](/about/build-tool) to be automatically transpiled from languages like CoffeeScript
- Have a well-defined way to ship different code for client and server, enabling different behavior in each context
- Get direct access to Meteor's package namespacing and package global exports without having to explicitly use ES2015 `import`
- Enforce exact version dependencies between packages using Meteor's constraint resolver
- Include [build plugins](/api/package#build-plugin-api) for Meteor's build system
- Include pre-built binary code for different server architectures, such as Linux or Windows

If your package depends on another Atmosphere package, or needs to take advantage of Meteor's [build system](/about/build-tool), writing an Atmosphere package might be the best option.

For more details, see [Using Atmosphere Packages](/packages/6.using-atmosphere-packages) and [Writing Atmosphere Packages](/packages/7.writing-atmosphere-packages).

**When to use npm packages:**

npm is a repository of general JavaScript packages. Today, npm is used for all types of JavaScript packages across client and server environments.

If you want to distribute and reuse code that you've written for a Meteor application, consider publishing that code on npm if it's general enough to be consumed by a wider JavaScript audience. It's possible to use npm packages in Meteor applications, and possible to use npm packages within Atmosphere packages, so even if your main audience is Meteor developers, npm might be the best choice.

Meteor comes with npm bundled so that you can type `meteor npm` without worrying about installing it yourself. You can use `meteor npm` in the same way you would use a globally installed npm.

For more details, see [Using npm Packages](/packages/4.using-npm-packages) and [Writing npm Packages](/packages/5.writing-npm-packages).

## Atmosphere package repositories

Two public repositories of Meteor packages exist:
- [Atmosphere](https://atmospherejs.com/): The original repository for Meteor packages, which hosts a wide variety of community-contributed packages.
- [Packosphere](https://packosphere.com/): A newer repository and community-maintained alternative to Atmosphere. Packosphere has more information about package quality and maintenance status.

# Table of Contents

[[toc]]

<!-- @include: ./2.using-atmosphere-packages.md-->
<!-- @include: ./3.writing-atmosphere-packages.md-->
