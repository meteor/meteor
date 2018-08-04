# Meteor's DDP stream server based on uWS

## Installation

1. Install the uWebSocket Node.js bindings:

    ```bash
    meteor npm install uws@10.148.0
    ```
    
2. Pin the older version of the `socket-stream-client` package,
for using native WebSocket instead of SockJS:

    ```bash
    meteor add socket-stream-client@=0.2.1
    ```

3. Install the `stream-server-uws` package:

    ```bash
    meteor add stream-server-uws
    ```

## Activation

In the `.meteor/packages` place the package `stream-server-uws` before packages:

* `meteor-tools`
* `ddp`
* `ddp-server`

### Example of the `.meteor/packages`

```
stream-server-uws
meteor-tools
# other packages
```

## Have fun

