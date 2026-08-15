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
  generation: number;
}

export interface MeteorRstestFileRuntime {
  collectAndRun(load: () => Promise<unknown>): Promise<Record<string, unknown>>;
  dispose(): Promise<void>;
}

export const SUPPORTED_RSTEST_VERSION: '0.11.6';

export function createMeteorRstestFileRuntime(
  options: MeteorRstestFileRuntimeOptions,
): Promise<MeteorRstestFileRuntime>;
