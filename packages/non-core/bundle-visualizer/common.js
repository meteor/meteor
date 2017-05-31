export const packageName = "bundle-visualizer";
export const classPrefix = "meteorBundleVisualizer";
export const methodNameStats = `_meteor/${packageName}/stats`;
export const typeBundle = "bundle";
export const typePackage = "package";
export const typeNodeModules = "node_modules";

function capitalizeFirstLetter(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function prefixedClass(className) {
  return `${classPrefix}${capitalizeFirstLetter(className)}`;
}
