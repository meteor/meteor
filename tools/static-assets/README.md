# Isobuild Static Assets

Files here are designed to be copied to the output destination of a Meteor CLI
command.

Sometimes, for code sharing, the JS files can be imported by parts of the tool
(like `mini-files.js` - it is shared between built apps and tool).

## skel - App Skeleton

`skel` is a folder that is the skeleton of a new fresh app. It is copied to the
destination on `meteor create` command. The important part of the skeleton is
the packages it includes by default.

## skel-bare - Empty App Skeleton

Similar to `skel`, `skel-bare` is copied on `meteor create --bare` command.

## skel-full - Scaffold App Skeleton

Similar to `skel`, `skel-full` is copied on `meteor create --full` command.

## skel-pack - Package Skeleton

Similar to `skel`, `skel-pack` is copied on `meteor create --package` command.

## skel-react - Package Skeleton

Similar to `skel`, `skel-react` is copied on `meteor create --react` command.

## server - Bundled App's Bootstrap

The `server` folder is copied by Isobuild when the app is bundled (on
`meteor run` or `meteor build`). The `boot.js` file is the default entry point
of any built Meteor app, it loads the server program and runs the files from the
manifest. It also sets up the source-maps and a backdoor for `meteor shell`.
