On some network or machine setups Meteor's installer for Windows may fail. In such cases, follow these simple steps to install Meteor manually:

1. Install [7-Zip](http://www.7-zip.org/) or any other program that knows how to extract `tar.gz` files.
2. Download the installation archive from https://packages.meteor.com/bootstrap-link?arch=os.windows.x86_32.
3. In a command prompt, run `echo %LocalAppData%\.meteor` -- this is the directory in which Meteor should be installed.
4. Extract the installation archive into the directory above.
5. Add this directory to your PATH environment variable.
6. You should now be able to open a new command prompt and run `meteor`. Some versions of Windows may require restarting your machine first.
