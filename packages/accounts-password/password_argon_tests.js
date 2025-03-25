if (Meteor.isServer) {
    Tinytest.addAsync("passwords Argon - migration from bcrypt encryption to argon2", async (test) => {
        Accounts._options.argon2Enabled = false;
        const username = Random.id();
        const email = `${username}@bcrypt.com`;
        const password = "password";
        const userId = await Accounts.createUser(
            {
                username: username,
                email: email,
                password: password
            }
        );
        Accounts._options.argon2Enabled = true;
        let user = await Meteor.users.findOneAsync(userId);
        const isValid = await Accounts._checkPasswordAsync(user, password);
        test.equal(isValid.userId, userId, "checkPassword with bcrypt - User ID should be returned");
        test.equal(typeof isValid.error, "undefined", "checkPassword with bcrypt - No error should be returned");

        // wait for the migration to happen
        await waitUntil(
          async () => {
            user = await Meteor.users.findOneAsync(userId);
            return (
              typeof user.services.password.bcrypt === "undefined" &&
              typeof user.services.password.argon2 === "string"
            );
          },
          { description: "bcrypt should be unset and argon2 should be set" }
        );

        // password is still valid using argon2
        const isValidArgon = await Accounts._checkPasswordAsync(user, password);
        test.equal(isValidArgon.userId, userId, "checkPassword with argon2 - User ID should be returned");
        test.equal(typeof isValidArgon.error, "undefined", "checkPassword with argon2 - No error should be returned");

        // cleanup
        Accounts._options.argon2Enabled = false;
        await Meteor.users.removeAsync(userId);
    });


    Tinytest.addAsync("passwords Argon - setPassword", async (test) => {
        Accounts._options.argon2Enabled = true;
        const username = Random.id();
        const email = `${username}-intercept@example.com`;

        const userId = await Accounts.createUser({ username: username, email: email });

        let user = await Meteor.users.findOneAsync(userId);
        // no services yet.
        test.equal(user.services.password, undefined);

        // set a new password.
        await Accounts.setPasswordAsync(userId, "new password");
        user = await Meteor.users.findOneAsync(userId);
        const oldSaltedHash = user.services.password.argon2;
        test.isTrue(oldSaltedHash);
        // Send a reset password email (setting a reset token) and insert a login
        // token.
        await Accounts.sendResetPasswordEmail(userId, email);
        await Accounts._insertLoginToken(userId, Accounts._generateStampedLoginToken());
        const user2 = await Meteor.users.findOneAsync(userId);
        test.isTrue(user2.services.password.reset);
        test.isTrue(user2.services.resume.loginTokens);

        // reset with the same password, see we get a different salted hash
        await Accounts.setPasswordAsync(userId, "new password", { logout: false });
        user = await Meteor.users.findOneAsync(userId);
        const newSaltedHash = user.services.password.argon2;
        test.isTrue(newSaltedHash);
        test.notEqual(oldSaltedHash, newSaltedHash);
        // No more reset token.
        const user3 = await Meteor.users.findOneAsync(userId);
        test.isFalse(user3.services.password.reset);
        // But loginTokens are still here since we did logout: false.
        test.isTrue(user3.services.resume.loginTokens);

        // reset again, see that the login tokens are gone.
        await Accounts.setPasswordAsync(userId, "new password");
        user = await Meteor.users.findOneAsync(userId);
        const newerSaltedHash = user.services.password.argon2;
        test.isTrue(newerSaltedHash);
        test.notEqual(oldSaltedHash, newerSaltedHash);
        test.notEqual(newSaltedHash, newerSaltedHash);
        // No more tokens.
        const user4 = await Meteor.users.findOneAsync(userId);
        test.isFalse(user4.services.password.reset);
        test.isFalse(user4.services.resume.loginTokens);

        // cleanup
        Accounts._options.argon2Enabled = false;
        await Meteor.users.removeAsync(userId);
    });

    Tinytest.addAsync("passwords Argon - migration from argon2 encryption to bcrypt", async (test) => {
        Accounts._options.argon2Enabled = true;
        const username = Random.id();
        const email = `${username}@bcrypt.com`;
        const password = "password";
        const userId = await Accounts.createUser(
            {
                username: username,
                email: email,
                password: password
            }
        );
        Accounts._options.argon2Enabled = false;
        let user = await Meteor.users.findOneAsync(userId);
        const isValidArgon = await Accounts._checkPasswordAsync(user, password);
        test.equal(isValidArgon.userId, userId, "checkPassword with argon2 - User ID should be returned");
        test.equal(typeof isValidArgon.error, "undefined", "checkPassword with argon2 - No error should be returned");

        // wait for the migration to happen
        await waitUntil(
          async () => {
              user = await Meteor.users.findOneAsync(userId);
              return (
                typeof user.services.password.bcrypt === "string" &&
                typeof user.services.password.argon2 === "undefined"
              );
          },
          { description: "bcrypt should be string and argon2 should be undefined" }
        );

        // password is still valid using bcrypt
        const isValidBcrypt = await Accounts._checkPasswordAsync(user, password);
        test.equal(isValidBcrypt.userId, userId, "checkPassword with argon2 - User ID should be returned");
        test.equal(typeof isValidBcrypt.error, "undefined", "checkPassword with argon2 - No error should be returned");

        // cleanup
        await Meteor.users.removeAsync(userId);
    });

    const getUserHashArgon2Params = function (user) {
        const hash = user?.services?.password?.argon2;
        return Accounts._getArgon2Params(hash);
    }
    const hashPasswordWithSha = function (password) {
        return {
            digest: SHA256(password),
            algorithm: "sha-256"
        };
    }

    testAsyncMulti("passwords Argon - allow custom argon2 Params and ensure migration if changed", [
        async function(test) {
            Accounts._options.argon2Enabled = true;
            // Verify that a argon2 hash generated for a new account uses the
            // default params.
            let username = Random.id();
            this.password = hashPasswordWithSha("abc123");
            this.userId1 = await Accounts.createUserAsync({ username, password: this.password });
            this.user1 = await Meteor.users.findOneAsync(this.userId1);
            let argon2Params = getUserHashArgon2Params(this.user1);
            test.equal(argon2Params.type, Accounts._argon2Type());
            test.equal(argon2Params.memoryCost, Accounts._argon2MemoryCost());
            test.equal(argon2Params.timeCost, Accounts._argon2TimeCost());
            test.equal(argon2Params.parallelism, Accounts._argon2Parallelism());


            // When a custom number of argon2 TimeCost is set via Accounts.config,
            // and an account was already created using the default number of TimeCost,
            // make sure that a new hash is created (and stored) using the new number
            // of TimeCost, the next time the password is checked.
            this.customType = "argon2d"; // argon2.argon2d = 2
            this.customTimeCost = 4;
            this.customMemoryCost = 32768;
            this.customParallelism = 1;
            Accounts._options.argon2Type = this.customType;
            Accounts._options.argon2TimeCost = this.customTimeCost;
            Accounts._options.argon2MemoryCost = this.customMemoryCost;
            Accounts._options.argon2Parallelism = this.customParallelism;

            await Accounts._checkPasswordAsync(this.user1, this.password);
        },
        async function(test) {
            const defaultType = Accounts._argon2Type();
            const defaultTimeCost = Accounts._argon2TimeCost();
            const defaultMemoryCost = Accounts._argon2MemoryCost();
            const defaultParallelism = Accounts._argon2Parallelism();
            let params;
            let username;

            let resolve;
            const promise = new Promise(res => resolve = res);

            Meteor.setTimeout(async () => {
                this.user1 = await Meteor.users.findOneAsync(this.userId1);
                params = getUserHashArgon2Params(this.user1);
                test.equal(params.type, 2);
                test.equal(params.timeCost, this.customTimeCost);
                test.equal(params.memoryCost, this.customMemoryCost);
                test.equal(params.parallelism, this.customParallelism);

                // When a custom number of argon2 TimeCost is set, make sure it's
                // used for new argon2 password hashes.
                username = Random.id();
                const userId2 = await Accounts.createUser({ username, password: this.password });
                const user2 = await Meteor.users.findOneAsync(userId2);
                params = getUserHashArgon2Params(user2);
                test.equal(params.type, 2);
                test.equal(params.timeCost, this.customTimeCost);
                test.equal(params.memoryCost, this.customMemoryCost);
                test.equal(params.parallelism, this.customParallelism);

                // Cleanup
                Accounts._options.argon2Enabled = false;
                Accounts._options.argon2Type = defaultType;
                Accounts._options.argon2TimeCost = defaultTimeCost;
                Accounts._options.argon2MemoryCost = defaultMemoryCost;
                Accounts._options.argon2Parallelism = defaultParallelism;
                await Meteor.users.removeAsync(this.userId1);
                await Meteor.users.removeAsync(userId2);
                resolve();
            }, 1000);

            return promise;
        }
    ]);
}
