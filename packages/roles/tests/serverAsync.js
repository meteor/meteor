import { Meteor } from "meteor/meteor";
import { Tinytest } from "meteor/tinytest";

// To ensure that the files are loaded for coverage
import "../roles_common_async";

// Publication for the client tests
Meteor.publish("client_assignments", async () => {
  return Meteor.roleAssignment.find();
});

// To allow inserting on the client, needed for testing.
Meteor.roleAssignment.allow({
  insert() {
    return true;
  },
  insertAsync() {
    return true;
  },
  update() {
    return true;
  },
  updateAsync() {
    return true;
  },
  remove() {
    return true;
  },
  removeAsync() {
    return true;
  },
});

const hasAnyKeys = (test, obj, keys) => {
  if (typeof keys === "string") {
    keys = [keys];
  }
  const hasKey = keys.some((key) =>
    Object.prototype.hasOwnProperty.call(obj, key)
  );
  test.equal(
    hasKey,
    true,
    `Object should have at least one of these keys: ${keys.join(", ")}`
  );
};

const sameMembers = (test, value, expected) => {
  // Sort arrays to ensure consistent order
  const sortedValue = [...value].sort();
  const sortedExpected = [...expected].sort();

  test.equal(
    JSON.stringify(sortedValue),
    JSON.stringify(sortedExpected),
    "Arrays should have the same members"
  );
};

// Helper to sort object keys recursively
const sortObjectKeys = (obj) => {
  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeys);
  }
  if (obj && typeof obj === "object") {
    return Object.keys(obj)
      .sort()
      .reduce((sorted, key) => {
        sorted[key] = sortObjectKeys(obj[key]);
        return sorted;
      }, {});
  }
  return obj;
};

const sameDeepMembers = (test, value, expected) => {
  const sortedValue = sortObjectKeys(value);
  const sortedExpected = sortObjectKeys(expected);

  test.equal(
    JSON.stringify(sortedValue),
    JSON.stringify(sortedExpected),
    "Role assignments should match expected structure"
  );
};

const sameDeepUnorderedMembers = (test, value, expected) => {
  const sortAndStringify = (arr) => {
    return JSON.stringify(arr.map(item => JSON.stringify(sortObjectKeys(item))).sort());
  };
  const sortedValue = sortAndStringify(value);
  const sortedExpected = sortAndStringify(expected);

  test.equal(sortedValue, sortedExpected, 'Arrays should have the same elements, regardless of order');
};

const hasProp = (target, prop) => Object.hasOwnProperty.call(target, prop);

let users = {};
const roles = ["admin", "editor", "user"];

Meteor.publish("_roleAssignments", function () {
  const loggedInUserId = this.userId;
  if (!loggedInUserId) {
    this.ready();
    return;
  }
  return Meteor.roleAssignment.find({ _id: loggedInUserId });
});

async function addUser(name) {
  return await Meteor.users.insertAsync({ username: name });
}

async function testUser(test, username, expectedRoles, scope) {
  const userId = users[username];
  const userObj = await Meteor.users.findOneAsync({ _id: userId });

  // check using user ids (makes db calls)
  await _innerTest(test, userId, username, expectedRoles, scope);

  // check using passed-in user object
  await _innerTest(test, userObj, username, expectedRoles, scope);
}

async function _innerTest(test, userParam, username, expectedRoles, scope) {
  // test that user has only the roles expected and no others
  for (const role of roles) {
    const expected = expectedRoles.includes(role);
    const msg = username + " expected to have '" + role + "' role but does not";
    const nmsg = username + " had the following un-expected role: " + role;

    const result = await Roles.userIsInRoleAsync(userParam, role, scope);
    if (expected) {
      test.equal(result, true, msg);
    } else {
      test.equal(result, false, nmsg);
    }
  }
}

async function clearData() {
  await Meteor.roles.removeAsync({});
  await Meteor.roleAssignment.removeAsync({});
  await Meteor.users.removeAsync({});

  users = {
    eve: await addUser("eve"),
    bob: await addUser("bob"),
    joe: await addUser("joe"),
  };
}

Tinytest.addAsync("roles -can create and delete roles", async function (test) {
  await clearData();
  const role1Id = await Roles.createRoleAsync("test1");
  const test1a = await Meteor.roles.findOneAsync();
  const test1b = await Meteor.roles.findOneAsync(role1Id);
  test.equal(test1a._id, "test1");
  test.equal(test1b._id, "test1");

  const role2Id = await Roles.createRoleAsync("test2");
  const test2a = await Meteor.roles.findOneAsync({ _id: "test2" });
  const test2b = await Meteor.roles.findOneAsync(role2Id);
  test.equal(test2a._id, "test2");
  test.equal(test2b._id, "test2");

  test.equal(await Meteor.roles.countDocuments(), 2);

  await Roles.deleteRoleAsync("test1");
  const undefinedTest = await Meteor.roles.findOneAsync({ _id: "test1" });
  test.equal(typeof undefinedTest, "undefined");

  await Roles.deleteRoleAsync("test2");
  const undefinedTest2 = await Meteor.roles.findOneAsync();
  test.equal(typeof undefinedTest2, "undefined");
});

Tinytest.addAsync(
  "roles -can try to remove non-existing roles without crashing",
  async function (test) {
    await clearData();
    try {
      await Roles.deleteRoleAsync("non-existing-role");
    } catch (e) {
      test.notExists(e);
    }
    // Roles.deleteRoleAsync('non-existing-role').should.be.fulfilled
  }
);

Tinytest.addAsync("roles -can't create duplicate roles", async function (test) {
  await clearData();
  try {
    await Roles.createRoleAsync("test1");
  } catch (e) {
    test.notExists(e);
  }
  try {
    await Roles.createRoleAsync("test1");
  } catch (e) {
    test.exists(e);
  }
  test.isNull(await Roles.createRoleAsync("test1", { unlessExists: true }));
});

Tinytest.addAsync(
  "roles - can't create role with empty names",
  async (test) => {
    await clearData();

    try {
      await Roles.createRoleAsync("");
      test.fail("Should throw error for empty name");
    } catch (e) {
      test.matches(e.message, /Invalid role name/);
    }

    try {
      await Roles.createRoleAsync(null);
      test.fail("Should throw error for null name");
    } catch (e) {
      test.matches(e.message, /Invalid role name/);
    }

    try {
      await Roles.createRoleAsync(" ");
      test.fail("Should throw error for space name");
    } catch (e) {
      test.matches(e.message, /Invalid role name/);
    }

    try {
      await Roles.createRoleAsync(" foobar");
      test.fail("Should throw error for leading space");
    } catch (e) {
      test.matches(e.message, /Invalid role name/);
    }

    try {
      await Roles.createRoleAsync(" foobar ");
      test.fail("Should throw error for trailing space");
    } catch (e) {
      test.matches(e.message, /Invalid role name/);
    }
  }
);

Tinytest.addAsync("roles - can't use invalid scope names", async (test) => {
  await clearData();
  await Roles.createRoleAsync("admin");
  await Roles.createRoleAsync("user");
  await Roles.createRoleAsync("editor");
  await Roles.addUsersToRolesAsync(users.eve, ["admin", "user"], "scope1");
  await Roles.addUsersToRolesAsync(users.eve, ["editor"], "scope2");

  try {
    await Roles.addUsersToRolesAsync(users.eve, ["admin", "user"], "");
    test.fail("Should throw error for empty scope");
  } catch (e) {
    test.matches(e.message, /Invalid scope name/);
  }

  try {
    await Roles.addUsersToRolesAsync(users.eve, ["admin", "user"], " ");
    test.fail("Should throw error for space scope");
  } catch (e) {
    test.matches(e.message, /Invalid scope name/);
  }

  try {
    await Roles.addUsersToRolesAsync(users.eve, ["admin", "user"], " foobar");
    test.fail("Should throw error for leading space in scope");
  } catch (e) {
    test.matches(e.message, /Invalid scope name/);
  }
});

Tinytest.addAsync("roles -can check if user is in role", async function (test) {
  await clearData();
  await Roles.createRoleAsync("admin");
  await Roles.createRoleAsync("user");
  await Roles.addUsersToRolesAsync(users.eve, ["admin", "user"]);

  await testUser(test, "eve", ["admin", "user"]);
});

Tinytest.addAsync(
  "roles -can check if user is in role by scope",
  async function (test) {
    await clearData();
    await Roles.createRoleAsync("admin");
    await Roles.createRoleAsync("user");
    await Roles.createRoleAsync("editor");
    await Roles.addUsersToRolesAsync(users.eve, ["admin", "user"], "scope1");
    await Roles.addUsersToRolesAsync(users.eve, ["editor"], "scope2");

    await testUser(test, "eve", ["admin", "user"], "scope1");
    await testUser(test, "eve", ["editor"], "scope2");

    test.isFalse(
      await Roles.userIsInRoleAsync(users.eve, ["admin", "user"], "scope2")
    );
    test.isFalse(
      await Roles.userIsInRoleAsync(users.eve, ["editor"], "scope1")
    );

    test.isTrue(
      await Roles.userIsInRoleAsync(users.eve, ["admin", "user"], {
        anyScope: true,
      })
    );
    test.isTrue(
      await Roles.userIsInRoleAsync(users.eve, ["editor"], { anyScope: true })
    );
  }
);

Tinytest.addAsync(
  "roles -can check if user is in role by scope through options",
  async function (test) {
    await clearData();
    await Roles.createRoleAsync("admin");
    await Roles.createRoleAsync("user");
    await Roles.createRoleAsync("editor");
    await Roles.addUsersToRolesAsync(users.eve, ["admin", "user"], {
      scope: "scope1",
    });
    await Roles.addUsersToRolesAsync(users.eve, ["editor"], {
      scope: "scope2",
    });

    await testUser(test, "eve", ["admin", "user"], { scope: "scope1" });
    await testUser(test, "eve", ["editor"], { scope: "scope2" });
  }
);

Tinytest.addAsync(
  "roles -can check if user is in role by scope with global role",
  async function (test) {
    await clearData();
    await Roles.createRoleAsync("admin");
    await Roles.createRoleAsync("user");
    await Roles.createRoleAsync("editor");
    await Roles.addUsersToRolesAsync(users.eve, ["admin", "user"], "scope1");
    await Roles.addUsersToRolesAsync(users.eve, ["editor"], "scope2");
    await Roles.addUsersToRolesAsync(users.eve, ["admin"]);

    test.isTrue(await Roles.userIsInRoleAsync(users.eve, ["user"], "scope1"));
    test.isTrue(await Roles.userIsInRoleAsync(users.eve, ["editor"], "scope2"));

    test.isFalse(await Roles.userIsInRoleAsync(users.eve, ["user"]));
    test.isFalse(await Roles.userIsInRoleAsync(users.eve, ["editor"]));
    test.isFalse(await Roles.userIsInRoleAsync(users.eve, ["user"], null));
    test.isFalse(await Roles.userIsInRoleAsync(users.eve, ["editor"], null));

    test.isFalse(await Roles.userIsInRoleAsync(users.eve, ["user"], "scope2"));
    test.isFalse(
      await Roles.userIsInRoleAsync(users.eve, ["editor"], "scope1")
    );

    test.isTrue(await Roles.userIsInRoleAsync(users.eve, ["admin"], "scope2"));
    test.isTrue(await Roles.userIsInRoleAsync(users.eve, ["admin"], "scope1"));
    test.isTrue(await Roles.userIsInRoleAsync(users.eve, ["admin"]));
    test.isTrue(await Roles.userIsInRoleAsync(users.eve, ["admin"], null));
  }
);

