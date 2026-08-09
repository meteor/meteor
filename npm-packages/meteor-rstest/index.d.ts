import type { RstestConfig } from '@rstest/core';

export interface MeteorRstestContext {
  readonly schemaVersion: 1;
  readonly appRoot: string;
  readonly configRoot: string;
  readonly harnessRoot: string;
  readonly localDir: string;
  readonly command: 'test' | 'test-packages';
  readonly once: boolean;
  readonly verbose: boolean;
  readonly fullApp: boolean;
  readonly packageTests: boolean;
  readonly phase: 'native' | 'external';
  readonly client: boolean;
  readonly server: boolean;
  readonly architectures: readonly string[];
}

export type MeteorRstestConfigFactory = (
  context: MeteorRstestContext
) => RstestConfig | Promise<RstestConfig>;

export function defineConfig(config: RstestConfig): RstestConfig;
export function defineConfig(factory: MeteorRstestConfigFactory): () => Promise<RstestConfig>;
export default defineConfig;
