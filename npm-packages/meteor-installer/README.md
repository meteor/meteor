## Meteor Installer

### Recommended Versions

- For Meteor 2 (Legacy)
  - Use Node.js 14.x
  - Use npm 6.x
- For Meteor 3
  - Use Node.js 20.x or higher
  - Use npm 9.x or higher

### Installation

To install Meteor, run the following command:

```bash
npx meteor
```

It will install Meteor's latest version, alternatively you can install a specific version by running:

```bash
npx meteor@<version>
```

This command will execute the Meteor installer without adding it permanently to your global npm packages.

For more information, visit:

- [Meteor 2 Installation Guide (Legacy)](https://v2-docs.meteor.com/install.html)
- [**Meteor 3 Installation Guide**](https://v3-docs.meteor.com/about/install.html)





### Important Note

This npm package is not the Meteor framework itself; it is just an installer. Do not include it as a dependency in your project, as doing so may break your deployment.

### Path Management

By default, the Meteor installer adds its install path (by default, `~/.meteor/`) to your PATH by updating either your `.bashrc`, `.bash_profile`, or `.zshrc` as appropriate. To disable this behavior, install Meteor by running:

```bash
npm install -g meteor --ignore-meteor-setup-exec-path
```

(or by setting the environment variable `npm_config_ignore_meteor_setup_exec_path=true`)

### Proxy Configuration

Set the `https_proxy` or `HTTPS_PROXY` environment variable to a valid proxy URL to download Meteor files through the configured proxy.

### Meteor Version Compatibility

| NPM Package | Meteor Official Release |
|-------------|-------------------------|
| 3.0.4       | 3.0.4                   |
| 3.0.3       | 3.0.3                   |
| 3.0.2       | 3.0.2                   |
| 3.0.1       | 3.0.1                   |
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
