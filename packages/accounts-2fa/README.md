#accounts-2fa

---

Easy 2-Factor Integration For Meteor Apps

This package uses [node-2fa](https://www.npmjs.com/package/node-2fa) which works on top of [notp](https://github.com/guyht/notp), which implements TOTP ([RFC 6238](https://www.ietf.org/rfc/rfc6238.txt)) (the Authenticator standard), which is based on HOTP ([RFC 4226](https://www.ietf.org/rfc/rfc4226.txt)) to provide codes that are exactly compatible with all other Authenticator apps and services that use them.


#Using it

```shell
meteor add accounts-2fa
```

```js
/******** Server ********/
import { generateSecret, verifyCode } from "meteor/accounts-2fa";

Meteor.methods({
  generateSecret(username) {
    const newSecret = generateSecret({ username, appName: "Meteor" });
    /*
    * {
    *   secret: 'AFBYWAQ5MQ1OA32FQXDHQMPHI3YFK358',
    *   svg: <svg>...</svg>
    * }
    */
    return newSecret;
  },
  verifyCode(code, secret) {
    const result = verifyCode({ code, secret });
    /*
    * => {delta: 0} //if success
    * => null //if failed
    */
    return result;
  },
});

/******** Client - React example ********/

const [secretData, setSecret] = useState(null);
const [qrCode, setQrCode] = useState(null);

const handleGenerateSecret = () => {
  Meteor.call("generateSecret", "John", (error, result) => {
    if (error) {
      console.error("Error generating secret", error);
      return;
    }
    const { svg, secret } = result;
    setSecret(secret);
    /*
      the svg can be converted to base64, then be used like: 
       <img 
          width="200"
          src={`data:image/svg+xml;base64,${qrCode}`}
       />
    */
    setQrCode(Buffer.from(svg).toString("base64"));
  });
};

const handleVerifyCode = (code) => {
  Meteor.call("verifyCode", code, secretData, (error, result) => {
    if (error) {
      console.error("Error verifying code", error);
      return;
    }
    // do something with the result
  });
};

```

#API

####generateSecret(options)

Receive options is an object containing `appName` which is the name of your app that will show up when the user scans the QR code and `username` which can be the username and will also show up in the user's app. Both parameters are optional.

> Avoid using spaces in the `appName` and `username`. Today, there's an open issue on `node-2fa` with token invalidation when there's a space on these variables: [node-2fa/issues/6](https://github.com/jeremyscalpello/node-2fa/issues/6). 

####verifyCode({ code, secret, window })

> This function operates exactly like on the package `node-2fa`. You can find the same description [here](https://github.com/jeremyscalpello/node-2fa#verifytokensecret-token-window).

Checks if a time-based token matches a token from secret key within a +/- window (default: 4) minute window.

Returns either `null` if the token does not match, or an object containing delta key, which is an integer of how far behind / forward the code time sync is in terms of how many new codes have been generated since entry.

ex. 
- {delta: -1} means that the client entered the key too late (a newer key was meant to be used). 
- {delta: 1} means the client entered the key too early (an older key was meant to be used). 
- {delta: 0} means the client was within the time frame of the current key.
