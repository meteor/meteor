const filterExecutorsByAncestors = require('./filterExecutorsByAncestors');
const getExecutorsByEnv = require('./getExecutorsByEnv');

// ENVIRONMENT -> Context -> Set
module.exports = function getExecutors(env, ancestors) {
  return filterExecutorsByAncestors(getExecutorsByEnv(env), ancestors);
};