Tinytest.addAsync("roles -renaming scopes", async function (test) {
  await clearData();
  await Roles.createRoleAsync("admin");
  await Roles.createRoleAsync("user");
  await Roles.createRoleAsync("editor");
  await Roles.addUsersToRolesAsync(users.eve, ["admin", "user"], "scope1");
  await Roles.addUsersToRolesAsync(users.eve, ["editor"], "scope2");

  await testUser(test, "eve", ["admin", "user"], "scope1");
  await testUser(test, "eve", ["editor"], "scope2");

  await Roles.renameScopeAsync("scope1", "scope3");

  await testUser(test, "eve", ["admin", "user"], "scope3");
  await testUser(test, "eve", ["editor"], "scope2");

  test.isFalse(
    await Roles.userIsInRoleAsync(users.eve, ["admin", "user"], "scope1")
  );
  test.isFalse(
    await Roles.userIsInRoleAsync(users.eve, ["admin", "user"], "scope2")
  );

  try {
    await Roles.renameScopeAsync("scope3");
    test.fail("Should throw error for invalid scope name");
  } catch (e) {
    test.matches(e.message, /Invalid scope name/);
  }

  await Roles.renameScopeAsync("scope3", null);

  await testUser(test, "eve", ["admin", "user", "editor"], "scope2");

  test.isFalse(await Roles.userIsInRoleAsync(users.eve, ["editor"]));
  test.isTrue(await Roles.userIsInRoleAsync(users.eve, ["admin"]));
  test.isTrue(await Roles.userIsInRoleAsync(users.eve, ["user"]));
  test.isFalse(await Roles.userIsInRoleAsync(users.eve, ["editor"], null));
  test.isTrue(await Roles.userIsInRoleAsync(users.eve, ["admin"], null));
  test.isTrue(await Roles.userIsInRoleAsync(users.eve, ["user"], null));

  await Roles.renameScopeAsync(null, "scope2");

  await testUser(test, "eve", ["admin", "user", "editor"], "scope2");

  test.isFalse(await Roles.userIsInRoleAsync(users.eve, ["editor"]));
  test.isFalse(await Roles.userIsInRoleAsync(users.eve, ["admin"]));
  test.isFalse(await Roles.userIsInRoleAsync(users.eve, ["user"]));
  test.isFalse(await Roles.userIsInRoleAsync(users.eve, ["editor"], null));
  test.isFalse(await Roles.userIsInRoleAsync(users.eve, ["admin"], null));
  test.isFalse(await Roles.userIsInRoleAsync(users.eve, ["user"], null));
});

Tinytest.addAsync("roles -removing scopes", async function (test) {
  await clearData();
  await Roles.createRoleAsync("admin");
  await Roles.createRoleAsync("user");
  await Roles.createRoleAsync("editor");
  await Roles.addUsersToRolesAsync(users.eve, ["admin", "user"], "scope1");
  await Roles.addUsersToRolesAsync(users.eve, ["editor"], "scope2");

  await testUser(test, "eve", ["admin", "user"], "scope1");
  await testUser(test, "eve", ["editor"], "scope2");

  await Roles.removeScopeAsync("scope1");

  await testUser(test, "eve", ["editor"], "scope2");

  test.isFalse(
    await Roles.userIsInRoleAsync(users.eve, ["admin", "user"], "scope1")
  );
  test.isFalse(
    await Roles.userIsInRoleAsync(users.eve, ["admin", "user"], "scope2")
  );
});

Tinytest.addAsync(
  "roles -can check if non-existant user is in role",
  async function (test) {
    await clearData();
    test.isFalse(await Roles.userIsInRoleAsync("1", "admin"));
  }
);

Tinytest.addAsync(
  "roles -can check if null user is in role",
  async function (test) {
    await clearData();
    test.isFalse(await Roles.userIsInRoleAsync(null, "admin"));
  }
);

Tinytest.addAsync(
  "roles -can check user against several roles at once",
  async function (test) {
    await clearData();
    await Roles.createRoleAsync("admin");
    await Roles.createRoleAsync("user");

    await Roles.addUsersToRolesAsync(users.eve, ["admin", "user"]);
    const user = await Meteor.users.findOneAsync({ _id: users.eve });

    // we can check the non-existing role
    test.isTrue(await Roles.userIsInRoleAsync(user, ["editor", "admin"]));
  }
);

Tinytest.addAsync(
  "roles -can't add non-existent user to role",
  async function (test) {
    await clearData();
    await Roles.createRoleAsync("admin");

    await Roles.addUsersToRolesAsync(["1"], ["admin"]);
    test.equal(await Meteor.users.findOneAsync({ _id: "1" }), undefined);
  }
);

Tinytest.addAsync(
  "roles -can't add user to non-existent role",
  async function (test) {
    await clearData();
    try {
      await Roles.addUsersToRolesAsync(users.eve, ["admin"]);
      test.fail("Role shouldn't exist");
    } catch (e) {
      test.matches(e.message, /Role 'admin' does not exist/);
    }
    await Roles.addUsersToRolesAsync(users.eve, ["admin"], { ifExists: true });
  }
);

Tinytest.addAsync(
  "roles -can't set non-existent user to role",
  async function (test) {
    await clearData();
    await Roles.createRoleAsync("admin");

    await Roles.setUserRolesAsync(["1"], ["admin"]);
    test.equal(await Meteor.users.findOneAsync({ _id: "1" }), undefined);
  }
);

Tinytest.addAsync(
  "roles -can't set user to non-existent role",
  async function (test) {
    await clearData();
    try {
      await Roles.addUsersToRolesAsync(users.eve, ["admin"]);
      test.fail("Role shouldn't exist");
    } catch (e) {
      test.matches(e.message, /Role 'admin' does not exist/);
    }
    await Roles.setUserRolesAsync(users.eve, ["admin"], { ifExists: true });
  }
);

Tinytest.addAsync(
  "roles -can add individual users to roles",
  async function (test) {
    await clearData();
    await Roles.createRoleAsync("admin");
    await Roles.createRoleAsync("user");
    await Roles.createRoleAsync("editor");

    await Roles.addUsersToRolesAsync(users.eve, ["admin", "user"]);

    await testUser(test, "eve", ["admin", "user"]);
    await testUser(test, "bob", []);
    await testUser(test, "joe", []);

    await Roles.addUsersToRolesAsync(users.joe, ["editor", "user"]);

    await testUser(test, "eve", ["admin", "user"]);
    await testUser(test, "bob", []);
    await testUser(test, "joe", ["editor", "user"]);
  }
);

Tinytest.addAsync(
  "roles -can add individual users to roles by scope",
  async function (test) {
    await clearData();
    await Roles.createRoleAsync("admin");
    await Roles.createRoleAsync("user");
    await Roles.createRoleAsync("editor");

    await Roles.addUsersToRolesAsync(users.eve, ["admin", "user"], "scope1");

    await testUser(test, "eve", ["admin", "user"], "scope1");
    await testUser(test, "bob", [], "scope1");
    await testUser(test, "joe", [], "scope1");

    await testUser(test, "eve", [], "scope2");
    await testUser(test, "bob", [], "scope2");
    await testUser(test, "joe", [], "scope2");

    await Roles.addUsersToRolesAsync(users.joe, ["editor", "user"], "scope1");
    await Roles.addUsersToRolesAsync(users.bob, ["editor", "user"], "scope2");

    await testUser(test, "eve", ["admin", "user"], "scope1");
    await testUser(test, "bob", [], "scope1");
    await testUser(test, "joe", ["editor", "user"], "scope1");

    await testUser(test, "eve", [], "scope2");
    await testUser(test, "bob", ["editor", "user"], "scope2");
    await testUser(test, "joe", [], "scope2");
  }
);

Tinytest.addAsync(
  "roles -can add user to roles via user object",
  async function (test) {
    await clearData();
    await Roles.createRoleAsync("admin");
    await Roles.createRoleAsync("user");
    await Roles.createRoleAsync("editor");

    const eve = await Meteor.users.findOneAsync({ _id: users.eve });
    const bob = await Meteor.users.findOneAsync({ _id: users.bob });

    await Roles.addUsersToRolesAsync(eve, ["admin", "user"]);

    await testUser(test, "eve", ["admin", "user"]);
    await testUser(test, "bob", []);
    await testUser(test, "joe", []);

    await Roles.addUsersToRolesAsync(bob, ["editor"]);

    await testUser(test, "eve", ["admin", "user"]);
    await testUser(test, "bob", ["editor"]);
    await testUser(test, "joe", []);
  }
);

Tinytest.addAsync(
  "roles -can add user to roles multiple times",
  async function (test) {
    await clearData();
    await Roles.createRoleAsync("admin");
    await Roles.createRoleAsync("user");
    await Roles.createRoleAsync("editor");

    await Roles.addUsersToRolesAsync(users.eve, ["admin", "user"]);
    await Roles.addUsersToRolesAsync(users.eve, ["admin", "user"]);

    await testUser(test, "eve", ["admin", "user"]);
    await testUser(test, "bob", []);
    await testUser(test, "joe", []);

    await Roles.addUsersToRolesAsync(users.bob, ["admin"]);
    await Roles.addUsersToRolesAsync(users.bob, ["editor"]);

    await testUser(test, "eve", ["admin", "user"]);
    await testUser(test, "bob", ["admin", "editor"]);
    await testUser(test, "joe", []);
  }
);

Tinytest.addAsync(
  "roles -can add user to roles multiple times by scope",
  async function (test) {
    await clearData();
    await Roles.createRoleAsync("admin");
    await Roles.createRoleAsync("user");
    await Roles.createRoleAsync("editor");

    await Roles.addUsersToRolesAsync(users.eve, ["admin", "user"], "scope1");
    await Roles.addUsersToRolesAsync(users.eve, ["admin", "user"], "scope1");

    await testUser(test, "eve", ["admin", "user"], "scope1");
    await testUser(test, "bob", [], "scope1");
    await testUser(test, "joe", [], "scope1");

    await Roles.addUsersToRolesAsync(users.bob, ["admin"], "scope1");
    await Roles.addUsersToRolesAsync(users.bob, ["editor"], "scope1");

    await testUser(test, "eve", ["admin", "user"], "scope1");
    await testUser(test, "bob", ["admin", "editor"], "scope1");
    await testUser(test, "joe", [], "scope1");
  }
);

Tinytest.addAsync(
  "roles -can add multiple users to roles",
  async function (test) {
    await clearData();
    await Roles.createRoleAsync("admin");
    await Roles.createRoleAsync("user");
    await Roles.createRoleAsync("editor");

    await Roles.addUsersToRolesAsync([users.eve, users.bob], ["admin", "user"]);

    await testUser(test, "eve", ["admin", "user"]);
    await testUser(test, "bob", ["admin", "user"]);
    await testUser(test, "joe", []);

    await Roles.addUsersToRolesAsync(
      [users.bob, users.joe],
      ["editor", "user"]
    );

    await testUser(test, "eve", ["admin", "user"]);
    await testUser(test, "bob", ["admin", "editor", "user"]);
    await testUser(test, "joe", ["editor", "user"]);
  }
);

Tinytest.addAsync(
  "roles -can add multiple users to roles by scope",
  async function (test) {
    await clearData();
    await Roles.createRoleAsync("admin");
    await Roles.createRoleAsync("user");
    await Roles.createRoleAsync("editor");

    await Roles.addUsersToRolesAsync(
      [users.eve, users.bob],
      ["admin", "user"],
      "scope1"
    );

    await testUser(test, "eve", ["admin", "user"], "scope1");
    await testUser(test, "bob", ["admin", "user"], "scope1");
    await testUser(test, "joe", [], "scope1");

    await testUser(test, "eve", [], "scope2");
    await testUser(test, "bob", [], "scope2");
    await testUser(test, "joe", [], "scope2");

    await Roles.addUsersToRolesAsync(
      [users.bob, users.joe],
      ["editor", "user"],
      "scope1"
    );
    await Roles.addUsersToRolesAsync(
      [users.bob, users.joe],
      ["editor", "user"],
      "scope2"
    );

    await testUser(test, "eve", ["admin", "user"], "scope1");
    await testUser(test, "bob", ["admin", "editor", "user"], "scope1");
    await testUser(test, "joe", ["editor", "user"], "scope1");

    await testUser(test, "eve", [], "scope2");
    await testUser(test, "bob", ["editor", "user"], "scope2");
    await testUser(test, "joe", ["editor", "user"], "scope2");
  }
);

Tinytest.addAsync(
  "roles -can remove individual users from roles",
  async function (test) {
    await clearData();
    await Roles.createRoleAsync("user");
    await Roles.createRoleAsync("editor");

    // remove user role - one user
    await Roles.addUsersToRolesAsync(
      [users.eve, users.bob],
      ["editor", "user"]
    );
    await testUser(test, "eve", ["editor", "user"]);
    await testUser(test, "bob", ["editor", "user"]);
    await Roles.removeUsersFromRolesAsync(users.eve, ["user"]);
    await testUser(test, "eve", ["editor"]);
    await testUser(test, "bob", ["editor", "user"]);
  }
);

Tinytest.addAsync(
  "roles -can remove user from roles multiple times",
  async function (test) {
    await clearData();
    await Roles.createRoleAsync("user");
    await Roles.createRoleAsync("editor");

    // remove user role - one user
    await Roles.addUsersToRolesAsync(
      [users.eve, users.bob],
      ["editor", "user"]
    );
    await testUser(test, "eve", ["editor", "user"]);
    await testUser(test, "bob", ["editor", "user"]);
    await Roles.removeUsersFromRolesAsync(users.eve, ["user"]);
    await testUser(test, "eve", ["editor"]);
    await testUser(test, "bob", ["editor", "user"]);

    // try remove again
    await Roles.removeUsersFromRolesAsync(users.eve, ["user"]);
    await testUser(test, "eve", ["editor"]);
  }
);

