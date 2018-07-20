import crypto from 'crypto';
import {
  AccountsCommon,
  EXPIRE_TOKENS_INTERVAL_MS,
  CONNECTION_CLOSE_DELAY_MS
} from './accounts_common.js';

const hasOwn = Object.prototype.hasOwnProperty;

/**
 * @summary Constructor for the `Accounts` namespace on the server.
 * @locus Server
 * @class AccountsServer
 * @extends AccountsCommon
 * @instancename accountsServer
 * @param {Object} server A server object such as `Meteor.server`.
 */
export class AccountsServer extends AccountsCommon {
  // Note that this constructor is less likely to be instantiated multiple
  // times than the `AccountsClient` constructor, because a single server
  // can provide only one set of methods.
  constructor(server) {
    super();

    this._server = server || Meteor.server;
    // Set up the server's methods, as if by calling Meteor.methods.
    this._initServerMethods();

    this._initAccountDataHooks();

    // If autopublish is on, publish these user fields. Login service
    // packages (eg accounts-google) add to these by calling
    // addAutopublishFields.  Notably, this isn't implemented with multiple
    // publishes since DDP only merges only across top-level fields, not
    // subfields (such as 'services.facebook.accessToken')
    this._autopublishFields = {
      loggedInUser: ['profile', 'username', 'emails'],
      otherUsers: ['profile', 'username']
    };
    this._initServerPublications();

    // connectionId -> {connection, loginToken}
    this._accountData = {};

    // connection id -> observe handle for the login token that this connection is
    // currently associated with, or a number. The number indicates that we are in
    // the process of setting up the observe (using a number instead of a single
    // sentinel allows multiple attempts to set up the observe to identify which
    // one was theirs).
    this._userObservesForConnections = {};
    this._nextUserObserveNumber = 1;  // for the number described above.

    // list of all registered handlers.
    this._loginHandlers = [];

    setupUsersCollection(this.users);
    setupDefaultLoginHandlers(this);
    setExpireTokensInterval(this);

    this._validateLoginHook = new Hook({ bindEnvironment: false });
    this._validateNewUserHooks = [
      defaultValidateNewUserHook.bind(this)
    ];

    this._deleteSavedTokensForAllUsersOnStartup();

    this._skipCaseInsensitiveChecksForTest = {};

    // XXX These should probably not actually be public?
    this.urls = {
      resetPassword: token => Meteor.absoluteUrl(`#/reset-password/${token}`),
      verifyEmail: token => Meteor.absoluteUrl(`#/verify-email/${token}`),
      enrollAccount: token => Meteor.absoluteUrl(`#/enroll-account/${token}`),
    }

    this.addDefaultRateLimit()
  }

  ///
  /// CURRENT USER
  ///

  // @override of "abstract" non-implementation in accounts_common.js
  userId() {
    // This function only works if called inside a method or a pubication.
    // Using any of the infomation from Meteor.user() in a method or
    // publish function will always use the value from when the function first
    // runs. This is likely not what the user expects. The way to make this work
    // in a method or publish function is to do Meteor.find(this.userId).observe
    // and recompute when the user record changes.
    const currentInvocation = DDP._CurrentMethodInvocation.get() || DDP._CurrentPublicationInvocation.get();
    if (!currentInvocation)
      throw new Error("Meteor.userId can only be invoked in method calls or publications.");
    return currentInvocation.userId;
  }

  ///
  /// LOGIN HOOKS
  ///

  /**
   * @summary Validate login attempts.
   * @locus Server
   * @param {Function} func Called whenever a login is attempted (either successful or unsuccessful).  A login can be aborted by returning a falsy value or throwing an exception.
   */
  validateLoginAttempt(func) {
    // Exceptions inside the hook callback are passed up to us.
    return this._validateLoginHook.register(func);
  }

  /**
   * @summary Set restrictions on new user creation.
   * @locus Server
   * @param {Function} func Called whenever a new user is created. Takes the new user object, and returns true to allow the creation or false to abort.
   */
  validateNewUser(func) {
    this._validateNewUserHooks.push(func);
  }

  ///
  /// CREATE USER HOOKS
  ///

  /**
   * @summary Customize new user creation.
   * @locus Server
   * @param {Function} func Called whenever a new user is created. Return the new user object, or throw an `Error` to abort the creation.
   */
  onCreateUser(func) {
    if (this._onCreateUserHook) {
      throw new Error("Can only call onCreateUser once");
    }

    this._onCreateUserHook = func;
  }

  /**
   * @summary Customize oauth user profile updates
   * @locus Server
   * @param {Function} func Called whenever a user is logged in via oauth. Return the profile object to be merged, or throw an `Error` to abort the creation.
   */
  onExternalLogin(func) {
    if (this._onExternalLoginHook) {
      throw new Error("Can only call onExternalLogin once");
    }

    this._onExternalLoginHook = func;
  }

  _validateLogin(connection, attempt) {
    this._validateLoginHook.each(callback => {
      let ret;
      try {
        ret = callback(cloneAttemptWithConnection(connection, attempt));
      }
      catch (e) {
        attempt.allowed = false;
        // XXX this means the last thrown error overrides previous error
        // messages. Maybe this is surprising to users and we should make
        // overriding errors more explicit. (see
        // https://github.com/meteor/meteor/issues/1960)
        attempt.error = e;
        return true;
      }
      if (! ret) {
        attempt.allowed = false;
        // don't override a specific error provided by a previous
        // validator or the initial attempt (eg "incorrect password").
        if (!attempt.error)
          attempt.error = new Meteor.Error(403, "Login forbidden");
      }
      return true;
    });
  };

  _successfulLogin(connection, attempt) {
    this._onLoginHook.each(callback => {
      callback(cloneAttemptWithConnection(connection, attempt));
      return true;
    });
  };

  _failedLogin(connection, attempt) {
    this._onLoginFailureHook.each(callback => {
      callback(cloneAttemptWithConnection(connection, attempt));
      return true;
    });
  };

  _successfulLogout(connection, userId) {
    const user = userId && this.users.findOne(userId);
    this._onLogoutHook.each(callback => {
      callback({ user, connection });
      return true;
    });
  };

