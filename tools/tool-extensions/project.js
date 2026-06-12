import {
  createCordovaFallbackExtension,
  createToolExtensionRegistry,
} from './registry.js';

export async function createRegistryForProject(projectContext, {
  includeCordovaFallback = true,
} = {}) {
  const extensions = [];

  if (includeCordovaFallback) {
    extensions.push(createCordovaFallbackExtension());
  }

  if (projectContext?.packageMap) {
    await projectContext.packageMap.eachPackage(async (packageName, info = {}) => {
      const packageSourceExtensions = info.packageSource?.toolExtensions || [];
      const isopack = packageSourceExtensions.length
        ? null
        : projectContext.isopackCache?.getIsopack(packageName);
      for (const extension of packageSourceExtensions.length
        ? packageSourceExtensions
        : isopack?.toolExtensions || []) {
        extensions.push({
          ...extension,
          packageName,
        });
      }
    });
  }

  return createToolExtensionRegistry({ extensions });
}
