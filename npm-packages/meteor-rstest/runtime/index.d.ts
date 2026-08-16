export interface MeteorRstestFileRuntimeOptions {
  rootPath: string;
  projectRoot: string;
  project: 'meteor-runtime-server' | 'meteor-runtime-client';
  testPath: string;
  testNamePattern?: string | RegExp;
  testTimeout: number;
  hookTimeout: number;
  maxConcurrency: number;
  retry: number;
  globals?: boolean;
  clearMocks?: boolean;
  resetMocks?: boolean;
  restoreMocks?: boolean;
  unstubEnvs?: boolean;
  unstubGlobals?: boolean;
  expect?: Record<string, unknown>;
  env?: Record<string, string>;
  silent?: boolean;
  disableConsoleIntercept?: boolean;
  printConsoleTrace?: boolean;
  includeTaskLocation?: boolean;
  generation: number;
  updateSnapshot?: 'none' | 'new' | 'all';
  snapshotFormat?: Record<string, unknown>;
  snapshotEnvironment?: {
    getVersion(): string;
    getHeader(): string;
    resolvePath(filepath: string): Promise<string>;
    resolveRawPath(testPath: string, rawPath: string): Promise<string>;
    saveSnapshotFile(filepath: string, snapshot: string): Promise<void>;
    readSnapshotFile(filepath: string): Promise<string | null>;
    removeSnapshotFile(filepath: string): Promise<void>;
  };
}

export interface MeteorRstestFileRuntime {
  collect(load: () => Promise<unknown>): Promise<void>;
  run(): Promise<Record<string, unknown>>;
  collectAndRun(load: () => Promise<unknown>): Promise<Record<string, unknown>>;
  dispose(): Promise<void>;
}

export const SUPPORTED_RSTEST_VERSION: '0.11.6';

export function createMeteorRstestFileRuntime(
  options: MeteorRstestFileRuntimeOptions,
): Promise<MeteorRstestFileRuntime>;