  ///
  /// LOGIN METHODS
  ///

  // Login methods return to the client an object containing these
  // fields when the user was logged in successfully:
  //
  //   id: userId
  //   token: *
  //   tokenExpires: *
  //
  // tokenExpires is optional and intends to provide a hint to the
  // client as to when the token will expire. If not provided, the
  // client will call Accounts._tokenExpiration, passing it the date
  // that it received the token.
  //
  // The login method will throw an error back to the client if the user
  // failed to log in.
  //
  //
  // Login handlers and service specific login methods such as
  // `createUser` internally return a `result` object containing these
  // fields:
  //
  //   type:
  //     optional string; the service name, overrides the handler
  //     default if present.
  //
  //   error:
  //     exception; if the user is not allowed to login, the reason why.
  //
  //   userId:
  //     string; the user id of the user attempting to login (if
  //     known), required for an allowed login.
  //
  //   options:
  //     optional object merged into the result returned by the login
  //     method; used by HAMK from SRP.
  //
  //   stampedLoginToken:
  //     optional object with `token` and `when` indicating the login
  //     token is already present in the database, returned by the
  //     "resume" login handler.
  //
  // For convenience, login methods can also throw an exception, which
  // is converted into an {error} result.  However, if the id of the
  // user attempting the login is known, a {userId, error} result should
  // be returned instead since the user id is not captured when an
  // exception is thrown.
  //
  // This internal `result` object is automatically converted into the
  // public {id, token, tokenExpires} object returned to the client.

  // Try a login method, converting thrown exceptions into an {error}
  // result.  The `type` argument is a default, inserted into the result
  // object if not explicitly returned.
  //
  // Log in a user on a connection.
  //
  // We use the method invocation to set the user id on the connection,
  // not the connection object directly. setUserId is tied to methods to
  // enforce clear ordering of method application (using wait methods on
  // the client, and a no setUserId after unblock restriction on the
  // server)
  //
  // The `stampedLoginToken` parameter is optional.  When present, it
  // indicates that the login token has already been inserted into the
  // database and doesn't need to be inserted again.  (It's used by the
  // "resume" login handler).
  _loginUser(methodInvocation, userId, stampedLoginToken) {
    if (! stampedLoginToken) {
      stampedLoginToken = this._generateStampedLoginToken();
      this._insertLoginToken(userId, stampedLoginToken);
    }

    // This order (and the avoidance of yields) is important to make
    // sure that when publish functions are rerun, they see a
    // consistent view of the world: the userId is set and matches
    // the login token on the connection (not that there is
    // currently a public API for reading the login token on a
    // connection).
    Meteor._noYieldsAllowed(() =>
      this._setLoginToken(
        userId,
        methodInvocation.connection,
        this._hashLoginToken(stampedLoginToken.token)
      )
    );

    methodInvocation.setUserId(userId);

    return {
      id: userId,
      token: stampedLoginToken.token,
      tokenExpires: this._tokenExpiration(stampedLoginToken.when)
    };
  };

  // After a login method has completed, call the login hooks.  Note
  // that `attemptLogin` is called for *all* login attempts, even ones
  // which aren't successful (such as an invalid password, etc).
  //
  // If the login is allowed and isn't aborted by a validate login hook
  // callback, log in the user.
  //
  _attemptLogin(
    methodInvocation,
    methodName,
    methodArgs,
    result
  ) {
    if (!result)
      throw new Error("result is required");

    // XXX A programming error in a login handler can lead to this occuring, and
    // then we don't call onLogin or onLoginFailure callbacks. Should
    // tryLoginMethod catch this case and turn it into an error?
    if (!result.userId && !result.error)
      throw new Error("A login method must specify a userId or an error");

    let user;
    if (result.userId)
      user = this.users.findOne(result.userId);

    const attempt = {
      type: result.type || "unknown",
      allowed: !! (result.userId && !result.error),
      methodName: methodName,
      methodArguments: Array.from(methodArgs)
    };
    if (result.error) {
      attempt.error = result.error;
    }
    if (user) {
      attempt.user = user;
    }

    // _validateLogin may mutate `attempt` by adding an error and changing allowed
    // to false, but that's the only change it can make (and the user's callbacks
    // only get a clone of `attempt`).
    this._validateLogin(methodInvocation.connection, attempt);

    if (attempt.allowed) {
      const ret = {
        ...this._loginUser(
          methodInvocation,
          result.userId,
          result.stampedLoginToken
        ),
        ...result.options
      };
      ret.type = attempt.type;
      this._successfulLogin(methodInvocation.connection, attempt);
      return ret;
    }
    else {
      this._failedLogin(methodInvocation.connection, attempt);
      throw attempt.error;
    }
  };

  // All service specific login methods should go through this function.
  // Ensure that thrown exceptions are caught and that login hook
  // callbacks are still called.
  //
  _loginMethod(
    methodInvocation,
    methodName,
    methodArgs,
    type,
    fn
  ) {
    return this._attemptLogin(
      methodInvocation,
      methodName,
      methodArgs,
      tryLoginMethod(type, fn)
    );
  };


  // Report a login attempt failed outside the context of a normal login
  // method. This is for use in the case where there is a multi-step login
  // procedure (eg SRP based password login). If a method early in the
  // chain fails, it should call this function to report a failure. There
  // is no corresponding method for a successful login; methods that can
  // succeed at logging a user in should always be actual login methods
  // (using either Accounts._loginMethod or Accounts.registerLoginHandler).
  _reportLoginFailure(
    methodInvocation,
    methodName,
    methodArgs,
    result
  ) {
    const attempt = {
      type: result.type || "unknown",
      allowed: false,
      error: result.error,
      methodName: methodName,
      methodArguments: Array.from(methodArgs)
    };

    if (result.userId) {
      attempt.user = this.users.findOne(result.userId);
    }

    this._validateLogin(methodInvocation.connection, attempt);
    this._failedLogin(methodInvocation.connection, attempt);

    // _validateLogin may mutate attempt to set a new error message. Return
    // the modified version.
    return attempt;
  };

  ///
  /// LOGIN HANDLERS
  ///

