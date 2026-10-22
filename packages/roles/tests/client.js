/* eslint-env mocha */
/* global Roles */

import { Meteor } from "meteor/meteor";
import { Tinytest } from "meteor/tinytest";

// To ensure that the files are loaded for coverage
import "../roles_client";

const safeInsert = (collection, data) => {
  try {
    collection.insert(data);
  } catch (e) {}
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

function testUser(test, username, expectedRoles, scope) {
  const user = users[username];

  // test using user object rather than userId to avoid mocking
  for (const role of roles) {
    const expected = expectedRoles.includes(role);
    const msg =
      username + " expected to have '" + role + "' permission but does not";
    const nmsg = username + " had un-expected permission " + role;

    if (expected) {
      test.isTrue(Roles.userIsInRole(user, role, scope), msg);
    } else {
      test.isFalse(Roles.userIsInRole(user, role, scope), nmsg);
    }
  }
}

function setupRoles() {
  safeInsert(Meteor.roleAssignment, {
    user: users.eve,
    role: { _id: "admin" },
    inheritedRoles: [{ _id: "admin" }],
  });
  safeInsert(Meteor.roleAssignment, {
    user: users.eve,
    role: { _id: "editor" },
    inheritedRoles: [{ _id: "editor" }],
  });

  safeInsert(Meteor.roleAssignment, {
    user: users.bob,
    role: { _id: "user" },
    inheritedRoles: [{ _id: "user" }],
    scope: "group1",
  });
  safeInsert(Meteor.roleAssignment, {
    user: users.bob,
    role: { _id: "editor" },
    inheritedRoles: [{ _id: "editor" }],
    scope: "group2",
  });

  safeInsert(Meteor.roleAssignment, {
    user: users.joe,
    role: { _id: "admin" },
    inheritedRoles: [{ _id: "admin" }],
  });
  safeInsert(Meteor.roleAssignment, {
    user: users.joe,
    role: { _id: "editor" },
    inheritedRoles: [{ _id: "editor" }],
    scope: "group1",
  });
}

Tinytest.add(
  "roles - can check current users roles via template helper",
  (test) => {
    if (!Roles._handlebarsHelpers) {
      // probably running package tests outside of a Meteor app.
      // skip this test.
      return;
    }

    const meteorUserMethod = Meteor.user;
    Meteor.user = function () {
      return users.eve;
    };

    setupRoles();

    const isInRole = Roles._handlebarsHelpers.isInRole;
    test.equal(typeof isInRole, "function", "'isInRole' helper not registered");

    test.equal(isInRole("admin, editor"), true);
    test.equal(isInRole("admin"), true);
    test.equal(isInRole("unknown"), false);

    Meteor.user = meteorUserMethod;
  }
);

Tinytest.add("roles - can check if user is in role", (test) => {
  const meteorUserMethod = Meteor.user;
  Meteor.user = function () {
    return users.eve;
  };

  setupRoles();
  testUser(test, "eve", ["admin", "editor"]);

  Meteor.user = meteorUserMethod;
});

Tinytest.add("roles - can check if user is in role by group", (test) => {
  const meteorUserMethod = Meteor.user;
  Meteor.user = function () {
    return users.eve;
  };

  setupRoles();
  testUser(test, "bob", ["user"], "group1");
  testUser(test, "bob", ["editor"], "group2");

  Meteor.user = meteorUserMethod;
});

Tinytest.add(
  "roles - can check if user is in role with Roles.GLOBAL_GROUP",
  (test) => {
    const meteorUserMethod = Meteor.user;
    Meteor.user = function () {
      return users.eve;
    };

    setupRoles();
    testUser(test, "joe", ["admin"]);
    testUser(test, "joe", ["admin"], Roles.GLOBAL_GROUP);
    testUser(test, "joe", ["admin", "editor"], "group1");

    Meteor.user = meteorUserMethod;
  }
);
