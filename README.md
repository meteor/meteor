![Imgur](http://i.imgur.com/XwTwNPJ.png)

[![TravisCI Status](https://travis-ci.org/meteor/meteor.svg?branch=devel)](https://travis-ci.org/meteor/meteor)
[![CircleCI Status](https://circleci.com/gh/meteor/meteor/tree/devel.svg?style=shield&circle-token=c2d3c041506bd493ef3795ffa4448684cfce97b8)](https://circleci.com/gh/meteor/meteor/tree/devel)

Meteor is an ultra-simple environment for building modern web
applications.

With Meteor you write apps:

* in pure JavaScript
* that send data over the wire, rather than HTML
* using your choice of popular open-source libraries

Try the getting started [tutorial](https://www.meteor.com/try).

Next, read the [guide](http://guide.meteor.com) or the reference documentation at http://docs.meteor.com/.

## What to Use Meteor.js for and When to Use It

Meteor is an open-source, production-ready, real-time full-stack web application framework written using [Node.js](https://github.com/nodejs/node). Meteor takes the hard and complicated parts of building an app and puts them into an open-source platform to help developers focus on what's most important to them in order to get their apps built much faster.  

### Optimized for Developers  

Meteor has isomorphic APIs. This means that Meteor uses the same methods that work on the server to work on the client. Meteor makes it easier for an entire full-stack app to be built by only one developer, or for a team to easily collaborate and understand code across a project.

#### Cross-Platform Code (Android, iOS, Web) 

Meteor allows for very rapid prototyping and produces cross-platform code for apps to run on the web, Android, and iOS. 

#### Develop With One Language

Web developers often need to know different technologies and may become frustrated when working on the front-end, back-end, or the database. With Meteor, you can build and manage them all with JavaScript. 

Development using JavaScript in all environments: 

- The application server
- The web browser
- On mobile devices

#### Databases

The default database already included in Meteor is the [MongoDB](https://github.com/mongodb/mongo) database, but there are alternatives:

- [PostgreSQL](https://github.com/Richie765/meteor-pg)  
- [Reactive PostgreSQL](https://github.com/numtel/meteor-pg)  
- [Reactive MySQL](https://github.com/numtel/meteor-mysql) 
- [RethinkDB](https://github.com/Slava/meteor-rethinkdb)  


### Meteor Works in Real-time

Meteor will automatically update Apps and all client web browsers whenever files are changed and saved. When the database is updated, the data in your templates is updated. There's no need to reload pages in the browser because Meteor hot-pushes the changes out to the browser. This is what Meteor does when it *"sends data over the wire"*.

The web is moving towards real-time Apps that work almost instantly. Users expect that when they click a button, change their settings, log out, or even when they submit forms, for the action to occur immediately. 

#### Distributed Data Protocol (DDP)

The Meteor JavaScript framework created and uses DDP. A client-server protocol for querying and updating a server-side database. It synchronizes these updates among clients by using the [publish-subscribe](https://www.meteor.com/tutorials/blaze/publish-and-subscribe) messaging pattern. 

As part of Meteor's security, it uses the publish-subscribe messaging pattern to control how privacy-sensitive data is stored and what is sent to the client-side database by the server. The functions in Meteor that do this are <code>Meteor.publish</code> and <code>Meteor.subscribe</code>.   

### Galaxy

Meteor Galaxy is the cloud service platform for operating and managing Meteor applications. It offers a free [hosting](https://www.meteor.com/galaxy/signup) option for simple apps, smaller plans for projects that are not commercial level, and paid options for business plans.   

#### Deploying Meteor Applications

Meteor Web Apps can be deployed using <code>meteor deploy</code>, and you can run as many copies of your app as you need. Features to manage your apps include application logs and SSL cert management. 

**Note:** Since updates are pushed right out to the clients by the server, it's important to test all changes made beforehand, because your users may end up experiencing major problems, or even data corruption.

## Quick Start

On Windows, simply go to https://www.meteor.com/install and use the Windows installer.

On Linux/macOS, use this line:

```bash
curl https://install.meteor.com/ | sh
```

Create a project:

```bash
meteor create try-meteor
```

Run it:

```bash
cd try-meteor
meteor
```

## Slow Start (for developers)

If you want to run on the bleeding edge, or [help contribute to Meteor](Contributing.md), you
can run Meteor directly from a Git checkout using these steps:

0. **Clone from GitHub**

    ```sh
    $ git clone --recursive https://github.com/meteor/meteor.git
    $ cd meteor
    ```

    > ##### Important note about Git submodules!
    >
    > This repository uses Git submodules.  If you clone without the `--recursive` flag,
    > re-fetch with `git pull` or experience "`Depending on unknown package`" errors,
    > run the following in the repository root to sync things up again:
    >
    >     $ git submodule update --init --recursive

0. **_(Optional)_ Compile dependencies**

    > This optional step requires a C and C++ compiler, autotools, and scons.
    > If this step is skipped, Meteor will simply download pre-built binaries.

    To build everything from scratch (`node`, `npm`, `mongodb`, etc.) run the following:

    ```sh
    $ ./scripts/generate-dev-bundle.sh # OPTIONAL!
    ```

0. **Run a Meteor command to install dependencies**

    > If you did not compile dependencies above, this will also download the binaries.


    ```sh
    $ ./meteor --help
    ```

0. **Ready to Go!**

    Your local Meteor checkout is now ready to use!  You can use this `./meteor`
    anywhere you would normally call the system `meteor`.  For example,:

    ```sh
    $ cd my-app/
    $ /path/to/meteor-checkout/meteor run
    ```

    > _Note:_ When running from a `git` checkout, you cannot pin apps to specific
    > Meteor releases or change the release using `--release`.

## Uninstalling Meteor

Aside from a short launcher shell script, Meteor installs itself inside your
home directory. To uninstall Meteor, run:

```bash
rm -rf ~/.meteor/
sudo rm /usr/local/bin/meteor
```

On Windows, just run the uninstaller from your Control Panel.

## Developer Resources

Building an application with Meteor?

* Announcement list: sign up at http://www.meteor.com/
* Having problems? Ask for help at: http://stackoverflow.com/questions/tagged/meteor
* Discussion forums: https://forums.meteor.com/

Interested in contributing to Meteor?

* Issue tracker: https://github.com/meteor/meteor/issues
* Contribution guidelines: https://github.com/meteor/meteor/tree/devel/Contributing.md

We are hiring!  Visit https://www.meteor.com/jobs to
learn more about working full-time on the Meteor project.