  // The main entry point for auth packages to hook in to login.
  //
  // A login handler is a login method which can return `undefined` to
  // indicate that the login request is not handled by this handler.
  //
  // @param name {String} Optional.  The service name, used by default
  // if a specific service name isn't returned in the result.
  //
  // @param handler {Function} A function that receives an options object
  // (as passed as an argument to the `login` method) and returns one of:
  // - `undefined`, meaning don't handle;
  // - a login method result object

  registerLoginHandler(name, handler) {
    if (! handler) {
      handler = name;
      name = null;
    }

    this._loginHandlers.push({
      name: name,
      handler: handler
    });
  };


  // Checks a user's credentials against all the registered login
  // handlers, and returns a login token if the credentials are valid. It
  // is like the login method, except that it doesn't set the logged-in
  // user on the connection. Throws a Meteor.Error if logging in fails,
  // including the case where none of the login handlers handled the login
  // request. Otherwise, returns {id: userId, token: *, tokenExpires: *}.
  //
  // For example, if you want to login with a plaintext password, `options` could be
  //   { user: { username: <username> }, password: <password> }, or
  //   { user: { email: <email> }, password: <password> }.

  // Try all of the registered login handlers until one of them doesn't
  // return `undefined`, meaning it handled this call to `login`. Return
  // that return value.
  _runLoginHandlers(methodInvocation, options) {
    for (let handler of this._loginHandlers) {
      const result = tryLoginMethod(
        handler.name,
        () => handler.handler.call(methodInvocation, options)
      );

      if (result) {
        return result;
      }

      if (result !== undefined) {
        throw new Meteor.Error(400, "A login handler should return a result or undefined");
      }
    }

    return {
      type: null,
      error: new Meteor.Error(400, "Unrecognized options for login request")
    };
  };

  // Deletes the given loginToken from the database.
  //
  // For new-style hashed token, this will cause all connections
  // associated with the token to be closed.
  //
  // Any connections associated with old-style unhashed tokens will be
  // in the process of becoming associated with hashed tokens and then
  // they'll get closed.
  destroyToken(userId, loginToken) {
    this.users.update(userId, {
      $pull: {
        "services.resume.loginTokens": {
          $or: [
            { hashedToken: loginToken },
            { token: loginToken }
          ]
        }
      }
    });
  };

  _initServerMethods() {
    // The methods created in this function need to be created here so that
    // this variable is available in their scope.
    const accounts = this;


    // This object will be populated with methods and then passed to
    // accounts._server.methods further below.
    const methods = {};

    // @returns {Object|null}
    //   If successful, returns {token: reconnectToken, id: userId}
    //   If unsuccessful (for example, if the user closed the oauth login popup),
    //     throws an error describing the reason
    methods.login = function (options) {
      // Login handlers should really also check whatever field they look at in
      // options, but we don't enforce it.
      check(options, Object);

      const result = accounts._runLoginHandlers(this, options);

      return accounts._attemptLogin(this, "login", arguments, result);
    };

    methods.logout = function () {
      const token = accounts._getLoginToken(this.connection.id);
      accounts._setLoginToken(this.userId, this.connection, null);
      if (token && this.userId) {
        accounts.destroyToken(this.userId, token);
      }
      accounts._successfulLogout(this.connection, this.userId);
      this.setUserId(null);
    };

    // Delete all the current user's tokens and close all open connections logged
    // in as this user. Returns a fresh new login token that this client can
    // use. Tests set Accounts._noConnectionCloseDelayForTest to delete tokens
    // immediately instead of using a delay.
    //
    // XXX COMPAT WITH 0.7.2
    // This single `logoutOtherClients` method has been replaced with two
    // methods, one that you call to get a new token, and another that you
    // call to remove all tokens except your own. The new design allows
    // clients to know when other clients have actually been logged
    // out. (The `logoutOtherClients` method guarantees the caller that
    // the other clients will be logged out at some point, but makes no
    // guarantees about when.) This method is left in for backwards
    // compatibility, especially since application code might be calling
    // this method directly.
    //
    // @returns {Object} Object with token and tokenExpires keys.
    methods.logoutOtherClients = function () {
      const user = accounts.users.findOne(this.userId, {
        fields: {
          "services.resume.loginTokens": true
        }
      });
      if (user) {
        // Save the current tokens in the database to be deleted in
        // CONNECTION_CLOSE_DELAY_MS ms. This gives other connections in the
        // caller's browser time to find the fresh token in localStorage. We save
        // the tokens in the database in case we crash before actually deleting
        // them.
        const tokens = user.services.resume.loginTokens;
        const newToken = accounts._generateStampedLoginToken();
        accounts.users.update(this.userId, {
          $set: {
            "services.resume.loginTokensToDelete": tokens,
            "services.resume.haveLoginTokensToDelete": true
          },
          $push: { "services.resume.loginTokens": accounts._hashStampedToken(newToken) }
        });
        Meteor.setTimeout(() => {
          // The observe on Meteor.users will take care of closing the connections
          // associated with `tokens`.
          accounts._deleteSavedTokensForUser(this.userId, tokens);
        }, accounts._noConnectionCloseDelayForTest ? 0 :
          CONNECTION_CLOSE_DELAY_MS);
        // We do not set the login token on this connection, but instead the
        // observe closes the connection and the client will reconnect with the
        // new token.
        return {
          token: newToken.token,
          tokenExpires: accounts._tokenExpiration(newToken.when)
        };
      } else {
        throw new Meteor.Error("You are not logged in.");
      }
    };

    // Generates a new login token with the same expiration as the
    // connection's current token and saves it to the database. Associates
    // the connection with this new token and returns it. Throws an error
    // if called on a connection that isn't logged in.
    //
    // @returns Object
    //   If successful, returns { token: <new token>, id: <user id>,
    //   tokenExpires: <expiration date> }.
    methods.getNewToken = function () {
      const user = accounts.users.findOne(this.userId, {
        fields: { "services.resume.loginTokens": 1 }
      });
      if (! this.userId || ! user) {
        throw new Meteor.Error("You are not logged in.");
      }
      // Be careful not to generate a new token that has a later
      // expiration than the curren token. Otherwise, a bad guy with a
      // stolen token could use this method to stop his stolen token from
      // ever expiring.
      const currentHashedToken = accounts._getLoginToken(this.connection.id);
      const currentStampedToken = user.services.resume.loginTokens.find(
        stampedToken => stampedToken.hashedToken === currentHashedToken
      );
      if (! currentStampedToken) { // safety belt: this should never happen
        throw new Meteor.Error("Invalid login token");
      }
      const newStampedToken = accounts._generateStampedLoginToken();
      newStampedToken.when = currentStampedToken.when;
      accounts._insertLoginToken(this.userId, newStampedToken);
      return accounts._loginUser(this, this.userId, newStampedToken);
    };

    // Removes all tokens except the token associated with the current
    // connection. Throws an error if the connection is not logged
    // in. Returns nothing on success.
    methods.removeOtherTokens = function () {
      if (! this.userId) {
        throw new Meteor.Error("You are not logged in.");
      }
      const currentToken = accounts._getLoginToken(this.connection.id);
      accounts.users.update(this.userId, {
        $pull: {
          "services.resume.loginTokens": { hashedToken: { $ne: currentToken } }
        }
      });
    };

    // Allow a one-time configuration for a login service. Modifications
    // to this collection are also allowed in insecure mode.
    methods.configureLoginService = (options) => {
      check(options, Match.ObjectIncluding({service: String}));
      // Don't let random users configure a service we haven't added yet (so
      // that when we do later add it, it's set up with their configuration
      // instead of ours).
      // XXX if service configuration is oauth-specific then this code should
      //     be in accounts-oauth; if it's not then the registry should be
      //     in this package
      if (!(accounts.oauth
        && accounts.oauth.serviceNames().includes(options.service))) {
        throw new Meteor.Error(403, "Service unknown");
      }

      const { ServiceConfiguration } = Package['service-configuration'];
      if (ServiceConfiguration.configurations.findOne({service: options.service}))
        throw new Meteor.Error(403, `Service ${options.service} already configured`);

      if (hasOwn.call(options, 'secret') && usingOAuthEncryption())
        options.secret = OAuthEncryption.seal(options.secret);

      ServiceConfiguration.configurations.insert(options);
    };

    accounts._server.methods(methods);
  };

