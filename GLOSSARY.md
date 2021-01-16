# Glossary
A list of terms and what they mean in Meteor context. This document is intended for contributors. 

If you are reading Meteor code or Meteor docs anywhere and you find that a term is not clear enough or Meteor has used the term in a way that is not easy to understand please submit a PR adding a new term to this glossary. You don't need to be afraid of being wrong, we will review the PR and we can define the term in the best way possible in the review process.

## Isobuild
Meteor has a packaging system called "Isobuild". Isobuild knows how to compile the same JavaScript code-base to different architectures: browser, node.js-like server environment (could be Rhino or other) or a webview in a Cordova mobile app.

related terms: [Isopack](#Isopack), [Unibuild](#Unibuild)

## Isopack
Each package used by Isobuild forms an Isopack. Isopack is a package format containing source code for each architecture it can be ran on. Each separate part built for a separate architecture is called "Unibuild".

related terms: [Isobuild](#Isobuild), [Unibuild](#Unibuild)

## Unibuild
Isopack is a package format containing source code for each architecture it can be ran on. Each separate part built for a separate architecture is called "Unibuild".

There are multiple reasons why we can't call it just "build" and historically the name "Unibuild" has been associated with parts of Isopacks. We also can't call it "Isobuild" because this is the brand-name of the whole build/packaging system.

related terms: [Isobuild](#Isobuild), [Isopack](#Isopack)

## Core package
A core package is of course a Meteor package. They are maintained in the official Meteor repo.

Core packages don't have .versions file as they are always released from a checkout of Meteor.

Every package that lives exactly in the folder `packages/` in the Meteor repository is considered a core package. If the packages lives in sub-folders of `packages`, like `deprecated` or `non-core` they are not considered a core package.

## meteor-tool
This is the Meteor command-line tool. Most of the code for it is in the [tools directory](https://github.com/meteor/meteor/tree/devel/tools) of the Meteor repository.

The Meteor tool also includes testing functionality and example apps for the Meteor framework.

It also defines the version of Meteor, when we say that you are using Meteor 1.12.1 that means you are using meteor-tool@1.12.1. 

## Isopackets
Isopacket is a set of isopacks. Isopackets are used only inside meteor-tool.

An isopacket is a predefined set of isopackages which the meteor command-line tool can load into its process. This is how we use the DDP client and many other packages inside the tool. The isopackets are listed a constant called ISOPACKETS.

related terms: [Isopack](#Isopack), [meteor-tool](#meteor-tool)