Tinytest.addAsync(
  "roles -can remove users from roles via user object",
  async function (test) {
    await clearData();
    await Roles.createRoleAsync("user");
    await Roles.createRoleAsync("editor");

    const eve = await Meteor.users.findOneAsync({ _id: users.eve });
    const bob = await Meteor.users.findOneAsync({ _id: users.bob });

    // remove user role - one user
    await Roles.addUsersToRolesAsync([eve, bob], ["editor", "user"]);
    await testUser(test, "eve", ["editor", "user"]);
    await testUser(test, "bob", ["editor", "user"]);
    await Roles.removeUsersFromRolesAsync(eve, ["user"]);
    await testUser(test, "eve", ["editor"]);
    await testUser(test, "bob", ["editor", "user"]);
  }
);

Tinytest.addAsync(
  "roles -can remove individual users from roles by scope",
  async function (test) {
    await clearData();
    await Roles.createRoleAsync("admin");
    await Roles.createRoleAsync("user");
    await Roles.createRoleAsync("editor");

    // remove user role - one user
    await Roles.addUsersToRolesAsync(
      [users.eve, users.bob],
      ["editor", "user"],
      "scope1"
    );
    await Roles.addUsersToRolesAsync(
      [users.joe, users.bob],
      ["admin"],
      "scope2"
    );
    await testUser(test, "eve", ["editor", "user"], "scope1");
    await testUser(test, "bob", ["editor", "user"], "scope1");
    await testUser(test, "joe", [], "scope1");
    await testUser(test, "eve", [], "scope2");
    await testUser(test, "bob", ["admin"], "scope2");
    await testUser(test, "joe", ["admin"], "scope2");

    await Roles.removeUsersFromRolesAsync(users.eve, ["user"], "scope1");
    await testUser(test, "eve", ["editor"], "scope1");
    await testUser(test, "bob", ["editor", "user"], "scope1");
    await testUser(test, "joe", [], "scope1");
    await testUser(test, "eve", [], "scope2");
    await testUser(test, "bob", ["admin"], "scope2");
    await testUser(test, "joe", ["admin"], "scope2");
  }
);

Tinytest.addAsync(
  "roles -can remove individual users from roles by scope through options",
  async function (test) {
    await clearData();
    await Roles.createRoleAsync("admin");
    await Roles.createRoleAsync("user");
    await Roles.createRoleAsync("editor");

    // remove user role - one user
    await Roles.addUsersToRolesAsync(
      [users.eve, users.bob],
      ["editor", "user"],
      { scope: "scope1" }
    );
    await Roles.addUsersToRolesAsync([users.joe, users.bob], ["admin"], {
      scope: "scope2",
    });
    await testUser(test, "eve", ["editor", "user"], "scope1");
    await testUser(test, "bob", ["editor", "user"], "scope1");
    await testUser(test, "joe", [], "scope1");
    await testUser(test, "eve", [], "scope2");
    await testUser(test, "bob", ["admin"], "scope2");
    await testUser(test, "joe", ["admin"], "scope2");

    await Roles.removeUsersFromRolesAsync(users.eve, ["user"], {
      scope: "scope1",
    });
    await testUser(test, "eve", ["editor"], "scope1");
    await testUser(test, "bob", ["editor", "user"], "scope1");
    await testUser(test, "joe", [], "scope1");
    await testUser(test, "eve", [], "scope2");
    await testUser(test, "bob", ["admin"], "scope2");
    await testUser(test, "joe", ["admin"], "scope2");
  }
);

Tinytest.addAsync(
  "roles -can remove multiple users from roles",
  async function (test) {
    await clearData();
    await Roles.createRoleAsync("admin");
    await Roles.createRoleAsync("user");
    await Roles.createRoleAsync("editor");

    // remove user role - two users
    await Roles.addUsersToRolesAsync(
      [users.eve, users.bob],
      ["editor", "user"]
    );
    await testUser(test, "eve", ["editor", "user"]);
    await testUser(test, "bob", ["editor", "user"]);

    test.isFalse(await Roles.userIsInRoleAsync(users.joe, "admin"));
    await Roles.addUsersToRolesAsync([users.bob, users.joe], ["admin", "user"]);
    await testUser(test, "bob", ["admin", "user", "editor"]);
    await testUser(test, "joe", ["admin", "user"]);
    await Roles.removeUsersFromRolesAsync([users.bob, users.joe], ["admin"]);
    await testUser(test, "bob", ["user", "editor"]);
    await testUser(test, "joe", ["user"]);
  }
);

Tinytest.addAsync(
  "roles -can remove multiple users from roles by scope",
  async function (test) {
    await clearData();
    await Roles.createRoleAsync("admin");
    await Roles.createRoleAsync("user");
    await Roles.createRoleAsync("editor");

    // remove user role - one user
    await Roles.addUsersToRolesAsync(
      [users.eve, users.bob],
      ["editor", "user"],
      "scope1"
    );
    await Roles.addUsersToRolesAsync(
      [users.joe, users.bob],
      ["admin"],
      "scope2"
    );
    await testUser(test, "eve", ["editor", "user"], "scope1");
    await testUser(test, "bob", ["editor", "user"], "scope1");
    await testUser(test, "joe", [], "scope1");
    await testUser(test, "eve", [], "scope2");
    await testUser(test, "bob", ["admin"], "scope2");
    await testUser(test, "joe", ["admin"], "scope2");

    await Roles.removeUsersFromRolesAsync(
      [users.eve, users.bob],
      ["user"],
      "scope1"
    );
    await testUser(test, "eve", ["editor"], "scope1");
    await testUser(test, "bob", ["editor"], "scope1");
    await testUser(test, "joe", [], "scope1");
    await testUser(test, "eve", [], "scope2");
    await testUser(test, "bob", ["admin"], "scope2");
    await testUser(test, "joe", ["admin"], "scope2");

    await Roles.removeUsersFromRolesAsync(
      [users.joe, users.bob],
      ["admin"],
      "scope2"
    );
    await testUser(test, "eve", [], "scope2");
    await testUser(test, "bob", [], "scope2");
    await testUser(test, "joe", [], "scope2");
  }
);

Tinytest.addAsync(
  "roles -can remove multiple users from roles of any scope",
  async function (test) {
    await clearData();
    await Roles.createRoleAsync("admin");
    await Roles.createRoleAsync("user");
    await Roles.createRoleAsync("editor");

    // remove user role - one user
    await Roles.addUsersToRolesAsync(
      [users.eve, users.bob],
      ["editor", "user"],
      "scope1"
    );
    await Roles.addUsersToRolesAsync(
      [users.joe, users.bob],
      ["user"],
      "scope2"
    );
    await testUser(test, "eve", ["editor", "user"], "scope1");
    await testUser(test, "bob", ["editor", "user"], "scope1");
    await testUser(test, "joe", [], "scope1");
    await testUser(test, "eve", [], "scope2");
    await testUser(test, "bob", ["user"], "scope2");
    await testUser(test, "joe", ["user"], "scope2");

    await Roles.removeUsersFromRolesAsync([users.eve, users.bob], ["user"], {
      anyScope: true,
    });
    await testUser(test, "eve", ["editor"], "scope1");
    await testUser(test, "bob", ["editor"], "scope1");
    await testUser(test, "joe", [], "scope1");
    await testUser(test, "eve", [], "scope2");
    await testUser(test, "bob", [], "scope2");
    await testUser(test, "joe", ["user"], "scope2");
  }
);

Tinytest.addAsync("roles -can set user roles", async function (test) {
  await clearData();
  await Roles.createRoleAsync("admin");
  await Roles.createRoleAsync("user");
  await Roles.createRoleAsync("editor");

  const eve = await Meteor.users.findOneAsync({ _id: users.eve });
  const bob = await Meteor.users.findOneAsync({ _id: users.bob });

  await Roles.setUserRolesAsync([users.eve, bob], ["editor", "user"]);
  await testUser(test, "eve", ["editor", "user"]);
  await testUser(test, "bob", ["editor", "user"]);
  await testUser(test, "joe", []);

  // use addUsersToRoles add some roles
  await Roles.addUsersToRolesAsync([bob, users.joe], ["admin"]);
  await testUser(test, "eve", ["editor", "user"]);
  await testUser(test, "bob", ["admin", "editor", "user"]);
  await testUser(test, "joe", ["admin"]);

  await Roles.setUserRolesAsync([eve, bob], ["user"]);
  await testUser(test, "eve", ["user"]);
  await testUser(test, "bob", ["user"]);
  await testUser(test, "joe", ["admin"]);

  await Roles.setUserRolesAsync(bob, "editor");
  await testUser(test, "eve", ["user"]);
  await testUser(test, "bob", ["editor"]);
  await testUser(test, "joe", ["admin"]);

  await Roles.setUserRolesAsync([users.joe, users.bob], []);
  await testUser(test, "eve", ["user"]);
  await testUser(test, "bob", []);
  await testUser(test, "joe", []);
});

Tinytest.addAsync("roles -can set user roles by scope", async function (test) {
  await clearData();
  await Roles.createRoleAsync("admin");
  await Roles.createRoleAsync("user");
  await Roles.createRoleAsync("editor");

  const eve = await Meteor.users.findOneAsync({ _id: users.eve });
  const bob = await Meteor.users.findOneAsync({ _id: users.bob });
  const joe = await Meteor.users.findOneAsync({ _id: users.joe });

  await Roles.setUserRolesAsync(
    [users.eve, users.bob],
    ["editor", "user"],
    "scope1"
  );
  await Roles.setUserRolesAsync([users.bob, users.joe], ["admin"], "scope2");
  await testUser(test, "eve", ["editor", "user"], "scope1");
  await testUser(test, "bob", ["editor", "user"], "scope1");
  await testUser(test, "joe", [], "scope1");
  await testUser(test, "eve", [], "scope2");
  await testUser(test, "bob", ["admin"], "scope2");
  await testUser(test, "joe", ["admin"], "scope2");

  // use addUsersToRoles add some roles
  await Roles.addUsersToRolesAsync([users.eve, users.bob], ["admin"], "scope1");
  await Roles.addUsersToRolesAsync(
    [users.bob, users.joe],
    ["editor"],
    "scope2"
  );
  await testUser(test, "eve", ["admin", "editor", "user"], "scope1");
  await testUser(test, "bob", ["admin", "editor", "user"], "scope1");
  await testUser(test, "joe", [], "scope1");
  await testUser(test, "eve", [], "scope2");
  await testUser(test, "bob", ["admin", "editor"], "scope2");
  await testUser(test, "joe", ["admin", "editor"], "scope2");

  await Roles.setUserRolesAsync([eve, bob], ["user"], "scope1");
  await Roles.setUserRolesAsync([eve, joe], ["editor"], "scope2");
  await testUser(test, "eve", ["user"], "scope1");
  await testUser(test, "bob", ["user"], "scope1");
  await testUser(test, "joe", [], "scope1");
  await testUser(test, "eve", ["editor"], "scope2");
  await testUser(test, "bob", ["admin", "editor"], "scope2");
  await testUser(test, "joe", ["editor"], "scope2");

  await Roles.setUserRolesAsync(bob, "editor", "scope1");
  await testUser(test, "eve", ["user"], "scope1");
  await testUser(test, "bob", ["editor"], "scope1");
  await testUser(test, "joe", [], "scope1");
  await testUser(test, "eve", ["editor"], "scope2");
  await testUser(test, "bob", ["admin", "editor"], "scope2");
  await testUser(test, "joe", ["editor"], "scope2");

  const bobRoles1 = await Roles.getRolesForUserAsync(users.bob, {
    anyScope: true,
    fullObjects: true,
  });
  const joeRoles1 = await Roles.getRolesForUserAsync(users.joe, {
    anyScope: true,
    fullObjects: true,
  });
  test.isTrue(bobRoles1.map((r) => r.scope).includes("scope1"));
  test.isFalse(joeRoles1.map((r) => r.scope).includes("scope1"));

  await Roles.setUserRolesAsync([bob, users.joe], [], "scope1");
  await testUser(test, "eve", ["user"], "scope1");
  await testUser(test, "bob", [], "scope1");
  await testUser(test, "joe", [], "scope1");
  await testUser(test, "eve", ["editor"], "scope2");
  await testUser(test, "bob", ["admin", "editor"], "scope2");
  await testUser(test, "joe", ["editor"], "scope2");

  // When roles in a given scope are removed, we do not want any dangling database content for that scope.
  const bobRoles2 = await Roles.getRolesForUserAsync(users.bob, {
    anyScope: true,
    fullObjects: true,
  });
  const joeRoles2 = await Roles.getRolesForUserAsync(users.joe, {
    anyScope: true,
    fullObjects: true,
  });
  test.isFalse(bobRoles2.map((r) => r.scope).includes("scope1"));
  test.isFalse(joeRoles2.map((r) => r.scope).includes("scope1"));
});

