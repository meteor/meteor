On some network or machine setups Meteor's installer for Windows may fail. In such cases, follow these simple steps to install Meteor manually:

1. Install [7-Zip](http://www.7-zip.org/) or any other program that knows how to extract `tar.gz` files.
2. Download the installation archive:
   * 64-bit: https://packages.meteor.com/bootstrap-link?arch=os.windows.x86_64
   * 32-bit: https://packages.meteor.com/bootstrap-link?arch=os.windows.x86_32
3. In a command prompt, run `echo %LocalAppData%\.meteor` -- this is the directory in which Meteor _must_ be installed.
4. Extract the installation archive (from step 2) into the directory above.
5. Add the full directory path from step 3 to your `PATH` environment variable. _([Instructions](https://www.java.com/en/download/help/path.xml))_
6. You should now be able to open a new command prompt and run `meteor`.
   > _Note:_ Some versions of Windows may require restarting after updating the `PATH`.
