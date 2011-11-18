# Skybreak

Skybreak is an ultra-simple framework for building modern websites and web applications. What once took weeks, now takes hours in Skybreak.

With Skybreak you write apps:

* in pure Javascript
* that send data over the wire, rather than HTML
* using your choice of popular open-source libraries

**Have a look at the main Skybreak documentation here:**

http://preview.skybreakplatform.com

**This is still pre-release software. If you use it please, PLEASE sign up on the website above. Especially if you deploy a web site with ```skybreak deploy```**

## Quick Start (normal install process)

Install Skybreak (only OS X, for now):

    curl -sL bit.ly/n122Iu | /bin/sh

Create a project:

    skybreak create try-skybreak

Run it:

    cd try-skybreak
    skybreak

Deploy it to the world, for free:

    skybreak deploy try-skybreak.skybreakplatform.com


## Slow Start (for developers)

If you want to run on the bleeding edge, or help develop Skybreak, you can run Skybreak directly from a git checkout.

    git clone git@github.com:skybreak/skybreak.git
    cd skybreak

If you're the sort of person who likes to build everything from scratch, you can build all the Skybreak dependencies (node.js, npm, mongodb, etc) with the provided script. If you do not run this script, Skybreak will automatically download pre-compiled binaries when you first run it.

    ./admin/generate-dev-bundle.sh # OPTIONAL

Now you can run skybreak directly from the checkout (if you did not build the dev bundle above, this will take a few moments to download dependencies).

    ./skybreak --help

Or install to ```/usr/local``` like the normal install process. This will cause ```skybreak``` to be in your ```PATH```.

    ./install.sh
    skybreak --help



## Developer Resources

There are several communication mechanisms you can use to talk to us or other Skybreak users:

* Google group for discussion: http://groups.google.com/group/skybreak-users
* IRC: ```#skybreak``` on ```irc.freenode.net```
* Email us: ```info@skybreakplatform.com```
