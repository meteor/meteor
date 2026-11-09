#!/usr/bin/env node

const { parseArgs } = require('node:util');
const { getTestGroupMatrix, TEST_GROUPS } = require('../test-groups');

try {
  const { values } = parseArgs({
    options: {
      json: { type: 'boolean', default: false },
      workflow: { type: 'string' },
    },
  });
  if (values.workflow && !['e2e', 'accounts'].includes(values.workflow)) {
    throw new Error('Workflow must be e2e or accounts.');
  }

  if (values.json) {
    console.log(JSON.stringify(getTestGroupMatrix(values.workflow || 'e2e')));
  } else {
    for (const [name, group] of Object.entries(TEST_GROUPS)) {
      const workflow = group.workflow || 'e2e';
      if (values.workflow && workflow !== values.workflow) continue;
      console.log(`${name.padEnd(19)} ${group.label} (${workflow}${group.fallback ? ', fallback' : ''})`);
    }
    console.log('\nRun from the repository root: npm run test:e2e:group -- <group>');
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
