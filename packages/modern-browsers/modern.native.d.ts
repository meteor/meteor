export declare function isModern(
  browser: { name: string; major: number; minor?: number; patch?: number; }
): boolean;

export declare function setMinimumBrowserVersions(
  versions: Record<string, number | number[]>,
  source?: string
): void;

export declare function getMinimumBrowserVersions(): Record<string,
  { version: number | number[]; source: string }>;

export declare function calculateHashOfMinimumVersions(): string;