  _initAccountDataHooks() {
    this._server.onConnection(connection => {
      this._accountData[connection.id] = {
        connection: connection
      };

      connection.onClose(() => {
        this._removeTokenFromConnection(connection.id);
        delete this._accountData[connection.id];
      });
    });
  };

  _initServerPublications() {
    // Bring into lexical scope for publish callbacks that need `this`
    const { users, _autopublishFields } = this;

    // Publish all login service configuration fields other than secret.
    this._server.publish("meteor.loginServiceConfiguration", () => {
      const { ServiceConfiguration } = Package['service-configuration'];
      return ServiceConfiguration.configurations.find({}, {fields: {secret: 0}});
    }, {is_auto: true}); // not techincally autopublish, but stops the warning.

    // Publish the current user's record to the client.
    this._server.publish(null, function () {
      if (this.userId) {
        return users.find({
          _id: this.userId
        }, {
          fields: {
            profile: 1,
            username: 1,
            emails: 1
          }
        });
      } else {
        return null;
      }
    }, /*suppress autopublish warning*/{is_auto: true});

    // Use Meteor.startup to give other packages a chance to call
    // addAutopublishFields.
    Package.autopublish && Meteor.startup(() => {
      // ['profile', 'username'] -> {profile: 1, username: 1}
      const toFieldSelector = fields => fields.reduce((prev, field) => (
          { ...prev, [field]: 1 }),
        {}
      );
      this._server.publish(null, function () {
        if (this.userId) {
          return users.find({ _id: this.userId }, {
            fields: toFieldSelector(_autopublishFields.loggedInUser),
          })
        } else {
          return null;
        }
      }, /*suppress autopublish warning*/{is_auto: true});

      // XXX this publish is neither dedup-able nor is it optimized by our special
      // treatment of queries on a specific _id. Therefore this will have O(n^2)
      // run-time performance every time a user document is changed (eg someone
      // logging in). If this is a problem, we can instead write a manual publish
      // function which filters out fields based on 'this.userId'.
      this._server.publish(null, function () {
        const selector = this.userId ? { _id: { $ne: this.userId } } : {};
        return users.find(selector, {
          fields: toFieldSelector(_autopublishFields.otherUsers),
        })
      }, /*suppress autopublish warning*/{is_auto: true});
    });
  };

  // Add to the list of fields or subfields to be automatically
  // published if autopublish is on. Must be called from top-level
  // code (ie, before Meteor.startup hooks run).
  //
  // @param opts {Object} with:
  //   - forLoggedInUser {Array} Array of fields published to the logged-in user
  //   - forOtherUsers {Array} Array of fields published to users that aren't logged in
  addAutopublishFields(opts) {
    this._autopublishFields.loggedInUser.push.apply(
      this._autopublishFields.loggedInUser, opts.forLoggedInUser);
    this._autopublishFields.otherUsers.push.apply(
      this._autopublishFields.otherUsers, opts.forOtherUsers);
  };

  ///
  /// ACCOUNT DATA
  ///

  // HACK: This is used by 'meteor-accounts' to get the loginToken for a
  // connection. Maybe there should be a public way to do that.
  _getAccountData(connectionId, field) {
    const data = this._accountData[connectionId];
    return data && data[field];
  };

  _setAccountData(connectionId, field, value) {
    const data = this._accountData[connectionId];

    // safety belt. shouldn't happen. accountData is set in onConnection,
    // we don't have a connectionId until it is set.
    if (!data)
      return;

    if (value === undefined)
      delete data[field];
    else
      data[field] = value;
  };

  ///
  /// RECONNECT TOKENS
  ///
  /// support reconnecting using a meteor login token

  _hashLoginToken(loginToken) {
    const hash = crypto.createHash('sha256');
    hash.update(loginToken);
    return hash.digest('base64');
  };

