## Meteor Installer

Requires [Node.js](https://nodejs.org/) 12 or newer.

Install Meteor by running:

```bash
npm install -g meteor
```

If Meteor is already installed, it will do nothing.

Uninstall by running:

```bash
meteor-installer uninstall
npm uninstall -g meteor
```

On Windows,The installer runs faster when [Windows Developer Mode](https://docs.microsoft.com/en-us/windows/apps/get-started/enable-your-device-for-development) is enabled. The installation extracts a large number of small files, which Windows Defender can cause to be very slow.

It is not recommended running the installer and `meteor` as administrator. Otherwise, if the administrator is a separate user the `meteor` command might not always be found. If your current setup needs administrator rights to use npm install -g (sudo), you will need to run it with "sudo npm install -g meteor --unsafe-perm".
We strongly advise against this. You can always change your npm modules permissions to your current user, more info [here](https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally): 

If you use a node version manager that uses a separate global `node_modules` folder for each Node version, you will need to re-install the `meteor` npm package when changing to a Node version for the first time. Otherwise, the `meteor` command will no longer be found.


### Meteor version relationship

| NPM Package | Meteor Official Release |
|-------------|-------------------------|
| 2.3.1       | 2.2.1                   |
| 2.3.2       | 2.3.1                   |
| 2.3.3       | 2.3.2                   |
| 2.3.4       | 2.3.4                   |
| 2.3.5       | 2.3.5                   |
| 2.3.6       | 2.3.5                   |
| 2.3.7       | 2.3.6                   |
| 2.4.0       | 2.4                     |
| 2.4.1       | 2.4                     |
| 2.5.0       | 2.5                     |

