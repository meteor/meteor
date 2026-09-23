import type { BasicSourceMapConsumer, IndexedSourceMapConsumer, SourceNode } from 'source-map';
import { fromStringWithSourceMap, MappingConsumer } from './compact-source-node';

// Compile-only contracts: this function is never executed.
export function checkContracts(
  basic: BasicSourceMapConsumer,
  indexed: IndexedSourceMapConsumer,
  consumer: MappingConsumer,
): SourceNode {
  fromStringWithSourceMap('', basic);
  fromStringWithSourceMap('', indexed);

  // @ts-expect-error Generated code must be text.
  fromStringWithSourceMap(123, consumer);
  // @ts-expect-error A raw map is not a decoded consumer.
  fromStringWithSourceMap('', { version: 3, mappings: '' });
  // @ts-expect-error Source lists are read-only to the converter.
  consumer.sources.push('mutated.js');
  consumer.eachMapping(mapping => {
    // @ts-expect-error Mapping coordinates are read-only.
    mapping.originalLine = 1;
  });

  return fromStringWithSourceMap('', consumer);
}
