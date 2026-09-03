/**
 * @module jobs/tests/publication-test
 * @summary Tests for Meteor publications.
 *
 * Full publication testing requires a DDP client, which is not
 * available in tinytest server-side tests. These tests verify that
 * the publications are registered in Meteor.server.publish_handlers.
 */

Tinytest.add('jobs - publications - jobs.status publication is registered', function (test) {
  const handlers = Meteor.server.publish_handlers;
  test.isNotUndefined(handlers['jobs.status'], 'jobs.status should be a registered publication');
  test.equal(typeof handlers['jobs.status'], 'function');
});

Tinytest.add('jobs - publications - jobs.history publication is registered', function (test) {
  const handlers = Meteor.server.publish_handlers;
  test.isNotUndefined(handlers['jobs.history'], 'jobs.history should be a registered publication');
  test.equal(typeof handlers['jobs.history'], 'function');
});

Tinytest.add('jobs - publications - jobs.job publication is registered', function (test) {
  const handlers = Meteor.server.publish_handlers;
  test.isNotUndefined(handlers['jobs.job'], 'jobs.job should be a registered publication');
  test.equal(typeof handlers['jobs.job'], 'function');
});
