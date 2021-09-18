const invariant = require('invariant');
const isMeteorBlockOnlyTest = require('./isMeteorBlockOnlyTest');
const getExecutorsFromTest = require('./getExecutorsFromTest');
const { intersection, difference } = require('./sets');

// Set -> Array -> Set
module.exports = function filterExecutorsByAncestors(
  originalExecutors,
  ancestors
) {
  let executors = new Set([...originalExecutors]);

  for (let i = ancestors.length - 1; i > 0; i -= 1) {
    const current = ancestors[i];
    const parent = ancestors[i - 1];
    if (parent.type === 'IfStatement') {
      if (isMeteorBlockOnlyTest(parent.test)) {
        const executorsFromTest = getExecutorsFromTest(parent.test);
        if (parent.consequent === current) {
          executors = intersection(executors, executorsFromTest);
        } else if (parent.alternate === current) {
          executors = difference(executors, executorsFromTest);
        } else {
          invariant(
            false,
            'Block is neither consequent nor alternate of parent'
          );
        }
      }
    }
  }

  return executors;
};