  // {token, when} => {hashedToken, when}
  _hashStampedToken(stampedToken) {
    const hashedStampedToken = Object.keys(stampedToken).reduce(
      (prev, key) => key === 'token' ?
        prev :
        { ...prev, [key]: stampedToken[key] },
      {},
    )
    return {
      ...hashedStampedToken,
      hashedToken: this._hashLoginToken(stampedToken.token)
    };
  };

  // Using $addToSet avoids getting an index error if another client
  // logging in simultaneously has already inserted the new hashed
  // token.
  _insertHashedLoginToken(userId, hashedToken, query) {
    query = query ? { ...query } : {};
    query._id = userId;
    this.users.update(query, {
      $addToSet: {
        "services.resume.loginTokens": hashedToken
      }
    });
  };

  // Exported for tests.
  _insertLoginToken(userId, stampedToken, query) {
    this._insertHashedLoginToken(
      userId,
      this._hashStampedToken(stampedToken),
      query
    );
  };

  _clearAllLoginTokens(userId) {
    this.users.update(userId, {
      $set: {
        'services.resume.loginTokens': []
      }
    });
  };

  // test hook
  _getUserObserve(connectionId) {
    return this._userObservesForConnections[connectionId];
  };

  // Clean up this connection's association with the token: that is, stop
  // the observe that we started when we associated the connection with
  // this token.
  _removeTokenFromConnection(connectionId) {
    if (hasOwn.call(this._userObservesForConnections, connectionId)) {
      const observe = this._userObservesForConnections[connectionId];
      if (typeof observe === 'number') {
        // We're in the process of setting up an observe for this connection. We
        // can't clean up that observe yet, but if we delete the placeholder for
        // this connection, then the observe will get cleaned up as soon as it has
        // been set up.
        delete this._userObservesForConnections[connectionId];
      } else {
        delete this._userObservesForConnections[connectionId];
        observe.stop();
      }
    }
  };

  _getLoginToken(connectionId) {
    return this._getAccountData(connectionId, 'loginToken');
  };

  // newToken is a hashed token.
  _setLoginToken(userId, connection, newToken) {
    this._removeTokenFromConnection(connection.id);
    this._setAccountData(connection.id, 'loginToken', newToken);

    if (newToken) {
      // Set up an observe for this token. If the token goes away, we need
      // to close the connection.  We defer the observe because there's
      // no need for it to be on the critical path for login; we just need
      // to ensure that the connection will get closed at some point if
      // the token gets deleted.
      //
      // Initially, we set the observe for this connection to a number; this
      // signifies to other code (which might run while we yield) that we are in
      // the process of setting up an observe for this connection. Once the
      // observe is ready to go, we replace the number with the real observe
      // handle (unless the placeholder has been deleted or replaced by a
      // different placehold number, signifying that the connection was closed
      // already -- in this case we just clean up the observe that we started).
      const myObserveNumber = ++this._nextUserObserveNumber;
      this._userObservesForConnections[connection.id] = myObserveNumber;
      Meteor.defer(() => {
        // If something else happened on this connection in the meantime (it got
        // closed, or another call to _setLoginToken happened), just do
        // nothing. We don't need to start an observe for an old connection or old
        // token.
        if (this._userObservesForConnections[connection.id] !== myObserveNumber) {
          return;
        }

        let foundMatchingUser;
        // Because we upgrade unhashed login tokens to hashed tokens at
        // login time, sessions will only be logged in with a hashed
        // token. Thus we only need to observe hashed tokens here.
        const observe = this.users.find({
          _id: userId,
          'services.resume.loginTokens.hashedToken': newToken
        }, { fields: { _id: 1 } }).observeChanges({
          added: () => {
            foundMatchingUser = true;
          },
          removed: connection.close,
          // The onClose callback for the connection takes care of
          // cleaning up the observe handle and any other state we have
          // lying around.
        });

        // If the user ran another login or logout command we were waiting for the
        // defer or added to fire (ie, another call to _setLoginToken occurred),
        // then we let the later one win (start an observe, etc) and just stop our
        // observe now.
        //
        // Similarly, if the connection was already closed, then the onClose
        // callback would have called _removeTokenFromConnection and there won't
        // be an entry in _userObservesForConnections. We can stop the observe.
        if (this._userObservesForConnections[connection.id] !== myObserveNumber) {
          observe.stop();
          return;
        }

        this._userObservesForConnections[connection.id] = observe;

        if (! foundMatchingUser) {
          // We've set up an observe on the user associated with `newToken`,
          // so if the new token is removed from the database, we'll close
          // the connection. But the token might have already been deleted
          // before we set up the observe, which wouldn't have closed the
          // connection because the observe wasn't running yet.
          connection.close();
        }
      });
    }
  };

  // (Also used by Meteor Accounts server and tests).
  //
  _generateStampedLoginToken() {
    return {
      token: Random.secret(),
      when: new Date
    };
  };

  ///
  /// TOKEN EXPIRATION
  ///

  // Deletes expired password reset tokens from the database.
  //
  // Exported for tests. Also, the arguments are only used by
  // tests. oldestValidDate is simulate expiring tokens without waiting
  // for them to actually expire. userId is used by tests to only expire
  // tokens for the test user.
  _expirePasswordResetTokens(oldestValidDate, userId) {
    const tokenLifetimeMs = this._getPasswordResetTokenLifetimeMs();

    // when calling from a test with extra arguments, you must specify both!
    if ((oldestValidDate && !userId) || (!oldestValidDate && userId)) {
      throw new Error("Bad test. Must specify both oldestValidDate and userId.");
    }

    oldestValidDate = oldestValidDate ||
      (new Date(new Date() - tokenLifetimeMs));

    const tokenFilter = {
      $or: [
        { "services.password.reset.reason": "reset"},
        { "services.password.reset.reason": {$exists: false}}
      ]
    };

    expirePasswordToken(this, oldestValidDate, tokenFilter, userId);
  }

