module.exports = function (source) {
  return `module.exports = ${JSON.stringify(source.trim().toUpperCase())};`;
};