Tinytest.addAsync(
  "roles -can set user roles by scope including GLOBAL_SCOPE",
  async function (test) {
    await clearData();
    await Roles.createRoleAsync("admin");
    await Roles.createRoleAsync("editor");

    const eve = await Meteor.users.findOneAsync({ _id: users.eve });

    await Roles.addUsersToRolesAsync(eve, "admin", Roles.GLOBAL_SCOPE);
    await testUser(test, "eve", ["admin"], "scope1");
    await testUser(test, "eve", ["admin"]);

    await Roles.setUserRolesAsync(eve, "editor", Roles.GLOBAL_SCOPE);
    await testUser(test, "eve", ["editor"], "scope2");
    await testUser(test, "eve", ["editor"]);
  }
);

Tinytest.addAsync(
  "roles -can set user roles by scope and anyScope",
  async function (test) {
    await clearData();
    await Roles.createRoleAsync("admin");
    await Roles.createRoleAsync("editor");

    const eve = await Meteor.users.findOneAsync({ _id: users.eve });

    const eveRoles = await Roles.getRolesForUserAsync(users.eve, {
      anyScope: true,
      fullObjects: true,
    });
    sameDeepMembers(
      test,
      eveRoles.map((obj) => {
        delete obj._id;
        return obj;
      }),
      []
    );

    await Roles.addUsersToRolesAsync(eve, "admin");

    const eveRoles2 = await Roles.getRolesForUserAsync(users.eve, {
      anyScope: true,
      fullObjects: true,
    });
    sameDeepMembers(
      test,
      eveRoles2.map((obj) => {
        delete obj._id;
        return obj;
      }),
      [
        {
          role: { _id: "admin" },
          scope: null,
          user: { _id: users.eve },
          inheritedRoles: [{ _id: "admin" }],
        },
      ]
    );

    await Roles.setUserRolesAsync(eve, "editor", {
      anyScope: true,
      scope: "scope2",
    });

    const eveRoles3 = await Roles.getRolesForUserAsync(users.eve, {
      anyScope: true,
      fullObjects: true,
    });
    sameDeepMembers(
      test,
      eveRoles3.map((obj) => {
        delete obj._id;
        return obj;
      }),
      [
        {
          role: { _id: "editor" },
          scope: "scope2",
          user: { _id: users.eve },
          inheritedRoles: [{ _id: "editor" }],
        },
      ]
    );
  }
);

Tinytest.addAsync("roles -can get all roles", async function (test) {
  await clearData();
  for (const role of roles) {
    await Roles.createRoleAsync(role);
  }

  // compare roles, sorted alphabetically
  const expected = roles;
  const fetchAll = await Roles.getAllRoles().fetchAsync();
  const actual = fetchAll.map((r) => r._id);

  sameMembers(test, actual, expected);

  const fetchSorted = await Roles.getAllRoles({
    sort: { _id: -1 },
  }).fetchAsync();
  sameMembers(
    test,
    fetchSorted.map((r) => r._id),
    expected.reverse()
  );
});

Tinytest.addAsync(
  "roles -get an empty list of roles for an empty user",
  async function (test) {
    await clearData();
    sameMembers(test, await Roles.getRolesForUserAsync(undefined), []);
    sameMembers(test, await Roles.getRolesForUserAsync(null), []);
    sameMembers(test, await Roles.getRolesForUserAsync({}), []);
  }
);

Tinytest.addAsync(
  "roles -get an empty list of roles for non-existant user",
  async function (test) {
    await clearData();
    sameMembers(test, await Roles.getRolesForUserAsync("1"), []);
    sameMembers(test, await Roles.getRolesForUserAsync("1", "scope1"), []);
  }
);

Tinytest.addAsync("roles -can get all roles for user", async function (test) {
  await clearData();
  await Roles.createRoleAsync("admin");
  await Roles.createRoleAsync("user");

  const userId = users.eve;
  let userObj;

  // by userId
  sameMembers(test, await Roles.getRolesForUserAsync(userId), []);

  // by user object
  userObj = await Meteor.users.findOneAsync({ _id: userId });
  sameMembers(test, await Roles.getRolesForUserAsync(userObj), []);

  await Roles.addUsersToRolesAsync(userId, ["admin", "user"]);

  // by userId
  sameMembers(test, await Roles.getRolesForUserAsync(userId), [
    "admin",
    "user",
  ]);

  // by user object
  userObj = await Meteor.users.findOneAsync({ _id: userId });
  sameMembers(test, await Roles.getRolesForUserAsync(userObj), [
    "admin",
    "user",
  ]);

  const userRoles = await Roles.getRolesForUserAsync(userId, {
    fullObjects: true,
  });
  sameDeepMembers(
    test,
    userRoles.map((obj) => {
      delete obj._id;
      return obj;
    }),
    [
      {
        role: { _id: "admin" },
        scope: null,
        user: { _id: userId },
        inheritedRoles: [{ _id: "admin" }],
      },
      {
        role: { _id: "user" },
        scope: null,
        user: { _id: userId },
        inheritedRoles: [{ _id: "user" }],
      },
    ]
  );
});

Tinytest.addAsync(
  "roles -can get all roles for user by scope",
  async function (test) {
    await clearData();
    await Roles.createRoleAsync("admin");
    await Roles.createRoleAsync("user");
    await Roles.createRoleAsync("editor");

    const userId = users.eve;

    await Roles.addUsersToRolesAsync([users.eve], ["editor"], "scope1");
    await Roles.addUsersToRolesAsync([users.eve], ["editor", "user"], "scope2");

    // by userId
    sameMembers(test, await Roles.getScopesForUserAsync(userId, "user"), [
      "scope2",
    ]);
    sameMembers(test, await Roles.getScopesForUserAsync(userId, "editor"), [
      "scope1",
      "scope2",
    ]);
    sameMembers(test, await Roles.getScopesForUserAsync(userId, "admin"), []);

    // by user object
    const userObj = await Meteor.users.findOneAsync({ _id: userId });
    sameMembers(test, await Roles.getScopesForUserAsync(userObj, "user"), [
      "scope2",
    ]);
    sameMembers(test, await Roles.getScopesForUserAsync(userObj, "editor"), [
      "scope1",
      "scope2",
    ]);
    sameMembers(test, await Roles.getScopesForUserAsync(userObj, "admin"), []);
  }
);

Tinytest.addAsync(
  "roles -getScopesForUser returns [] when not using scopes",
  async function (test) {
    await clearData();
    await Roles.createRoleAsync("user");
    await Roles.createRoleAsync("editor");

    const userId = users.eve;

    await Roles.addUsersToRolesAsync([users.eve], ["editor", "user"]);

    // by userId
    sameMembers(test, await Roles.getScopesForUserAsync(userId), []);
    sameMembers(test, await Roles.getScopesForUserAsync(userId, "editor"), []);
    sameMembers(
      test,
      await Roles.getScopesForUserAsync(userId, ["editor"]),
      []
    );
    sameMembers(
      test,
      await Roles.getScopesForUserAsync(userId, ["editor", "user"]),
      []
    );

    // by user object
    const userObj = await Meteor.users.findOneAsync({ _id: userId });
    sameMembers(test, await Roles.getScopesForUserAsync(userObj), []);
    sameMembers(test, await Roles.getScopesForUserAsync(userObj, "editor"), []);
    sameMembers(
      test,
      await Roles.getScopesForUserAsync(userObj, ["editor"]),
      []
    );
    sameMembers(
      test,
      await Roles.getScopesForUserAsync(userObj, ["editor", "user"]),
      []
    );
  }
);

Tinytest.addAsync(
  "roles -can get all groups for user by role array",
  async function (test) {
    await clearData();
    const userId = users.eve;

    await Roles.createRoleAsync("user");
    await Roles.createRoleAsync("editor");
    await Roles.createRoleAsync("moderator");
    await Roles.createRoleAsync("admin");

    await Roles.addUsersToRolesAsync([users.eve], ["editor"], "group1");
    await Roles.addUsersToRolesAsync([users.eve], ["editor", "user"], "group2");
    await Roles.addUsersToRolesAsync([users.eve], ["moderator"], "group3");

    // by userId, one role
    sameMembers(test, await Roles.getScopesForUserAsync(userId, ["user"]), [
      "group2",
    ]);
    sameMembers(test, await Roles.getScopesForUserAsync(userId, ["editor"]), [
      "group1",
      "group2",
    ]);
    sameMembers(test, await Roles.getScopesForUserAsync(userId, ["admin"]), []);

    // by userId, multiple roles
    sameMembers(
      test,
      await Roles.getScopesForUserAsync(userId, ["editor", "user"]),
      ["group1", "group2"]
    );
    sameMembers(
      test,
      await Roles.getScopesForUserAsync(userId, ["editor", "moderator"]),
      ["group1", "group2", "group3"]
    );
    sameMembers(
      test,
      await Roles.getScopesForUserAsync(userId, ["user", "moderator"]),
      ["group2", "group3"]
    );

    // by user object, one role
    const userObj = await Meteor.users.findOneAsync({ _id: userId });
    sameMembers(test, await Roles.getScopesForUserAsync(userObj, ["user"]), [
      "group2",
    ]);
    sameMembers(test, await Roles.getScopesForUserAsync(userObj, ["editor"]), [
      "group1",
      "group2",
    ]);
    sameMembers(
      test,
      await Roles.getScopesForUserAsync(userObj, ["admin"]),
      []
    );

    // by user object, multiple roles
    sameMembers(
      test,
      await Roles.getScopesForUserAsync(userObj, ["editor", "user"]),
      ["group1", "group2"]
    );
    sameMembers(
      test,
      await Roles.getScopesForUserAsync(userObj, ["editor", "moderator"]),
      ["group1", "group2", "group3"]
    );
    sameMembers(
      test,
      await Roles.getScopesForUserAsync(userObj, ["user", "moderator"]),
      ["group2", "group3"]
    );
  }
);

Tinytest.addAsync(
  "roles -getting all scopes for user does not include GLOBAL_SCOPE",
  async function (test) {
    await clearData();
    await Roles.createRoleAsync("admin");
    await Roles.createRoleAsync("user");
    await Roles.createRoleAsync("editor");

    const userId = users.eve;

    await Roles.addUsersToRolesAsync([users.eve], ["editor"], "scope1");
    await Roles.addUsersToRolesAsync([users.eve], ["editor", "user"], "scope2");
    await Roles.addUsersToRolesAsync(
      [users.eve],
      ["editor", "user", "admin"],
      Roles.GLOBAL_SCOPE
    );

    // by userId
    sameMembers(test, await Roles.getScopesForUserAsync(userId, "user"), [
      "scope2",
    ]);
    sameMembers(test, await Roles.getScopesForUserAsync(userId, "editor"), [
      "scope1",
      "scope2",
    ]);
    sameMembers(test, await Roles.getScopesForUserAsync(userId, "admin"), []);
    sameMembers(test, await Roles.getScopesForUserAsync(userId, ["user"]), [
      "scope2",
    ]);
    sameMembers(test, await Roles.getScopesForUserAsync(userId, ["editor"]), [
      "scope1",
      "scope2",
    ]);
    sameMembers(test, await Roles.getScopesForUserAsync(userId, ["admin"]), []);
    sameMembers(
      test,
      await Roles.getScopesForUserAsync(userId, ["user", "editor", "admin"]),
      ["scope1", "scope2"]
    );

    // by user object
    const userObj = await Meteor.users.findOneAsync({ _id: userId });
    sameMembers(test, await Roles.getScopesForUserAsync(userObj, "user"), [
      "scope2",
    ]);
    sameMembers(test, await Roles.getScopesForUserAsync(userObj, "editor"), [
      "scope1",
      "scope2",
    ]);
    sameMembers(test, await Roles.getScopesForUserAsync(userObj, "admin"), []);
    sameMembers(test, await Roles.getScopesForUserAsync(userObj, ["user"]), [
      "scope2",
    ]);
    sameMembers(test, await Roles.getScopesForUserAsync(userObj, ["editor"]), [
      "scope1",
      "scope2",
    ]);
    sameMembers(
      test,
      await Roles.getScopesForUserAsync(userObj, ["admin"]),
      []
    );
    sameMembers(
      test,
      await Roles.getScopesForUserAsync(userObj, ["user", "editor", "admin"]),
      ["scope1", "scope2"]
    );
  }
);

