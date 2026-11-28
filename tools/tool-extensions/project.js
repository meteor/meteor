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

  if (projectContext?.isopackCache) {
    extensions.push(...projectContext.isopackCache.getToolExtensions());
  } else if (projectContext?.packageMap) {
    await projectContext.packageMap.eachPackage(async (packageName, info = {}) => {
      for (const extension of info.packageSource?.toolExtensions || []) {
        extensions.push({
          ...extension,
          packageName,
        });
      }
    });
  }

  return createToolExtensionRegistry({ extensions });
}