  // Deletes expired password enroll tokens from the database.
  //
  // Exported for tests. Also, the arguments are only used by
  // tests. oldestValidDate is simulate expiring tokens without waiting
  // for them to actually expire. userId is used by tests to only expire
  // tokens for the test user.
  _expirePasswordEnrollTokens(oldestValidDate, userId) {
    const tokenLifetimeMs = this._getPasswordEnrollTokenLifetimeMs();

    // when calling from a test with extra arguments, you must specify both!
    if ((oldestValidDate && !userId) || (!oldestValidDate && userId)) {
      throw new Error("Bad test. Must specify both oldestValidDate and userId.");
    }

    oldestValidDate = oldestValidDate ||
      (new Date(new Date() - tokenLifetimeMs));

    const tokenFilter = {
      "services.password.reset.reason": "enroll"
    };

    expirePasswordToken(this, oldestValidDate, tokenFilter, userId);
  }

  // Deletes expired tokens from the database and closes all open connections
  // associated with these tokens.
  //
  // Exported for tests. Also, the arguments are only used by
  // tests. oldestValidDate is simulate expiring tokens without waiting
  // for them to actually expire. userId is used by tests to only expire
  // tokens for the test user.
  _expireTokens(oldestValidDate, userId) {
    const tokenLifetimeMs = this._getTokenLifetimeMs();

    // when calling from a test with extra arguments, you must specify both!
    if ((oldestValidDate && !userId) || (!oldestValidDate && userId)) {
      throw new Error("Bad test. Must specify both oldestValidDate and userId.");
    }

    oldestValidDate = oldestValidDate ||
      (new Date(new Date() - tokenLifetimeMs));
    const userFilter = userId ? {_id: userId} : {};


    // Backwards compatible with older versions of meteor that stored login token
    // timestamps as numbers.
    this.users.update({ ...userFilter,
      $or: [
        { "services.resume.loginTokens.when": { $lt: oldestValidDate } },
        { "services.resume.loginTokens.when": { $lt: +oldestValidDate } }
      ]
    }, {
      $pull: {
        "services.resume.loginTokens": {
          $or: [
            { when: { $lt: oldestValidDate } },
            { when: { $lt: +oldestValidDate } }
          ]
        }
      }
    }, { multi: true });
    // The observe on Meteor.users will take care of closing connections for
    // expired tokens.
  };

  // @override from accounts_common.js
  config(options) {
    // Call the overridden implementation of the method.
    const superResult = AccountsCommon.prototype.config.apply(this, arguments);

    // If the user set loginExpirationInDays to null, then we need to clear the
    // timer that periodically expires tokens.
    if (hasOwn.call(this._options, 'loginExpirationInDays') &&
      this._options.loginExpirationInDays === null &&
      this.expireTokenInterval) {
      Meteor.clearInterval(this.expireTokenInterval);
      this.expireTokenInterval = null;
    }

    return superResult;
  };

  // Called by accounts-password
  insertUserDoc(options, user) {
    // - clone user document, to protect from modification
    // - add createdAt timestamp
    // - prepare an _id, so that you can modify other collections (eg
    // create a first task for every new user)
    //
    // XXX If the onCreateUser or validateNewUser hooks fail, we might
    // end up having modified some other collection
    // inappropriately. The solution is probably to have onCreateUser
    // accept two callbacks - one that gets called before inserting
    // the user document (in which you can modify its contents), and
    // one that gets called after (in which you should change other
    // collections)
    user = {
      createdAt: new Date(),
      _id: Random.id(),
      ...user,
    };

    if (user.services) {
      Object.keys(user.services).forEach(service =>
        pinEncryptedFieldsToUser(user.services[service], user._id)
      );
    }

    let fullUser;
    if (this._onCreateUserHook) {
      fullUser = this._onCreateUserHook(options, user);

      // This is *not* part of the API. We need this because we can't isolate
      // the global server environment between tests, meaning we can't test
      // both having a create user hook set and not having one set.
      if (fullUser === 'TEST DEFAULT HOOK')
        fullUser = defaultCreateUserHook(options, user);
    } else {
      fullUser = defaultCreateUserHook(options, user);
    }

    this._validateNewUserHooks.forEach(hook => {
      if (! hook(fullUser))
        throw new Meteor.Error(403, "User validation failed");
    });

    let userId;
    try {
      userId = this.users.insert(fullUser);
    } catch (e) {
      // XXX string parsing sucks, maybe
      // https://jira.mongodb.org/browse/SERVER-3069 will get fixed one day
      if (!e.errmsg) throw e;
      if (e.errmsg.includes('emails.address'))
        throw new Meteor.Error(403, "Email already exists.");
      if (e.errmsg.includes('username'))
        throw new Meteor.Error(403, "Username already exists.");
      throw e;
    }
    return userId;
  };

  // Helper function: returns false if email does not match company domain from
  // the configuration.
  _testEmailDomain(email) {
    const domain = this._options.restrictCreationByEmailDomain;

    return !domain ||
      (typeof domain === 'function' && domain(email)) ||
      (typeof domain === 'string' &&
        (new RegExp(`@${Meteor._escapeRegExp(domain)}$`, 'i')).test(email));
  };

  ///
  /// CLEAN UP FOR `logoutOtherClients`
  ///

  _deleteSavedTokensForUser(userId, tokensToDelete) {
    if (tokensToDelete) {
      this.users.update(userId, {
        $unset: {
          "services.resume.haveLoginTokensToDelete": 1,
          "services.resume.loginTokensToDelete": 1
        },
        $pullAll: {
          "services.resume.loginTokens": tokensToDelete
        }
      });
    }
  };

  _deleteSavedTokensForAllUsersOnStartup() {
    // If we find users who have saved tokens to delete on startup, delete
    // them now. It's possible that the server could have crashed and come
    // back up before new tokens are found in localStorage, but this
    // shouldn't happen very often. We shouldn't put a delay here because
    // that would give a lot of power to an attacker with a stolen login
    // token and the ability to crash the server.
    Meteor.startup(() => {
      this.users.find({
        "services.resume.haveLoginTokensToDelete": true
      }, {
        "services.resume.loginTokensToDelete": 1
      }).forEach(user => {
        this._deleteSavedTokensForUser(
          user._id,
          user.services.resume.loginTokensToDelete
        );
      });
    });
  };

  ///
  /// MANAGING USER OBJECTS
  ///

