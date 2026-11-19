import {
  createToolExtensionRegistry,
  createCordovaFallbackExtension,
} from './registry.js';
import {
  createRegistryForProject,
} from './project.js';
import {
  normalizeToolExtension,
} from './schema.js';

const capacitorExtension = {
  id: 'meteor:capacitor',
  label: 'Meteor Capacitor',
  apiVersion: '1.0',
  packageName: 'capacitor',
  platforms: [
    {
      name: 'android',
      kind: 'mobile',
      provider: 'capacitor',
      claimsBuiltIn: true,
      aliases: ['capacitor:android'],
      buildTargets: ['web.capacitor'],
      nativeProjectDir: 'android',
      hcpMode: 'native-runtime',
    },
  ],
  buildTargets: [
    {
      name: 'web.capacitor',
      baseArch: 'web.cordova',
      outputKind: 'web-dir',
      runtime: 'native-webview',
      hcpMode: 'native-runtime',
    },
  ],
  capabilities: {
    run: true,
    build: true,
    addPlatform: true,
    removePlatform: true,
  },
};

describe('tool extension schema', () => {
  test('normalizes valid metadata without mutating input', () => {
    const input = structuredClone(capacitorExtension);
    const normalized = normalizeToolExtension(input, {
      packageName: 'capacitor',
    });

    expect(normalized).toMatchObject({
      id: 'meteor:capacitor',
      packageName: 'capacitor',
      platforms: [
        {
          name: 'android',
          provider: 'capacitor',
          aliases: ['capacitor:android'],
        },
      ],
    });
    expect(input).toEqual(capacitorExtension);
  });

  test('rejects unsupported hcp modes', () => {
    const input = structuredClone(capacitorExtension);
    input.platforms[0].hcpMode = 'magic';

    expect(() => normalizeToolExtension(input, {
      packageName: 'capacitor',
    })).toThrow(/unsupported hcp mode/i);
  });

  test('rejects missing provider ids', () => {
    const input = structuredClone(capacitorExtension);
    delete input.id;

    expect(() => normalizeToolExtension(input, {
      packageName: 'capacitor',
    })).toThrow(/id is required/i);
  });
});

describe('tool extension registry', () => {
  test('resolves Cordova fallback for android without an installed claimant', () => {
    const registry = createToolExtensionRegistry({
      extensions: [createCordovaFallbackExtension()],
    });

    expect(registry.resolvePlatform('android')).toMatchObject({
      platform: { name: 'android', provider: 'cordova' },
      extension: { id: 'meteor:cordova-fallback' },
      isFallback: true,
    });
  });

  test('resolves installed Capacitor before Cordova fallback', () => {
    const registry = createToolExtensionRegistry({
      extensions: [
        createCordovaFallbackExtension(),
        capacitorExtension,
      ],
    });

    expect(registry.resolvePlatform('android')).toMatchObject({
      platform: { name: 'android', provider: 'capacitor' },
      extension: { id: 'meteor:capacitor' },
      isFallback: false,
    });
  });

  test('resolves provider aliases', () => {
    const registry = createToolExtensionRegistry({
      extensions: [capacitorExtension],
    });

    expect(registry.resolvePlatform('capacitor:android')).toMatchObject({
      platform: { name: 'android', provider: 'capacitor' },
    });
  });

  test('rejects duplicate installed platform claims', () => {
    const secondClaim = structuredClone(capacitorExtension);
    secondClaim.id = 'meteor:other-native';
    secondClaim.packageName = 'other-native';
    secondClaim.platforms[0].provider = 'other-native';

    const registry = createToolExtensionRegistry({
      extensions: [capacitorExtension, secondClaim],
    });

    expect(() => registry.resolvePlatform('android')).toThrow(/multiple installed packages/i);
  });

  test('returns required base arches from resolved platform build targets', () => {
    const registry = createToolExtensionRegistry({
      extensions: [capacitorExtension],
    });

    expect(registry.getBaseWebArchsForPlatform('android')).toEqual(['web.cordova']);
  });
});

describe('project tool extension registry', () => {
  test('loads tool extensions from built isopacks', async () => {
    const projectContext = {
      packageMap: {
        async eachPackage(iterator) {
          await iterator('capacitor', { kind: 'local' });
        },
      },
      isopackCache: {
        getIsopack(name) {
          expect(name).toBe('capacitor');
          return {
            toolExtensions: [capacitorExtension],
          };
        },
      },
    };

    const registry = await createRegistryForProject(projectContext);

    expect(registry.resolvePlatform('android')).toMatchObject({
      platform: { provider: 'capacitor' },
      isFallback: false,
    });
  });

  test('loads tool extensions from package sources before isopacks exist', async () => {
    const projectContext = {
      packageMap: {
        async eachPackage(iterator) {
          await iterator('capacitor', {
            kind: 'local',
            packageSource: {
              toolExtensions: [capacitorExtension],
            },
          });
        },
      },
    };

    const registry = await createRegistryForProject(projectContext);

    expect(registry.resolvePlatform('android')).toMatchObject({
      platform: { provider: 'capacitor' },
      isFallback: false,
    });
  });
});
