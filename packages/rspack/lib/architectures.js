import {
  getMeteorAppPackageJson,
  getMeteorToolsRequire,
  isMeteorAppTest,
  isMeteorAppTestFullApp,
} from 'meteor/tools-core/lib/meteor';

const clientArchitectures = ['web.browser', 'web.browser.legacy', 'web.cordova'];
const { mapWhereToArches, mostSpecificMatch, isLegacyArch } =
  getMeteorToolsRequire('utils/archinfo');

function entryMap(module) {
  if (!module || typeof module !== 'object') return {};
  return Object.fromEntries(Object.entries(module).flatMap(([key, entry]) =>
    mapWhereToArches(key).map(arch => [arch, entry])
  ));
}

function resolveEntry(module, arch) {
  if (typeof module === 'string' || module === false) return module;
  const entries = entryMap(module);
  return entries[mostSpecificMatch(arch, Object.keys(entries))];
}

// Explicit client architectures use the same Rspack pipeline as mainModule.client.
// Read the application's original configuration, before replacing its entries.
export function getClientArchitectureEntries({
  isTest = isMeteorAppTest(),
  isTestFullApp = isMeteorAppTestFullApp(),
} = {}) {
  const { mainModule, testModule } = getMeteorAppPackageJson()?.meteor || {};
  const mainEntries = entryMap(mainModule);
  const testEntries = entryMap(testModule);
  const explicitEntries = isTest
    ? { ...(isTestFullApp && mainEntries), ...testEntries }
    : mainEntries;

  return clientArchitectures
    .filter(arch => Object.hasOwn(explicitEntries, arch))
    .map(arch => ({
      arch,
      isLegacy: isLegacyArch(arch),
      isClient: true,
      isMain: !isTest,
      isTest,
      isTestFullApp,
      entryFile: resolveEntry(isTest ? testModule : mainModule, arch),
      mainEntryFile: isTestFullApp ? resolveEntry(mainModule, arch) : undefined,
    }))
    .filter(({ entryFile, mainEntryFile }) =>
      typeof entryFile === 'string' || typeof mainEntryFile === 'string'
    );
}

export function isClientArchitectureIncluded(arch) {
  return !global.includedWebArchs || global.includedWebArchs.includes(arch);
}

export function getDefaultClientScriptArchitectures() {
  const entries = entryMap(getMeteorAppPackageJson()?.meteor?.mainModule);
  return ['web.browser', 'web.browser.legacy'].filter(arch => {
    const match = mostSpecificMatch(arch, Object.keys(entries));
    return !match || match === 'web';
  });
}
