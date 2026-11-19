// Replacements are supplied by the selected test provider. Isobuild owns module
// loading, while the provider owns the replacement source and npm entry points.
function getModuleReplacement(absPath, replacements = []) {
  const normalizedPath = absPath.replace(/\\/g, '/');
  const replacement = replacements.find(({ module }) =>
    normalizedPath.endsWith(`/node_modules/${module}`)
  );
  return replacement ? replacement.source : null;
}

module.exports = { getModuleReplacement };