Tinytest.addAsync("roles -can get all users in role", async function (test) {
  await clearData();
  await Roles.createRoleAsync("admin");
  await Roles.createRoleAsync("user");
  await Roles.createRoleAsync("editor");

  await Roles.addUsersToRolesAsync([users.eve, users.joe], ["admin", "user"]);
  await Roles.addUsersToRolesAsync([users.bob, users.joe], ["editor"]);

  const expected = [users.eve, users.joe];
  const cursor = await Roles.getUsersInRoleAsync("admin");
  const fetched = await cursor.fetchAsync();
  const actual = fetched.map((r) => r._id);

  sameMembers(test, actual, expected);
});

Tinytest.addAsync(
  "roles -can get all users in role by scope",
  async function (test) {
    await clearData();
    await Roles.createRoleAsync("admin");
    await Roles.createRoleAsync("user");

    await Roles.addUsersToRolesAsync(
      [users.eve, users.joe],
      ["admin", "user"],
      "scope1"
    );
    await Roles.addUsersToRolesAsync(
      [users.bob, users.joe],
      ["admin"],
      "scope2"
    );

    let expected = [users.eve, users.joe];
    const cursor1 = await Roles.getUsersInRoleAsync("admin", "scope1");
    const fetched1 = await cursor1.fetchAsync();
    let actual = fetched1.map((r) => r._id);

    sameMembers(test, actual, expected);

    expected = [users.eve, users.joe];
    const cursor2 = await Roles.getUsersInRoleAsync("admin", {
      scope: "scope1",
    });
    const fetched2 = await cursor2.fetchAsync();
    actual = fetched2.map((r) => r._id);
    sameMembers(test, actual, expected);

    expected = [users.eve, users.bob, users.joe];
    const cursor3 = await Roles.getUsersInRoleAsync("admin", {
      anyScope: true,
    });
    const fetched3 = await cursor3.fetchAsync();
    actual = fetched3.map((r) => r._id);
    sameMembers(test, actual, expected);

    const cursor4 = await Roles.getUsersInRoleAsync("admin");
    const fetched4 = await cursor4.fetchAsync();
    actual = fetched4.map((r) => r._id);
    sameMembers(test, actual, []);
  }
);

Tinytest.addAsync(
  "roles -can get all users in role by scope and passes through mongo query arguments",
  async function (test) {
    await clearData();
    await Roles.createRoleAsync("admin");
    await Roles.createRoleAsync("user");

    await Roles.addUsersToRolesAsync(
      [users.eve, users.joe],
      ["admin", "user"],
      "scope1"
    );
    await Roles.addUsersToRolesAsync(
      [users.bob, users.joe],
      ["admin"],
      "scope2"
    );

    const cursor = await Roles.getUsersInRoleAsync("admin", "scope1", {
      fields: { username: 0 },
      limit: 1,
    });
    const results = await cursor.fetchAsync();

    test.equal(1, results.length);
    test.isTrue(hasProp(results[0], "_id"));
    test.isFalse(hasProp(results[0], "username"));
  }
);

Tinytest.addAsync(
  "roles -can use Roles.GLOBAL_SCOPE to assign blanket roles",
  async function (test) {
    await clearData();
    await Roles.createRoleAsync("admin");

    await Roles.addUsersToRolesAsync(
      [users.joe, users.bob],
      ["admin"],
      Roles.GLOBAL_SCOPE
    );

    await testUser(test, "eve", [], "scope1");
    await testUser(test, "joe", ["admin"], "scope2");
    await testUser(test, "joe", ["admin"], "scope1");
    await testUser(test, "bob", ["admin"], "scope2");
    await testUser(test, "bob", ["admin"], "scope1");

    await Roles.removeUsersFromRolesAsync(
      users.joe,
      ["admin"],
      Roles.GLOBAL_SCOPE
    );

    await testUser(test, "eve", [], "scope1");
    await testUser(test, "joe", [], "scope2");
    await testUser(test, "joe", [], "scope1");
    await testUser(test, "bob", ["admin"], "scope2");
    await testUser(test, "bob", ["admin"], "scope1");
  }
);

Tinytest.addAsync(
  "roles -Roles.GLOBAL_SCOPE is independent of other scopes",
  async function (test) {
    await clearData();
    await Roles.createRoleAsync("admin");

    await Roles.addUsersToRolesAsync(
      [users.joe, users.bob],
      ["admin"],
      "scope5"
    );
    await Roles.addUsersToRolesAsync(
      [users.joe, users.bob],
      ["admin"],
      Roles.GLOBAL_SCOPE
    );

    await testUser(test, "eve", [], "scope1");
    await testUser(test, "joe", ["admin"], "scope5");
    await testUser(test, "joe", ["admin"], "scope2");
    await testUser(test, "joe", ["admin"], "scope1");
    await testUser(test, "bob", ["admin"], "scope5");
    await testUser(test, "bob", ["admin"], "scope2");
    await testUser(test, "bob", ["admin"], "scope1");

    await Roles.removeUsersFromRolesAsync(
      users.joe,
      ["admin"],
      Roles.GLOBAL_SCOPE
    );

    await testUser(test, "eve", [], "scope1");
    await testUser(test, "joe", ["admin"], "scope5");
    await testUser(test, "joe", [], "scope2");
    await testUser(test, "joe", [], "scope1");
    await testUser(test, "bob", ["admin"], "scope5");
    await testUser(test, "bob", ["admin"], "scope2");
    await testUser(test, "bob", ["admin"], "scope1");
  }
);

Tinytest.addAsync(
  "roles -Roles.GLOBAL_SCOPE also checked when scope not specified",
  async function (test) {
    await clearData();
    await Roles.createRoleAsync("admin");

    await Roles.addUsersToRolesAsync(users.joe, "admin", Roles.GLOBAL_SCOPE);

    await testUser(test, "joe", ["admin"]);

    await Roles.removeUsersFromRolesAsync(
      users.joe,
      "admin",
      Roles.GLOBAL_SCOPE
    );

    await testUser(test, "joe", []);
  }
);

Tinytest.addAsync("roles -can use '.' in scope name", async function (test) {
  await clearData();
  await Roles.createRoleAsync("admin");

  await Roles.addUsersToRolesAsync(users.joe, ["admin"], "example.com");
  await testUser(test, "joe", ["admin"], "example.com");
});

Tinytest.addAsync(
  "roles -can use multiple periods in scope name",
  async function (test) {
    await clearData();
    await Roles.createRoleAsync("admin");

    await Roles.addUsersToRolesAsync(users.joe, ["admin"], "example.k12.va.us");
    await testUser(test, "joe", ["admin"], "example.k12.va.us");
  }
);

Tinytest.addAsync("roles -renaming of roles", async function (test) {
  await clearData();
  await Roles.createRoleAsync("admin");
  await Roles.createRoleAsync("user");
  await Roles.createRoleAsync("editor");

  await Roles.setUserRolesAsync(
    [users.eve, users.bob],
    ["editor", "user"],
    "scope1"
  );
  await Roles.setUserRolesAsync(
    [users.bob, users.joe],
    ["user", "admin"],
    "scope2"
  );

  test.isTrue(await Roles.userIsInRoleAsync(users.eve, "editor", "scope1"));
  test.isFalse(await Roles.userIsInRoleAsync(users.eve, "editor", "scope2"));

  test.isFalse(await Roles.userIsInRoleAsync(users.joe, "admin", "scope1"));
  test.isTrue(await Roles.userIsInRoleAsync(users.joe, "admin", "scope2"));

  test.isTrue(await Roles.userIsInRoleAsync(users.eve, "user", "scope1"));
  test.isTrue(await Roles.userIsInRoleAsync(users.bob, "user", "scope1"));
  test.isFalse(await Roles.userIsInRoleAsync(users.joe, "user", "scope1"));

  test.isFalse(await Roles.userIsInRoleAsync(users.eve, "user", "scope2"));
  test.isTrue(await Roles.userIsInRoleAsync(users.bob, "user", "scope2"));
  test.isTrue(await Roles.userIsInRoleAsync(users.joe, "user", "scope2"));

  test.isFalse(await Roles.userIsInRoleAsync(users.eve, "user2", "scope1"));
  test.isFalse(await Roles.userIsInRoleAsync(users.eve, "user2", "scope2"));

  await Roles.renameRoleAsync("user", "user2");

  test.isTrue(await Roles.userIsInRoleAsync(users.eve, "editor", "scope1"));
  test.isFalse(await Roles.userIsInRoleAsync(users.eve, "editor", "scope2"));

  test.isFalse(await Roles.userIsInRoleAsync(users.joe, "admin", "scope1"));
  test.isTrue(await Roles.userIsInRoleAsync(users.joe, "admin", "scope2"));

  test.isTrue(await Roles.userIsInRoleAsync(users.eve, "user2", "scope1"));
  test.isTrue(await Roles.userIsInRoleAsync(users.bob, "user2", "scope1"));
  test.isFalse(await Roles.userIsInRoleAsync(users.joe, "user2", "scope1"));

  test.isFalse(await Roles.userIsInRoleAsync(users.eve, "user2", "scope2"));
  test.isTrue(await Roles.userIsInRoleAsync(users.bob, "user2", "scope2"));
  test.isTrue(await Roles.userIsInRoleAsync(users.joe, "user2", "scope2"));

  test.isFalse(await Roles.userIsInRoleAsync(users.eve, "user", "scope1"));
  test.isFalse(await Roles.userIsInRoleAsync(users.eve, "user", "scope2"));
});

Tinytest.addAsync("roles -_addUserToRole", async function (test) {
  await clearData();
  await Roles.createRoleAsync("admin");

  const userRoles = await Roles.getRolesForUserAsync(users.eve, {
    anyScope: true,
    fullObjects: true,
  });
  sameDeepMembers(
    test,
    userRoles.map((obj) => {
      delete obj._id;
      return obj;
    }),
    []
  );

  const roles = await Roles._addUserToRoleAsync(users.eve, "admin", {
    scope: null,
    ifExists: false,
  });
  hasAnyKeys(test, roles, "insertedId");

  const userRoles2 = await Roles.getRolesForUserAsync(users.eve, {
    anyScope: true,
    fullObjects: true,
  });
  sameDeepMembers(
    test,
    userRoles2.map((obj) => {
      delete obj._id;
      return obj;
    }),
    [
      {
        role: { _id: "admin" },
        scope: null,
        user: { _id: users.eve },
        inheritedRoles: [{ _id: "admin" }],
      },
    ]
  );

  const roles2 = await Roles._addUserToRoleAsync(users.eve, "admin", {
    scope: null,
    ifExists: false,
  });
  hasAnyKeys(test, roles2, "insertedId");

  const roles3 = await Roles.getRolesForUserAsync(users.eve, {
    anyScope: true,
    fullObjects: true,
  });
  sameDeepMembers(
    test,
    roles3.map((obj) => {
      delete obj._id;
      return obj;
    }),
    [
      {
        role: { _id: "admin" },
        scope: null,
        user: { _id: users.eve },
        inheritedRoles: [{ _id: "admin" }],
      },
    ]
  );
});

Tinytest.addAsync("roles -_removeUserFromRole", async function (test) {
  await clearData();
  await Roles.createRoleAsync("admin");

  await Roles.addUsersToRolesAsync(users.eve, "admin");

  const rolesForUser = await Roles.getRolesForUserAsync(users.eve, {
    anyScope: true,
    fullObjects: true,
  });
  sameDeepMembers(
    test,
    rolesForUser.map((obj) => {
      delete obj._id;
      return obj;
    }),
    [
      {
        role: { _id: "admin" },
        scope: null,
        user: { _id: users.eve },
        inheritedRoles: [{ _id: "admin" }],
      },
    ]
  );

  await Roles._removeUserFromRoleAsync(users.eve, "admin", { scope: null });

  const rolesForUser2 = await Roles.getRolesForUserAsync(users.eve, {
    anyScope: true,
    fullObjects: true,
  });
  sameDeepMembers(
    test,
    rolesForUser2.map((obj) => {
      delete obj._id;
      return obj;
    }),
    []
  );
});

