export const revision = 'initial';

export function probe(input: number): number {
  const adjusted = input + 1;
  const doubled = adjusted * 2;
  return doubled;
}

export function fail(): never {
  throw new Error('source map eager failure');
}