  // Updates or creates a user after we authenticate with a 3rd party.
  //
  // @param serviceName {String} Service name (eg, twitter).
  // @param serviceData {Object} Data to store in the user's record
  //        under services[serviceName]. Must include an "id" field
  //        which is a unique identifier for the user in the service.
  // @param options {Object, optional} Other options to pass to insertUserDoc
  //        (eg, profile)
  // @returns {Object} Object with token and id keys, like the result
  //        of the "login" method.
  //
  updateOrCreateUserFromExternalService(
    serviceName,
    serviceData,
    options
  ) {
    options = { ...options };

    if (serviceName === "password" || serviceName === "resume") {
      throw new Error(
        "Can't use updateOrCreateUserFromExternalService with internal service "
        + serviceName);
    }
    if (!hasOwn.call(serviceData, 'id')) {
      throw new Error(
        `Service data for service ${serviceName} must include id`);
    }

    // Look for a user with the appropriate service user id.
    const selector = {};
    const serviceIdKey = `services.${serviceName}.id`;

    // XXX Temporary special case for Twitter. (Issue #629)
    //   The serviceData.id will be a string representation of an integer.
    //   We want it to match either a stored string or int representation.
    //   This is to cater to earlier versions of Meteor storing twitter
    //   user IDs in number form, and recent versions storing them as strings.
    //   This can be removed once migration technology is in place, and twitter
    //   users stored with integer IDs have been migrated to string IDs.
    if (serviceName === "twitter" && !isNaN(serviceData.id)) {
      selector["$or"] = [{},{}];
      selector["$or"][0][serviceIdKey] = serviceData.id;
      selector["$or"][1][serviceIdKey] = parseInt(serviceData.id, 10);
    } else {
      selector[serviceIdKey] = serviceData.id;
    }

    let user = this.users.findOne(selector);

    // When creating a new user we pass through all options. When updating an
    // existing user, by default we only process/pass through the serviceData
    // (eg, so that we keep an unexpired access token and don't cache old email
    // addresses in serviceData.email). The onExternalLogin hook can be used when
    // creating or updating a user, to modify or pass through more options as
    // needed.
    let opts = user ? {} : options;
    if (this._onExternalLoginHook) {
      opts = this._onExternalLoginHook(options, user);
    }

    if (user) {
      pinEncryptedFieldsToUser(serviceData, user._id);

      let setAttrs = {};
      Object.keys(serviceData).forEach(key =>
        setAttrs[`services.${serviceName}.${key}`] = serviceData[key]
      );

      // XXX Maybe we should re-use the selector above and notice if the update
      //     touches nothing?
      setAttrs = { ...setAttrs, ...opts };
      this.users.update(user._id, {
        $set: setAttrs
      });

      return {
        type: serviceName,
        userId: user._id
      };
    } else {
      // Create a new user with the service data.
      user = {services: {}};
      user.services[serviceName] = serviceData;
      return {
        type: serviceName,
        userId: this.insertUserDoc(opts, user)
      };
    }
  };

  // Removes default rate limiting rule
  removeDefaultRateLimit() {
    const resp = DDPRateLimiter.removeRule(this.defaultRateLimiterRuleId);
    this.defaultRateLimiterRuleId = null;
    return resp;
  };

  // Add a default rule of limiting logins, creating new users and password reset
  // to 5 times every 10 seconds per connection.
  addDefaultRateLimit() {
    if (!this.defaultRateLimiterRuleId) {
      this.defaultRateLimiterRuleId = DDPRateLimiter.addRule({
        userId: null,
        clientAddress: null,
        type: 'method',
        name: name => ['login', 'createUser', 'resetPassword', 'forgotPassword']
          .includes(name),
        connectionId: (connectionId) => true,
      }, 5, 10000);
    }
  };

}

// Give each login hook callback a fresh cloned copy of the attempt
// object, but don't clone the connection.
//
const cloneAttemptWithConnection = (connection, attempt) => {
  const clonedAttempt = EJSON.clone(attempt);
  clonedAttempt.connection = connection;
  return clonedAttempt;
};

const tryLoginMethod = (type, fn) => {
  let result;
  try {
    result = fn();
  }
  catch (e) {
    result = {error: e};
  }

  if (result && !result.type && type)
    result.type = type;

  return result;
};

const setupDefaultLoginHandlers = accounts => {
  accounts.registerLoginHandler("resume", function (options) {
    return defaultResumeLoginHandler.call(this, accounts, options);
  });
};

// Login handler for resume tokens.
const defaultResumeLoginHandler = (accounts, options) => {
  if (!options.resume)
    return undefined;

  check(options.resume, String);

  const hashedToken = accounts._hashLoginToken(options.resume);

  // First look for just the new-style hashed login token, to avoid
  // sending the unhashed token to the database in a query if we don't
  // need to.
  let user = accounts.users.findOne(
    {"services.resume.loginTokens.hashedToken": hashedToken});

  if (! user) {
    // If we didn't find the hashed login token, try also looking for
    // the old-style unhashed token.  But we need to look for either
    // the old-style token OR the new-style token, because another
    // client connection logging in simultaneously might have already
    // converted the token.
    user = accounts.users.findOne({
      $or: [
        {"services.resume.loginTokens.hashedToken": hashedToken},
        {"services.resume.loginTokens.token": options.resume}
      ]
    });
  }

  if (! user)
    return {
      error: new Meteor.Error(403, "You've been logged out by the server. Please log in again.")
    };

  // Find the token, which will either be an object with fields
  // {hashedToken, when} for a hashed token or {token, when} for an
  // unhashed token.
  let oldUnhashedStyleToken;
  let token = user.services.resume.loginTokens.find(token =>
    token.hashedToken === hashedToken
  );
  if (token) {
    oldUnhashedStyleToken = false;
  } else {
    token = user.services.resume.loginTokens.find(token =>
      token.token === options.resume
    );
    oldUnhashedStyleToken = true;
  }

  const tokenExpires = accounts._tokenExpiration(token.when);
  if (new Date() >= tokenExpires)
    return {
      userId: user._id,
      error: new Meteor.Error(403, "Your session has expired. Please log in again.")
    };

  // Update to a hashed token when an unhashed token is encountered.
  if (oldUnhashedStyleToken) {
    // Only add the new hashed token if the old unhashed token still
    // exists (this avoids resurrecting the token if it was deleted
    // after we read it).  Using $addToSet avoids getting an index
    // error if another client logging in simultaneously has already
    // inserted the new hashed token.
    accounts.users.update(
      {
        _id: user._id,
        "services.resume.loginTokens.token": options.resume
      },
      {$addToSet: {
          "services.resume.loginTokens": {
            "hashedToken": hashedToken,
            "when": token.when
          }
        }}
    );

    // Remove the old token *after* adding the new, since otherwise
    // another client trying to login between our removing the old and
    // adding the new wouldn't find a token to login with.
    accounts.users.update(user._id, {
      $pull: {
        "services.resume.loginTokens": { "token": options.resume }
      }
    });
  }

  return {
    userId: user._id,
    stampedLoginToken: {
      token: options.resume,
      when: token.when
    }
  };
};

