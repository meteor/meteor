# Skybreak

Skybreak is an ultra-simple environment for building modern web
applications.

With Skybreak you write apps:

* in pure Javascript
* that send data over the wire, rather than HTML
* using your choice of popular open-source libraries

Please, do not share or blog about Skybreak yet.  It is experimental,
pre-release software.  We hope it shows the direction of our thinking,
and much of it will to change.  We'd love to hear your feedback.

Documentation is available at http://preview.skybreakplatform.com/

## Quick Start

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

If you want to run on the bleeding edge, or help develop Skybreak, you
can run Skybreak directly from a git checkout.

    git clone git@github.com:skybreak/skybreak.git
    cd skybreak

If you're the sort of person who likes to build everything from scratch,
you can build all the Skybreak dependencies (node.js, npm, mongodb, etc)
with the provided script. If you do not run this script, Skybreak will
automatically download pre-compiled binaries when you first run it.

    # OPTIONAL
    ./admin/generate-dev-bundle.sh

Now you can run skybreak directly from the checkout (if you did not
build the dependency bundle above, this will take a few moments to
download a pre-build version).

    ./skybreak --help

Or install to ```/usr/local``` like the normal install process. This
will cause ```skybreak``` to be in your ```PATH```.

    ./install.sh
    skybreak --help

## Developer Resources

Get in touch! We'd love to hear what you think. You can get involved
in several ways:

* Announcement list: sign up at http://preview.skybreakplatform.com/
* Google group for discussion: http://groups.google.com/group/skybreak-users
* IRC: ```#skybreak``` on ```irc.freenode.net```
* Email us: ```info@skybreakplatform.com```
