const invariant = require('invariant');

// Set -> Set -> Set
module.exports.difference = (a, b) => {
  invariant(!!a, 'difference: Set a is not defined');
  invariant(!!b, 'difference: Set b is not defined');
  return new Set([...a].filter(x => !b.has(x)));
};

// Set -> Set -> Set
module.exports.union = (a, b) => {
  invariant(!!a, 'union: Set a is not defined');
  invariant(!!b, 'union: Set b is not defined');
  return new Set([...a, ...b]);
};

// Set -> Set -> Set
module.exports.intersection = (a, b) => {
  invariant(!!a, 'intersection: Set a is not defined');
  invariant(!!b, 'intersection: Set b is not defined');
  return new Set([...a].filter(element => b.has(element)));
};
