## Meteor Installer

Node.js <=14.x and npm <=6.x is recommended.

Install Meteor by running:

```bash
npm install -g meteor
```

[Read more](https://www.meteor.com/developers/install)

### Meteor version relationship

| NPM Package | Meteor Official Release |
|-------------|-------------------------|
| 3.0.0       | 3.0                     |
| 2.16.0      | 2.16.0                  |
| 2.15.0      | 2.15.0                  |
| 2.14.0      | 2.14.0                  |
| 2.13.3      | 2.13.3                  |
| 2.13.1      | 2.13.1                  |
| 2.13.0      | 2.13.0                  |
| 2.12.1      | 2.12.0                  |
| 2.12.0      | 2.12.0                  |
| 2.11.0      | 2.11.0                  |
| 2.10.0      | 2.10.0                  |
| 2.9.1       | 2.9.1                   |
| 2.9.0       | 2.9.0                   |
| 2.8.2       | 2.8.1                   |
| 2.8.1       | 2.8.1                   |
| 2.8.0       | 2.8.0                   |
| 2.7.5       | 2.7.3                   |
| 2.7.4       | 2.7.3                   |
| 2.7.3       | 2.7.2                   |
| 2.7.2       | 2.7.1                   |
| 2.7.1       | 2.7                     |
| 2.7.0       | 2.7                     |
| 2.6.2       | 2.6.1                   |
| 2.6.1       | 2.6                     |
| 2.6.0       | 2.6                     |
| 2.5.9       | 2.5.8                   |
| 2.5.8       | 2.5.7                   |
| 2.5.7       | 2.5.6                   |
| 2.5.6       | 2.5.5                   |
| 2.5.5       | 2.5.4                   |
| 2.5.4       | 2.5.3                   |
| 2.5.3       | 2.5.2                   |
| 2.5.2       | 2.5.1                   |
| 2.5.1       | 2.5.1                   |
| 2.5.0       | 2.5                     |
| 2.4.1       | 2.4                     |
| 2.4.0       | 2.4                     |
| 2.3.7       | 2.3.6                   |
| 2.3.6       | 2.3.5                   |
| 2.3.5       | 2.3.5                   |
| 2.3.4       | 2.3.4                   |
| 2.3.3       | 2.3.2                   |
| 2.3.2       | 2.3.1                   |
| 2.3.1       | 2.2.1                   |

### Important note

This npm package is not Meteor itself, it is just an installer. You should not include it as a dependency in your project. If you do, your deployment is going to be broken.

### Path management

By default, the Meteor installer adds its install path (by default, `~/.meteor/`) to your PATH by updating either your `.bashrc`, `.bash_profile`, or `.zshrc` as appropriate. To disable this behavior, install Meteor by running:

```bash
npm install -g meteor --ignore-meteor-setup-exec-path
```

(or by setting the environment variable `npm_config_ignore_meteor_setup_exec_path=true`)

### Proxy configuration

Setting the `https_proxy` or `HTTPS_PROXY` environment variable to a valid proxy URL will cause the
downloader to use the configured proxy to retrieve the Meteor files.
