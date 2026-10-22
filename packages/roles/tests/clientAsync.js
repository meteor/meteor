import { Meteor } from "meteor/meteor";
import { Tinytest } from "meteor/tinytest";

// To ensure that the files are loaded for coverage
import "../roles_client";
import "../roles_common_async";

const safeInsert = async (collection, data) => {
  return await collection.insertAsync(data).catch((e) => console.error(e));
};

const roles = ["admin", "editor", "user"];
const users = {
  eve: {
    _id: "eve",
  },
  bob: {
    _id: "bob",
  },
  joe: {
    _id: "joe",
  },
};

async function testUser(test, username, expectedRoles, scope) {
  const user = users[username];

  // test using user object rather than userId to avoid mocking
  for (const role of roles) {
    const expected = expectedRoles.includes(role);
    const msg =
      username + " expected to have '" + role + "' permission but does not";
    const nmsg = username + " had un-expected permission " + role;

    const result = await Roles.userIsInRoleAsync(user._id, role, scope);
    if (expected) {
      test.isTrue(result, msg);
    } else {
      test.isFalse(result, nmsg);
    }
  }
}

async function setupRoles() {
  await safeInsert(Meteor.roleAssignment, {
    user: users.eve,
    role: { _id: "admin" },
    inheritedRoles: [{ _id: "admin" }],
  });
  await safeInsert(Meteor.roleAssignment, {
    user: users.eve,
    role: { _id: "editor" },
    inheritedRoles: [{ _id: "editor" }],
  });

  await safeInsert(Meteor.roleAssignment, {
    user: users.bob,
    role: { _id: "user" },
    inheritedRoles: [{ _id: "user" }],
    scope: "group1",
  });
  await safeInsert(Meteor.roleAssignment, {
    user: users.bob,
    role: { _id: "editor" },
    inheritedRoles: [{ _id: "editor" }],
    scope: "group2",
  });

  await safeInsert(Meteor.roleAssignment, {
    user: users.joe,
    role: { _id: "admin" },
    inheritedRoles: [{ _id: "admin" }],
  });
  await safeInsert(Meteor.roleAssignment, {
    user: users.joe,
    role: { _id: "editor" },
    inheritedRoles: [{ _id: "editor" }],
    scope: "group1",
  });
}

Tinytest.addAsync(
  "roles async - can check current users roles via template helper",
  async (test) => {
    if (!Roles._handlebarsHelpers) {
      // probably running package tests outside of a Meteor app.
      // skip this test.
      return;
    }

    const meteorUserMethod = Meteor.user;
    Meteor.user = function () {
      return users.eve;
    };
    Meteor.subscribe("client_assignments");

    await setupRoles();

    const isInRole = Roles._handlebarsHelpers.isInRole;
    test.equal(typeof isInRole, "function", "'isInRole' helper not registered");

    test.equal(isInRole("admin, editor"), true);
    test.equal(isInRole("admin"), true);
    test.equal(isInRole("unknown"), false);

    Meteor.user = meteorUserMethod;
  }
);

Tinytest.addAsync(
  "roles async - can check if user is in role",
  async (test) => {
    const meteorUserMethod = Meteor.user;
    Meteor.user = function () {
      return users.eve;
    };
    Meteor.subscribe("client_assignments");

    await setupRoles();
    await testUser(test, "eve", ["admin", "editor"]);

    Meteor.user = meteorUserMethod;
  }
);

Tinytest.addAsync(
  "roles async - can check if user is in role by group",
  async (test) => {
    const meteorUserMethod = Meteor.user;
    Meteor.user = function () {
      return users.eve;
    };
    Meteor.subscribe("client_assignments");

    await setupRoles();
    await testUser(test, "bob", ["user"], "group1");
    await testUser(test, "bob", ["editor"], "group2");

    Meteor.user = meteorUserMethod;
  }
);

Tinytest.addAsync(
  "roles async - can check if user is in role with Roles.GLOBAL_GROUP",
  async (test) => {
    const meteorUserMethod = Meteor.user;
    Meteor.user = function () {
      return users.eve;
    };
    Meteor.subscribe("client_assignments");

    await setupRoles();
    await testUser(test, "joe", ["admin"]);
    await testUser(test, "joe", ["admin"], Roles.GLOBAL_GROUP);
    await testUser(test, "joe", ["admin", "editor"], "group1");

    Meteor.user = meteorUserMethod;
  }
);