Tinytest.addAsync("roles -keep assigned roles", async function (test) {
  await clearData();
  await Roles.createRoleAsync("admin");
  await Roles.createRoleAsync("user");
  await Roles.createRoleAsync("ALL_PERMISSIONS");
  await Roles.createRoleAsync("VIEW_PERMISSION");
  await Roles.createRoleAsync("EDIT_PERMISSION");
  await Roles.createRoleAsync("DELETE_PERMISSION");
  await Roles.addRolesToParentAsync("ALL_PERMISSIONS", "user");
  await Roles.addRolesToParentAsync("EDIT_PERMISSION", "ALL_PERMISSIONS");
  await Roles.addRolesToParentAsync("VIEW_PERMISSION", "ALL_PERMISSIONS");
  await Roles.addRolesToParentAsync("DELETE_PERMISSION", "admin");

  await Roles.addUsersToRolesAsync(users.eve, ["user"]);

  test.isTrue(await Roles.userIsInRoleAsync(users.eve, "VIEW_PERMISSION"));

  const rolesForUser = await Roles.getRolesForUserAsync(users.eve, {
    anyScope: true,
    fullObjects: true,
  });
  sameDeepUnorderedMembers(
    test,
    rolesForUser.map((obj) => {
      delete obj._id;
      return obj;
    }),
    [
      {
        role: { _id: "user" },
        scope: null,
        user: { _id: users.eve },
        inheritedRoles: [
          { _id: "user" },
          { _id: "ALL_PERMISSIONS" },
          { _id: "EDIT_PERMISSION" },
          { _id: "VIEW_PERMISSION" },
        ],
      },
    ]
  );

  await Roles.addUsersToRolesAsync(users.eve, "VIEW_PERMISSION");

  test.isTrue(await Roles.userIsInRoleAsync(users.eve, "VIEW_PERMISSION"));

  const rolesForUser2 = await Roles.getRolesForUserAsync(users.eve, {
    anyScope: true,
    fullObjects: true,
  });
  sameDeepUnorderedMembers(
    test,
    rolesForUser2.map((obj) => {
      delete obj._id;
      return obj;
    }),
    [
      {
        role: { _id: "user" },
        scope: null,
        user: { _id: users.eve },
        inheritedRoles: [
          { _id: "user" },
          { _id: "ALL_PERMISSIONS" },
          { _id: "EDIT_PERMISSION" },
          { _id: "VIEW_PERMISSION" },
        ],
      },
      {
        role: { _id: "VIEW_PERMISSION" },
        scope: null,
        user: { _id: users.eve },
        inheritedRoles: [{ _id: "VIEW_PERMISSION" }],
      },
    ]
  );

  await Roles.removeUsersFromRolesAsync(users.eve, "user");

  test.isTrue(await Roles.userIsInRoleAsync(users.eve, "VIEW_PERMISSION"));

  const rolesForUser3 = await Roles.getRolesForUserAsync(users.eve, {
    anyScope: true,
    fullObjects: true,
  });
  sameDeepUnorderedMembers(
    test,
    rolesForUser3.map((obj) => {
      delete obj._id;
      return obj;
    }),
    [
      {
        role: { _id: "VIEW_PERMISSION" },
        scope: null,
        user: { _id: users.eve },
        inheritedRoles: [{ _id: "VIEW_PERMISSION" }],
      },
    ]
  );

  await Roles.removeUsersFromRolesAsync(users.eve, "VIEW_PERMISSION");

  test.isFalse(await Roles.userIsInRoleAsync(users.eve, "VIEW_PERMISSION"));

  const rolesForUser4 = await Roles.getRolesForUserAsync(users.eve, {
    anyScope: true,
    fullObjects: true,
  });
  sameDeepUnorderedMembers(
    test,
    rolesForUser4.map((obj) => {
      delete obj._id;
      return obj;
    }),
    []
  );
});

Tinytest.addAsync(
  "roles -adds children of the added role to the assignments",
  async function (test) {
    await clearData();
    await Roles.createRoleAsync("admin");
    await Roles.createRoleAsync("ALBUM.ADMIN");
    await Roles.createRoleAsync("ALBUM.VIEW");
    await Roles.createRoleAsync("TRACK.ADMIN");
    await Roles.createRoleAsync("TRACK.VIEW");

    await Roles.addRolesToParentAsync("ALBUM.VIEW", "ALBUM.ADMIN");
    await Roles.addRolesToParentAsync("TRACK.VIEW", "TRACK.ADMIN");

    await Roles.addRolesToParentAsync("ALBUM.ADMIN", "admin");

    await Roles.addUsersToRolesAsync(users.eve, ["admin"]);

    test.isFalse(await Roles.userIsInRoleAsync(users.eve, "TRACK.VIEW"));

    await Roles.addRolesToParentAsync("TRACK.ADMIN", "admin");

    test.isTrue(await Roles.userIsInRoleAsync(users.eve, "TRACK.VIEW"));
  }
);

Tinytest.addAsync(
  "roles -removes children of the removed role from the assignments",
  async function (test) {
    await clearData();
    await Roles.createRoleAsync("admin");
    await Roles.createRoleAsync("ALBUM.ADMIN");
    await Roles.createRoleAsync("ALBUM.VIEW");
    await Roles.createRoleAsync("TRACK.ADMIN");
    await Roles.createRoleAsync("TRACK.VIEW");

    await Roles.addRolesToParentAsync("ALBUM.VIEW", "ALBUM.ADMIN");
    await Roles.addRolesToParentAsync("TRACK.VIEW", "TRACK.ADMIN");

    await Roles.addRolesToParentAsync("ALBUM.ADMIN", "admin");
    await Roles.addRolesToParentAsync("TRACK.ADMIN", "admin");

    await Roles.addUsersToRolesAsync(users.eve, ["admin"]);

    test.isTrue(await Roles.userIsInRoleAsync(users.eve, "TRACK.VIEW"));

    await Roles.removeRolesFromParentAsync("TRACK.ADMIN", "admin");

    test.isFalse(await Roles.userIsInRoleAsync(users.eve, "TRACK.VIEW"));
  }
);

Tinytest.addAsync(
  "roles -modify assigned hierarchical roles",
  async function (test) {
    await clearData();
    await Roles.createRoleAsync("admin");
    await Roles.createRoleAsync("user");
    await Roles.createRoleAsync("ALL_PERMISSIONS");
    await Roles.createRoleAsync("VIEW_PERMISSION");
    await Roles.createRoleAsync("EDIT_PERMISSION");
    await Roles.createRoleAsync("DELETE_PERMISSION");
    await Roles.addRolesToParentAsync("ALL_PERMISSIONS", "user");
    await Roles.addRolesToParentAsync("EDIT_PERMISSION", "ALL_PERMISSIONS");
    await Roles.addRolesToParentAsync("VIEW_PERMISSION", "ALL_PERMISSIONS");
    await Roles.addRolesToParentAsync("DELETE_PERMISSION", "admin");

    await Roles.addUsersToRolesAsync(users.eve, ["user"]);
    await Roles.addUsersToRolesAsync(users.eve, ["ALL_PERMISSIONS"], "scope");

    test.isFalse(
      await Roles.userIsInRoleAsync(users.eve, "MODERATE_PERMISSION")
    );
    test.isFalse(
      await Roles.userIsInRoleAsync(users.eve, "MODERATE_PERMISSION", "scope")
    );

    const usersRoles = await Roles.getRolesForUserAsync(users.eve, {
      anyScope: true,
      fullObjects: true,
    });
    sameDeepUnorderedMembers(
      test,
      usersRoles.map((obj) => {
        delete obj._id;
        return obj;
      }),
      [
        {
          role: { _id: "user" },
          scope: null,
          user: { _id: users.eve },
          inheritedRoles: [
            { _id: "user" },
            { _id: "ALL_PERMISSIONS" },
            { _id: "EDIT_PERMISSION" },
            { _id: "VIEW_PERMISSION" },
          ],
        },
        {
          role: { _id: "ALL_PERMISSIONS" },
          scope: "scope",
          user: { _id: users.eve },
          inheritedRoles: [
            { _id: "ALL_PERMISSIONS" },
            { _id: "EDIT_PERMISSION" },
            { _id: "VIEW_PERMISSION" },
          ],
        },
      ]
    );

    await Roles.createRoleAsync("MODERATE_PERMISSION");

    await Roles.addRolesToParentAsync("MODERATE_PERMISSION", "ALL_PERMISSIONS");

    test.isTrue(
      await Roles.userIsInRoleAsync(users.eve, "MODERATE_PERMISSION")
    );
    test.isTrue(
      await Roles.userIsInRoleAsync(users.eve, "MODERATE_PERMISSION", "scope")
    );

    const usersRoles2 = await Roles.getRolesForUserAsync(users.eve, {
      anyScope: true,
      fullObjects: true,
    });
    sameDeepUnorderedMembers(
      test,
      usersRoles2.map((obj) => {
        delete obj._id;
        return obj;
      }),
      [
        {
          role: { _id: "user" },
          scope: null,
          user: { _id: users.eve },
          inheritedRoles: [
            { _id: "user" },
            { _id: "ALL_PERMISSIONS" },
            { _id: "EDIT_PERMISSION" },
            { _id: "VIEW_PERMISSION" },
            { _id: "MODERATE_PERMISSION" },
          ],
        },
        {
          role: { _id: "ALL_PERMISSIONS" },
          scope: "scope",
          user: { _id: users.eve },
          inheritedRoles: [
            { _id: "ALL_PERMISSIONS" },
            { _id: "EDIT_PERMISSION" },
            { _id: "VIEW_PERMISSION" },
            { _id: "MODERATE_PERMISSION" },
          ],
        },
      ]
    );

    await Roles.addUsersToRolesAsync(users.eve, ["admin"]);

    test.isTrue(await Roles.userIsInRoleAsync(users.eve, "DELETE_PERMISSION"));
    test.isTrue(
      await Roles.userIsInRoleAsync(users.eve, "DELETE_PERMISSION", "scope")
    );

    const usersRoles3 = await Roles.getRolesForUserAsync(users.eve, {
      anyScope: true,
      fullObjects: true,
    });
    sameDeepUnorderedMembers(
      test,
      usersRoles3.map((obj) => {
        delete obj._id;
        return obj;
      }),
      [
        {
          role: { _id: "user" },
          scope: null,
          user: { _id: users.eve },
          inheritedRoles: [
            { _id: "user" },
            { _id: "ALL_PERMISSIONS" },
            { _id: "EDIT_PERMISSION" },
            { _id: "VIEW_PERMISSION" },
            { _id: "MODERATE_PERMISSION" },
          ],
        },
        {
          role: { _id: "ALL_PERMISSIONS" },
          scope: "scope",
          user: { _id: users.eve },
          inheritedRoles: [
            { _id: "ALL_PERMISSIONS" },
            { _id: "EDIT_PERMISSION" },
            { _id: "VIEW_PERMISSION" },
            { _id: "MODERATE_PERMISSION" },
          ],
        },
        {
          role: { _id: "admin" },
          scope: null,
          user: { _id: users.eve },
          inheritedRoles: [{ _id: "admin" }, { _id: "DELETE_PERMISSION" }],
        },
      ]
    );

    await Roles.addRolesToParentAsync("DELETE_PERMISSION", "ALL_PERMISSIONS");

    test.isTrue(await Roles.userIsInRoleAsync(users.eve, "DELETE_PERMISSION"));
    test.isTrue(
      await Roles.userIsInRoleAsync(users.eve, "DELETE_PERMISSION", "scope")
    );

    const usersRoles4 = await Roles.getRolesForUserAsync(users.eve, {
      anyScope: true,
      fullObjects: true,
    });
    sameDeepUnorderedMembers(
      test,
      usersRoles4.map((obj) => {
        delete obj._id;
        return obj;
      }),
      [
        {
          role: { _id: "user" },
          scope: null,
          user: { _id: users.eve },
          inheritedRoles: [
            { _id: "user" },
            { _id: "ALL_PERMISSIONS" },
            { _id: "EDIT_PERMISSION" },
            { _id: "VIEW_PERMISSION" },
            { _id: "MODERATE_PERMISSION" },
            { _id: "DELETE_PERMISSION" },
          ],
        },
        {
          role: { _id: "ALL_PERMISSIONS" },
          scope: "scope",
          user: { _id: users.eve },
          inheritedRoles: [
            { _id: "ALL_PERMISSIONS" },
            { _id: "EDIT_PERMISSION" },
            { _id: "VIEW_PERMISSION" },
            { _id: "MODERATE_PERMISSION" },
            { _id: "DELETE_PERMISSION" },
          ],
        },
        {
          role: { _id: "admin" },
          scope: null,
          user: { _id: users.eve },
          inheritedRoles: [{ _id: "admin" }, { _id: "DELETE_PERMISSION" }],
        },
      ]
    );

    await Roles.removeUsersFromRolesAsync(users.eve, ["admin"]);

    test.isTrue(await Roles.userIsInRoleAsync(users.eve, "DELETE_PERMISSION"));
    test.isTrue(
      await Roles.userIsInRoleAsync(users.eve, "DELETE_PERMISSION", "scope")
    );

    const usersRoles5 = await Roles.getRolesForUserAsync(users.eve, {
      anyScope: true,
      fullObjects: true,
    });
    sameDeepUnorderedMembers(
      test,
      usersRoles5.map((obj) => {
        delete obj._id;
        return obj;
      }),
      [
        {
          role: { _id: "user" },
          scope: null,
          user: { _id: users.eve },
          inheritedRoles: [
            { _id: "user" },
            { _id: "ALL_PERMISSIONS" },
            { _id: "EDIT_PERMISSION" },
            { _id: "VIEW_PERMISSION" },
            { _id: "MODERATE_PERMISSION" },
            { _id: "DELETE_PERMISSION" },
          ],
        },
        {
          role: { _id: "ALL_PERMISSIONS" },
          scope: "scope",
          user: { _id: users.eve },
          inheritedRoles: [
            { _id: "ALL_PERMISSIONS" },
            { _id: "EDIT_PERMISSION" },
            { _id: "VIEW_PERMISSION" },
            { _id: "MODERATE_PERMISSION" },
            { _id: "DELETE_PERMISSION" },
          ],
        },
      ]
    );

    await await Roles.deleteRoleAsync("ALL_PERMISSIONS");

    test.isFalse(await Roles.userIsInRoleAsync(users.eve, "DELETE_PERMISSION"));
    test.isFalse(
      await Roles.userIsInRoleAsync(users.eve, "DELETE_PERMISSION", "scope")
    );

    test.isFalse(
      await Roles.userIsInRoleAsync(users.eve, "MODERATE_PERMISSION")
    );
    test.isFalse(
      await Roles.userIsInRoleAsync(users.eve, "MODERATE_PERMISSION", "scope")
    );

    const usersRoles6 = await Roles.getRolesForUserAsync(users.eve, {
      anyScope: true,
      fullObjects: true,
    });
    sameDeepUnorderedMembers(
      test,
      usersRoles6.map((obj) => {
        delete obj._id;
        return obj;
      }),
      [
        {
          role: { _id: "user" },
          scope: null,
          user: { _id: users.eve },
          inheritedRoles: [{ _id: "user" }],
        },
      ]
    );
  }
);

