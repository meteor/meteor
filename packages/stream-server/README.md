# Meteor's DDP stream server based on SockJS

> Network core of the Meteor's DDP.

The `stream-server` package provides:

* the default Meteor's stream server based on SockJS;
* the mechanism to replace bundled `StreamServer`.

## How to add your custom `StreamServer` to `StreamServers` and activate it

For example your package has name `custom-stream-server`.

1. Enable access to the `StreamServers` variable.

    `custom-stream-server/package.js`

    ```js
    Package.onUse(function (api) {
      // Add following lines
      api.use(['stream-server'], 'server');
      api.imply(['stream-server'], 'server');
      api.export('StreamServers', 'server');
      // ...
    });
    ```

2. Create `CustomStreamServer`

    ```js
    class CustomStreamServer {
      constructor() {
        // this.server = new WebSocket.Server();
      }
    }
    ```

3. Push `CustomStreamServer` to the `StreamServers` array.

    `custom-stream-server/server.js`

    ```js
    StreamServers.push(CustomStreamServer);
    ```

4. Activate your custom stream server.

    In the `.meteor/packages` place your package name before any packages that's loading:
    
    * `meteor-tools`
    * `ddp`
    * `ddp-server`

    Example of the `.meteor/packages`
    
    ```
    custom-stream-server # on top
    # packages
    ``` 