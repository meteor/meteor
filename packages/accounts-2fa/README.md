#accounts-2fa

---

Easy 2-Factor Integration For Meteor Apps

This package uses [node-2fa](https://www.npmjs.com/package/node-2fa) which works on top of [notp](https://github.com/guyht/notp), which implements TOTP ([RFC 6238](https://www.ietf.org/rfc/rfc6238.txt)) (the Authenticator standard), which is based on HOTP ([RFC 4226](https://www.ietf.org/rfc/rfc4226.txt)) to provide codes that are exactly compatible with all other Authenticator apps and services that use them.


#Using it

```shell
meteor add accounts-2fa
```

When the package is added, the meteor `Meteor.loginWithPassword()` starts to accept 3 parameters: `Meteor.loginWithPassword(selector, password, token)`. The token is required when the user has 2FA enabled. Examples: 

**Generating a new QR code**
```js
import { Buffer } from "buffer";
import { Accounts } from 'meteor/accounts-base';

--
  
const [qrCode, setQrCode] = useState(null);

--
  
<button
  onClick={() => {
    Accounts.generateSvgCodeAndSaveSecret((err, svg) => {
      if (err) {console.error("...", err);return;}
      /*
        the svg can be converted to base64, then be used like: 
         <img 
            width="200"
            src={`data:image/svg+xml;base64,${qrCode}`}
         />
      */
      setQrCode(Buffer.from(svg).toString('base64'));
    })
  }}
>
  Generate a new code
</button>
```

**Enabling 2FA**
```js
import { Accounts } from 'meteor/accounts-base';

--
  
const [code, setCode] = useState(null);

--

const handleValidateCodeFromQr = () => {
  try {
    Accounts.enableUser2fa(code);
    console.log("2FA enabled");
  } catch (err) {
    console.error('Error verifying code from qr', err);
  }
}
  
--
  
<div>
    <img
      alt="qr code"
      width="200"
      src={`data:image/svg+xml;base64,${qrCode}`}
    />
    <input onChange={({target: {value}}) => setCode(value)}/>
    <button onClick={handleValidateCodeFromQr}>validate</button>
</div>
```

**Disabling 2FA**
```js
import { Accounts } from 'meteor/accounts-base';

---

<button
    onClick={() => {
      Accounts.disableUser2fa()
    }}
>
  Disable 2FA
</button>
```

**Login**

```js
// Verify with the user has 2FA enabled. If no, performe normal login.
<button 
  onClick={() => {
    Accounts.has2FAEnabled(username, (err, isEnabled) => {
      if (err) {
        console.error("Error verifying if user has 2fa enabled", err);
        return;
      }

      if (isEnabled) {
        // send user to a page or show a component 
        // where they can provide a 2FA code
        setShouldAskCode(true);
        return;
      }
      // Normal login when they don't have 2FA enabled.
      Meteor.loginWithPassword(username, password, error => {
        if (error) {
          console.error("Error trying to log in (user without 2fa)", error);
        }
      });
    });
  }
}>
  Login
</button>

// If 2FA is enabled, inform a token, with username and password.
<button onClick={() => {
  Meteor.loginWithPassword(username, password, code,error => {
    if (error) {
      console.error("Error trying to log in (user with 2fa)", error);
    }
  })}
}>
  Validate
</button>
```

#API

####Accounts.generateSvgCodeAndSaveSecret({String} appName, {Function} [callback])

Receive an `appName` which is the name of your app that will show up when the user scans the QR code. Also, a callback that's called with no arguments on success, or with a single `Error` argument
on failure. Both parameters are optional.

On success, this function will add an object to the logged user containing the QR secret:

```js
twoFactorAuthetication: {
  secret: "***"
}
```

> Avoid using spaces in the `appName`. Today, there's an open issue on `node-2fa` with token invalidation when there's a space on these variables: [node-2fa/issues/6](https://github.com/jeremyscalpello/node-2fa/issues/6). 

####Accounts.enableUser2fa({String} code)

Called with a code the user will receive from the authenticator app once they read the QR code. This function throws an error on failure. If the code provided is correct, a `type` will be added to the user's `twoFactorAuthentication` object:

```js
twoFactorAuthetication: {
  type: "otp",
  secret: "***",
}
```

#### Accounts.disableUser2fa()

Called with no arguments. Remove the object `twoFactorAuthentication` from the user. Throws an error on failure.


#### Accounts.has2FAEnabled({String} username, {Function} [callback])

Called with two arguments: Username, and a callback function. The `username` is the user you want to verify if the 2FA is enabled. The callback is called with a boolean on success indicating if the user have or not the 2FA enabled, or with a single `Error` argument on failure.