Tinytest.addAsync(
  "roles -delete role with overlapping hierarchical roles",
  async function (test) {
    await clearData();
    await Roles.createRoleAsync("role1");
    await Roles.createRoleAsync("role2");
    await Roles.createRoleAsync("COMMON_PERMISSION_1");
    await Roles.createRoleAsync("COMMON_PERMISSION_2");
    await Roles.createRoleAsync("COMMON_PERMISSION_3");
    await Roles.createRoleAsync("EXTRA_PERMISSION_ROLE_1");
    await Roles.createRoleAsync("EXTRA_PERMISSION_ROLE_2");

    await Roles.addRolesToParentAsync("COMMON_PERMISSION_1", "role1");
    await Roles.addRolesToParentAsync("COMMON_PERMISSION_2", "role1");
    await Roles.addRolesToParentAsync("COMMON_PERMISSION_3", "role1");
    await Roles.addRolesToParentAsync("EXTRA_PERMISSION_ROLE_1", "role1");

    await Roles.addRolesToParentAsync("COMMON_PERMISSION_1", "role2");
    await Roles.addRolesToParentAsync("COMMON_PERMISSION_2", "role2");
    await Roles.addRolesToParentAsync("COMMON_PERMISSION_3", "role2");
    await Roles.addRolesToParentAsync("EXTRA_PERMISSION_ROLE_2", "role2");

    await Roles.addUsersToRolesAsync(users.eve, "role1");
    await Roles.addUsersToRolesAsync(users.eve, "role2");

    test.isTrue(
      await Roles.userIsInRoleAsync(users.eve, "COMMON_PERMISSION_1")
    );
    test.isTrue(
      await Roles.userIsInRoleAsync(users.eve, "EXTRA_PERMISSION_ROLE_1")
    );
    test.isTrue(
      await Roles.userIsInRoleAsync(users.eve, "EXTRA_PERMISSION_ROLE_2")
    );

    const usersRoles = await Roles.getRolesForUserAsync(users.eve, {
      anyScope: true,
      fullObjects: true,
    });
    sameDeepMembers(
      test,
      usersRoles.map((obj) => {
        delete obj._id;
        return obj;
      }),
      [
        {
          role: { _id: "role1" },
          scope: null,
          user: { _id: users.eve },
          inheritedRoles: [
            { _id: "role1" },
            { _id: "COMMON_PERMISSION_1" },
            { _id: "COMMON_PERMISSION_2" },
            { _id: "COMMON_PERMISSION_3" },
            { _id: "EXTRA_PERMISSION_ROLE_1" },
          ],
        },
        {
          role: { _id: "role2" },
          scope: null,
          user: { _id: users.eve },
          inheritedRoles: [
            { _id: "role2" },
            { _id: "COMMON_PERMISSION_1" },
            { _id: "COMMON_PERMISSION_2" },
            { _id: "COMMON_PERMISSION_3" },
            { _id: "EXTRA_PERMISSION_ROLE_2" },
          ],
        },
      ]
    );

    await Roles.removeUsersFromRolesAsync(users.eve, "role2");

    test.isTrue(
      await Roles.userIsInRoleAsync(users.eve, "COMMON_PERMISSION_1")
    );
    test.isTrue(
      await Roles.userIsInRoleAsync(users.eve, "EXTRA_PERMISSION_ROLE_1")
    );
    test.isFalse(
      await Roles.userIsInRoleAsync(users.eve, "EXTRA_PERMISSION_ROLE_2")
    );

    const usersRoles2 = await Roles.getRolesForUserAsync(users.eve, {
      anyScope: true,
      fullObjects: true,
    });
    sameDeepMembers(
      test,
      usersRoles2.map((obj) => {
        delete obj._id;
        return obj;
      }),
      [
        {
          role: { _id: "role1" },
          scope: null,
          user: { _id: users.eve },
          inheritedRoles: [
            { _id: "role1" },
            { _id: "COMMON_PERMISSION_1" },
            { _id: "COMMON_PERMISSION_2" },
            { _id: "COMMON_PERMISSION_3" },
            { _id: "EXTRA_PERMISSION_ROLE_1" },
          ],
        },
      ]
    );

    await Roles.addUsersToRolesAsync(users.eve, "role2");

    test.isTrue(
      await Roles.userIsInRoleAsync(users.eve, "COMMON_PERMISSION_1")
    );
    test.isTrue(
      await Roles.userIsInRoleAsync(users.eve, "EXTRA_PERMISSION_ROLE_1")
    );
    test.isTrue(
      await Roles.userIsInRoleAsync(users.eve, "EXTRA_PERMISSION_ROLE_2")
    );

    const usersRoles3 = await Roles.getRolesForUserAsync(users.eve, {
      anyScope: true,
      fullObjects: true,
    });
    sameDeepMembers(
      test,
      usersRoles3.map((obj) => {
        delete obj._id;
        return obj;
      }),
      [
        {
          role: { _id: "role1" },
          scope: null,
          user: { _id: users.eve },
          inheritedRoles: [
            { _id: "role1" },
            { _id: "COMMON_PERMISSION_1" },
            { _id: "COMMON_PERMISSION_2" },
            { _id: "COMMON_PERMISSION_3" },
            { _id: "EXTRA_PERMISSION_ROLE_1" },
          ],
        },
        {
          role: { _id: "role2" },
          scope: null,
          user: { _id: users.eve },
          inheritedRoles: [
            { _id: "role2" },
            { _id: "COMMON_PERMISSION_1" },
            { _id: "COMMON_PERMISSION_2" },
            { _id: "COMMON_PERMISSION_3" },
            { _id: "EXTRA_PERMISSION_ROLE_2" },
          ],
        },
      ]
    );

    await Roles.deleteRoleAsync("role2");

    test.isTrue(
      await Roles.userIsInRoleAsync(users.eve, "COMMON_PERMISSION_1")
    );
    test.isTrue(
      await Roles.userIsInRoleAsync(users.eve, "EXTRA_PERMISSION_ROLE_1")
    );
    test.isFalse(
      await Roles.userIsInRoleAsync(users.eve, "EXTRA_PERMISSION_ROLE_2")
    );

    const usersRoles4 = await Roles.getRolesForUserAsync(users.eve, {
      anyScope: true,
      fullObjects: true,
    });
    sameDeepMembers(
      test,
      usersRoles4.map((obj) => {
        delete obj._id;
        return obj;
      }),
      [
        {
          role: { _id: "role1" },
          scope: null,
          user: { _id: users.eve },
          inheritedRoles: [
            { _id: "role1" },
            { _id: "COMMON_PERMISSION_1" },
            { _id: "COMMON_PERMISSION_2" },
            { _id: "COMMON_PERMISSION_3" },
            { _id: "EXTRA_PERMISSION_ROLE_1" },
          ],
        },
      ]
    );
  }
);

Tinytest.addAsync("roles -set parent on assigned role", async function (test) {
  await clearData();
  await Roles.createRoleAsync("admin");
  await Roles.createRoleAsync("EDIT_PERMISSION");

  await Roles.addUsersToRolesAsync(users.eve, "EDIT_PERMISSION");

  test.isTrue(await Roles.userIsInRoleAsync(users.eve, "EDIT_PERMISSION"));
  test.isFalse(await Roles.userIsInRoleAsync(users.eve, "admin"));

  const usersRoles = await Roles.getRolesForUserAsync(users.eve, {
    anyScope: true,
    fullObjects: true,
  });
  sameDeepMembers(
    test,
    usersRoles.map((obj) => {
      delete obj._id;
      return obj;
    }),
    [
      {
        role: { _id: "EDIT_PERMISSION" },
        scope: null,
        user: { _id: users.eve },
        inheritedRoles: [{ _id: "EDIT_PERMISSION" }],
      },
    ]
  );

  await Roles.addRolesToParentAsync("EDIT_PERMISSION", "admin");

  test.isTrue(await Roles.userIsInRoleAsync(users.eve, "EDIT_PERMISSION"));
  test.isFalse(await Roles.userIsInRoleAsync(users.eve, "admin"));

  const usersRoles2 = await Roles.getRolesForUserAsync(users.eve, {
    anyScope: true,
    fullObjects: true,
  });
  sameDeepMembers(
    test,
    usersRoles2.map((obj) => {
      delete obj._id;
      return obj;
    }),
    [
      {
        role: { _id: "EDIT_PERMISSION" },
        scope: null,
        user: { _id: users.eve },
        inheritedRoles: [{ _id: "EDIT_PERMISSION" }],
      },
    ]
  );
});

Tinytest.addAsync(
  "roles -remove parent on assigned role",
  async function (test) {
    await clearData();
    await Roles.createRoleAsync("admin");
    await Roles.createRoleAsync("EDIT_PERMISSION");

    await Roles.addRolesToParentAsync("EDIT_PERMISSION", "admin");

    await Roles.addUsersToRolesAsync(users.eve, "EDIT_PERMISSION");

    test.isTrue(await Roles.userIsInRoleAsync(users.eve, "EDIT_PERMISSION"));
    test.isFalse(await Roles.userIsInRoleAsync(users.eve, "admin"));

    const usersRoles = await Roles.getRolesForUserAsync(users.eve, {
      anyScope: true,
      fullObjects: true,
    });
    sameDeepMembers(
      test,
      usersRoles.map((obj) => {
        delete obj._id;
        return obj;
      }),
      [
        {
          role: { _id: "EDIT_PERMISSION" },
          scope: null,
          user: { _id: users.eve },
          inheritedRoles: [{ _id: "EDIT_PERMISSION" }],
        },
      ]
    );

    await Roles.removeRolesFromParentAsync("EDIT_PERMISSION", "admin");

    test.isTrue(await Roles.userIsInRoleAsync(users.eve, "EDIT_PERMISSION"));
    test.isFalse(await Roles.userIsInRoleAsync(users.eve, "admin"));

    const usersRoles2 = await Roles.getRolesForUserAsync(users.eve, {
      anyScope: true,
      fullObjects: true,
    });
    sameDeepMembers(
      test,
      usersRoles2.map((obj) => {
        delete obj._id;
        return obj;
      }),
      [
        {
          role: { _id: "EDIT_PERMISSION" },
          scope: null,
          user: { _id: users.eve },
          inheritedRoles: [{ _id: "EDIT_PERMISSION" }],
        },
      ]
    );
  }
);

