const FILE_RELATIVE = /^\.\.?\//;
const URL_OR_ABSOLUTE = /^(?:[a-z][a-z0-9+.-]*:|\/)/i;

// Meteor reads the sources of a file's source map as app-root paths. Sources that
// start with ./ or ../ are relative to the file instead, so they resolve against its servePath.
export function resolveFileRelativeSources(sourceMap, servePath) {
  if (!sourceMap || !Array.isArray(sourceMap.sources) || !servePath) {
    return sourceMap;
  }

  const sourceRoot = fileRelativeSourceRoot(sourceMap.sourceRoot);
  const sources = sourceMap.sources.map((source) =>
    sourceRoot && !URL_OR_ABSOLUTE.test(source) ? sourceRoot + source : source
  );
  if (!sources.some((source) => FILE_RELATIVE.test(source))) {
    return sourceMap;
  }

  const directory = servePath.replace(/^\//, '').split('/').slice(0, -1);
  const { sourceRoot: _joinedIntoSources, ...rest } = sourceMap;
  return {
    ...rest,
    sources: sources.map((source) =>
      FILE_RELATIVE.test(source) ? resolvePath(directory, source) : source
    ),
  };
}

// Meteor's own maps set no sourceRoot, so a relative one comes from a map that follows the spec: relative to the file.
function fileRelativeSourceRoot(sourceRoot) {
  if (!sourceRoot) {
    return '';
  }
  const root = URL_OR_ABSOLUTE.test(sourceRoot) || FILE_RELATIVE.test(sourceRoot) ? sourceRoot : `./${sourceRoot}`;
  return root.replace(/\/?$/, '/');
}

function resolvePath(directory, relativePath) {
  const parts = [...directory];
  for (const part of relativePath.split('/')) {
    if (part === '..' && parts.length > 0 && parts[parts.length - 1] !== '..') {
      parts.pop();
    } else if (part !== '.' && part !== '') {
      parts.push(part);
    }
  }
  return parts.join('/');
}