const expirePasswordToken = (
  accounts,
  oldestValidDate,
  tokenFilter,
  userId
) => {
  const userFilter = userId ? {_id: userId} : {};
  const resetRangeOr = {
    $or: [
      { "services.password.reset.when": { $lt: oldestValidDate } },
      { "services.password.reset.when": { $lt: +oldestValidDate } }
    ]
  };
  const expireFilter = { $and: [tokenFilter, resetRangeOr] };

  accounts.users.update({...userFilter, ...expireFilter}, {
    $unset: {
      "services.password.reset": ""
    }
  }, { multi: true });
};

const setExpireTokensInterval = accounts => {
  accounts.expireTokenInterval = Meteor.setInterval(() => {
    accounts._expireTokens();
    accounts._expirePasswordResetTokens();
    accounts._expirePasswordEnrollTokens();
  }, EXPIRE_TOKENS_INTERVAL_MS);
};

///
/// OAuth Encryption Support
///

const OAuthEncryption =
  Package["oauth-encryption"] &&
  Package["oauth-encryption"].OAuthEncryption;

const usingOAuthEncryption = () => {
  return OAuthEncryption && OAuthEncryption.keyIsLoaded();
};

// OAuth service data is temporarily stored in the pending credentials
// collection during the oauth authentication process.  Sensitive data
// such as access tokens are encrypted without the user id because
// we don't know the user id yet.  We re-encrypt these fields with the
// user id included when storing the service data permanently in
// the users collection.
//
const pinEncryptedFieldsToUser = (serviceData, userId) => {
  Object.keys(serviceData).forEach(key => {
    let value = serviceData[key];
    if (OAuthEncryption && OAuthEncryption.isSealed(value))
      value = OAuthEncryption.seal(OAuthEncryption.open(value), userId);
    serviceData[key] = value;
  });
};


// Encrypt unencrypted login service secrets when oauth-encryption is
// added.
//
// XXX For the oauthSecretKey to be available here at startup, the
// developer must call Accounts.config({oauthSecretKey: ...}) at load
// time, instead of in a Meteor.startup block, because the startup
// block in the app code will run after this accounts-base startup
// block.  Perhaps we need a post-startup callback?

Meteor.startup(() => {
  if (! usingOAuthEncryption()) {
    return;
  }

  const { ServiceConfiguration } = Package['service-configuration'];

  ServiceConfiguration.configurations.find({
    $and: [{
      secret: { $exists: true }
    }, {
      "secret.algorithm": { $exists: false }
    }]
  }).forEach(config => {
    ServiceConfiguration.configurations.update(config._id, {
      $set: {
        secret: OAuthEncryption.seal(config.secret)
      }
    });
  });
});

// XXX see comment on Accounts.createUser in passwords_server about adding a
// second "server options" argument.
const defaultCreateUserHook = (options, user) => {
  if (options.profile)
    user.profile = options.profile;
  return user;
};

// Validate new user's email or Google/Facebook/GitHub account's email
function defaultValidateNewUserHook(user) {
  const domain = this._options.restrictCreationByEmailDomain;
  if (!domain) {
    return true;
  }

  let emailIsGood = false;
  if (user.emails && user.emails.length > 0) {
    emailIsGood = user.emails.reduce(
      (prev, email) => prev || this._testEmailDomain(email.address), false
    );
  } else if (user.services && user.services.length > 0) {
    // Find any email of any service and check it
    emailIsGood = user.services.reduce(
      (prev, service) => service.email && this._testEmailDomain(service.email),
      false,
    );
  }

  if (emailIsGood) {
    return true;
  }

  if (typeof domain === 'string') {
    throw new Meteor.Error(403, `@${domain} email required`);
  } else {
    throw new Meteor.Error(403, "Email doesn't match the criteria.");
  }
}

const setupUsersCollection = users => {
  ///
  /// RESTRICTING WRITES TO USER OBJECTS
  ///
  users.allow({
    // clients can modify the profile field of their own document, and
    // nothing else.
    update: (userId, user, fields, modifier) => {
      // make sure it is our record
      if (user._id !== userId) {
        return false;
      }

      // user can only modify the 'profile' field. sets to multiple
      // sub-keys (eg profile.foo and profile.bar) are merged into entry
      // in the fields list.
      if (fields.length !== 1 || fields[0] !== 'profile') {
        return false;
      }

      return true;
    },
    fetch: ['_id'] // we only look at _id.
  });

  /// DEFAULT INDEXES ON USERS
  users._ensureIndex('username', {unique: 1, sparse: 1});
  users._ensureIndex('emails.address', {unique: 1, sparse: 1});
  users._ensureIndex('services.resume.loginTokens.hashedToken',
    {unique: 1, sparse: 1});
  users._ensureIndex('services.resume.loginTokens.token',
    {unique: 1, sparse: 1});
  // For taking care of logoutOtherClients calls that crashed before the
  // tokens were deleted.
  users._ensureIndex('services.resume.haveLoginTokensToDelete',
    { sparse: 1 });
  // For expiring login tokens
  users._ensureIndex("services.resume.loginTokens.when", { sparse: 1 });
  // For expiring password tokens
  users._ensureIndex('services.password.reset.when', { sparse: 1 });
};