Tinytest.addAsync(
  "roles -adding and removing extra role parents",
  async function (test) {
    await clearData();
    await Roles.createRoleAsync("admin");
    await Roles.createRoleAsync("user");
    await Roles.createRoleAsync("EDIT_PERMISSION");

    await Roles.addRolesToParentAsync("EDIT_PERMISSION", "admin");

    await Roles.addUsersToRolesAsync(users.eve, "EDIT_PERMISSION");

    test.isTrue(await Roles.userIsInRoleAsync(users.eve, "EDIT_PERMISSION"));
    test.isFalse(await Roles.userIsInRoleAsync(users.eve, "admin"));

    const usersRoles = await Roles.getRolesForUserAsync(users.eve, {
      anyScope: true,
      fullObjects: true,
    });
    sameDeepMembers(
      test,
      usersRoles.map((obj) => {
        delete obj._id;
        return obj;
      }),
      [
        {
          role: { _id: "EDIT_PERMISSION" },
          scope: null,
          user: { _id: users.eve },
          inheritedRoles: [{ _id: "EDIT_PERMISSION" }],
        },
      ]
    );

    await Roles.addRolesToParentAsync("EDIT_PERMISSION", "user");

    test.isTrue(await Roles.userIsInRoleAsync(users.eve, "EDIT_PERMISSION"));
    test.isFalse(await Roles.userIsInRoleAsync(users.eve, "admin"));

    const usersRoles2 = await Roles.getRolesForUserAsync(users.eve, {
      anyScope: true,
      fullObjects: true,
    });
    sameDeepMembers(
      test,
      usersRoles2.map((obj) => {
        delete obj._id;
        return obj;
      }),
      [
        {
          role: { _id: "EDIT_PERMISSION" },
          scope: null,
          user: { _id: users.eve },
          inheritedRoles: [{ _id: "EDIT_PERMISSION" }],
        },
      ]
    );

    await Roles.removeRolesFromParentAsync("EDIT_PERMISSION", "user");

    test.isTrue(await Roles.userIsInRoleAsync(users.eve, "EDIT_PERMISSION"));
    test.isFalse(await Roles.userIsInRoleAsync(users.eve, "admin"));

    const usersRoles3 = await Roles.getRolesForUserAsync(users.eve, {
      anyScope: true,
      fullObjects: true,
    });
    sameDeepMembers(
      test,
      usersRoles3.map((obj) => {
        delete obj._id;
        return obj;
      }),
      [
        {
          role: { _id: "EDIT_PERMISSION" },
          scope: null,
          user: { _id: users.eve },
          inheritedRoles: [{ _id: "EDIT_PERMISSION" }],
        },
      ]
    );
  }
);

Tinytest.addAsync("roles -cyclic roles", async function (test) {
  await clearData();
  await Roles.createRoleAsync("admin");
  await Roles.createRoleAsync("editor");
  await Roles.createRoleAsync("user");

  await Roles.addRolesToParentAsync("editor", "admin");
  await Roles.addRolesToParentAsync("user", "editor");

  try {
    await Roles.addRolesToParentAsync("admin", "user");
    test.fail("Should throw cycle error");
  } catch (e) {
    test.matches(e.message, /form a cycle/);
  }
});

Tinytest.addAsync(
  "roles -userIsInRole returns false for unknown roles",
  async function (test) {
    await clearData();
    await Roles.createRoleAsync("admin");
    await Roles.createRoleAsync("user");
    await Roles.createRoleAsync("editor");
    await Roles.addUsersToRolesAsync(users.eve, ["admin", "user"]);
    await Roles.addUsersToRolesAsync(users.eve, ["editor"]);

    test.isFalse(await Roles.userIsInRoleAsync(users.eve, "unknown"));
    test.isFalse(await Roles.userIsInRoleAsync(users.eve, []));
    test.isFalse(await Roles.userIsInRoleAsync(users.eve, null));
    test.isFalse(await Roles.userIsInRoleAsync(users.eve, undefined));

    test.isFalse(
      await Roles.userIsInRoleAsync(users.eve, "unknown", { anyScope: true })
    );
    test.isFalse(
      await Roles.userIsInRoleAsync(users.eve, [], { anyScope: true })
    );
    test.isFalse(
      await Roles.userIsInRoleAsync(users.eve, null, { anyScope: true })
    );
    test.isFalse(
      await Roles.userIsInRoleAsync(users.eve, undefined, { anyScope: true })
    );

    test.isFalse(
      await Roles.userIsInRoleAsync(
        users.eve,
        ["Role1", "Role2", undefined],
        "GroupName"
      )
    );
  }
);

Tinytest.addAsync(
  "roles -userIsInRole returns false if user is a function",
  async function (test) {
    await clearData();
    await Roles.createRoleAsync("admin");
    await Roles.addUsersToRolesAsync(users.eve, ["admin"]);

    test.isFalse(await Roles.userIsInRoleAsync(() => {}, "admin"));
  }
);

Tinytest.addAsync(
  "roles -returns false for unknown roles",
  async function (test) {
    await clearData();
    await Roles.createRoleAsync("admin");

    test.isFalse(await Roles.isParentOfAsync("admin", "unknown"));
    test.isFalse(await Roles.isParentOfAsync("admin", null));
    test.isFalse(await Roles.isParentOfAsync("admin", undefined));

    test.isFalse(await Roles.isParentOfAsync("unknown", "admin"));
    test.isFalse(await Roles.isParentOfAsync(null, "admin"));
    test.isFalse(await Roles.isParentOfAsync(undefined, "admin"));
  }
);

Tinytest.addAsync(
  "roles -returns false if role is not parent of",
  async function (test) {
    await clearData();
    await Roles.createRoleAsync("admin");
    await Roles.createRoleAsync("editor");
    await Roles.createRoleAsync("user");
    await Roles.addRolesToParentAsync(["editor"], "admin");
    await Roles.addRolesToParentAsync(["user"], "editor");

    test.isFalse(await Roles.isParentOfAsync("user", "admin"));
    test.isFalse(await Roles.isParentOfAsync("editor", "admin"));
  }
);

Tinytest.addAsync(
  "roles -returns true if role is parent of the demanded role",
  async function (test) {
    await clearData();
    await Roles.createRoleAsync("admin");
    await Roles.createRoleAsync("editor");
    await Roles.createRoleAsync("user");
    await Roles.addRolesToParentAsync(["editor"], "admin");
    await Roles.addRolesToParentAsync(["user"], "editor");

    test.isTrue(await Roles.isParentOfAsync("admin", "user"));
    test.isTrue(await Roles.isParentOfAsync("editor", "user"));
    test.isTrue(await Roles.isParentOfAsync("admin", "editor"));

    test.isTrue(await Roles.isParentOfAsync("admin", "admin"));
    test.isTrue(await Roles.isParentOfAsync("editor", "editor"));
    test.isTrue(await Roles.isParentOfAsync("user", "user"));
  }
);

// here

Tinytest.addAsync(
  "should not return null entries if user has no roles for scope",
  async function (test) {
    await clearData();
    await Roles.createRoleAsync("editor");

    const userId = users.eve;
    let userObj;

    // by userId
    sameMembers(test,await Roles.getRolesForUserAsync(userId, "scope1"), []);
    sameMembers(test,await Roles.getRolesForUserAsync(userId), []);

    // by user object
    userObj = await Meteor.users.findOneAsync({ _id: userId });
    sameMembers(test,await Roles.getRolesForUserAsync(userObj, "scope1"), []);
    sameMembers(test,await Roles.getRolesForUserAsync(userObj), []);

    await Roles.addUsersToRolesAsync(
      [users.eve],
      ["editor"],
      Roles.GLOBAL_SCOPE
    );

    // by userId
    sameMembers(test,await Roles.getRolesForUserAsync(userId, "scope1"), [
      "editor",
    ]);
    sameMembers(test,await Roles.getRolesForUserAsync(userId), ["editor"]);

    // by user object
    userObj = await Meteor.users.findOneAsync({ _id: userId });
    sameMembers(test,await Roles.getRolesForUserAsync(userObj, "scope1"), [
      "editor",
    ]);
    sameMembers(test,await Roles.getRolesForUserAsync(userObj), ["editor"]);
  }
);

Tinytest.addAsync(
  "should not fail during a call of addUsersToRoles",
  async function (test) {
    await clearData();
    await Roles.createRoleAsync("editor");

    const userId = users.eve;
    const promises = [];
    const interval = setInterval(() => {
      promises.push(
        Promise.resolve().then(async () => {
          await Roles.getRolesForUserAsync(userId);
        })
      );
    }, 0);

    await Roles.addUsersToRolesAsync(
      [users.eve],
      ["editor"],
      Roles.GLOBAL_SCOPE
    );
    clearInterval(interval);

    return Promise.all(promises);
  }
);

Tinytest.addAsync(
  "returns an empty list of scopes for null as user-id",
  async function (test) {
    await clearData();
    sameMembers(test,await Roles.getScopesForUserAsync(undefined), []);
    sameMembers(test,await Roles.getScopesForUserAsync(null), []);
    sameMembers(test,await Roles.getScopesForUserAsync("foo"), []);
    sameMembers(test,await Roles.getScopesForUserAsync({}), []);
    sameMembers(test,await Roles.getScopesForUserAsync({ _id: "foo" }), []);
  }
);

Tinytest.addAsync("can get all scopes for user", async function (test) {
  await clearData();
  await Roles.createRoleAsync("admin");
  await Roles.createRoleAsync("user");
  await Roles.createRoleAsync("editor");

  const userId = users.eve;

  await Roles.addUsersToRolesAsync([users.eve], ["editor"], "scope1");
  await Roles.addUsersToRolesAsync([users.eve], ["admin", "user"], "scope2");

  // by userId
  sameMembers(test,await Roles.getScopesForUserAsync(userId), [
    "scope1",
    "scope2",
  ]);

  // by user object
  const userObj = await Meteor.users.findOneAsync({ _id: userId });
  sameMembers(test,await Roles.getScopesForUserAsync(userObj), [
    "scope1",
    "scope2",
  ]);
});

Tinytest.addAsync("can get all scopes for user by role", async function (test) {
  await clearData();
  await Roles.createRoleAsync("admin");
  await Roles.createRoleAsync("user");
  await Roles.createRoleAsync("editor");

  const userId = users.eve;

  await Roles.addUsersToRolesAsync([users.eve], ["editor"], "scope1");
  await Roles.addUsersToRolesAsync([users.eve], ["editor", "user"], "scope2");

  // by userId
  sameMembers(test,await Roles.getScopesForUserAsync(userId, "user"), [
    "scope2",
  ]);
  sameMembers(test,await Roles.getScopesForUserAsync(userId, "editor"), [
    "scope1",
    "scope2",
  ]);
  sameMembers(test,await Roles.getScopesForUserAsync(userId, "admin"), []);

  // by user object
  const userObj = await Meteor.users.findOneAsync({ _id: userId });
  sameMembers(test,await Roles.getScopesForUserAsync(userObj, "user"), [
    "scope2",
  ]);
  sameMembers(test,await Roles.getScopesForUserAsync(userObj, "editor"), [
    "scope1",
    "scope2",
  ]);
  sameMembers(test,await Roles.getScopesForUserAsync(userObj, "admin"), []);
});

Tinytest.addAsync(
  "getScopesForUser returns [] when not using scopes",
  async function (test) {
    await clearData();
    await Roles.createRoleAsync("user");
    await Roles.createRoleAsync("editor");

    const userId = users.eve;

    await Roles.addUsersToRolesAsync([users.eve], ["editor", "user"]);

    // by userId
    sameMembers(test,await Roles.getScopesForUserAsync(userId), []);
    sameMembers(test,await Roles.getScopesForUserAsync(userId, "editor"), []);
    sameMembers(test,
      await Roles.getScopesForUserAsync(userId, ["editor"]),
      []
    );
    sameMembers(test,
      await Roles.getScopesForUserAsync(userId, ["editor", "user"]),
      []
    );

    // by user object
    const userObj = await Meteor.users.findOneAsync({ _id: userId });
    sameMembers(test,await Roles.getScopesForUserAsync(userObj), []);
    sameMembers(test,
      await Roles.getScopesForUserAsync(userObj, "editor"),
      []
    );
    sameMembers(test,
      await Roles.getScopesForUserAsync(userObj, ["editor"]),
      []
    );
    sameMembers(test,
      await Roles.getScopesForUserAsync(userObj, ["editor", "user"]),
      []
    );
  }
);
