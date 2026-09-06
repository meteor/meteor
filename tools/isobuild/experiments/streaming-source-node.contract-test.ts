import { StreamingMappedSource, serializeStreamingSource, shouldStreamMappedSource } from './streaming-source-node';

// @ts-expect-error A source map must not be an arbitrary scalar.
new StreamingMappedSource('code', 42);

const fragment = new StreamingMappedSource('code', '{"version":3}');
// @ts-expect-error Cached fragment inputs are read-only.
fragment.code = 'changed';
// @ts-expect-error Serialization requires a SourceNode tree, not a code string.
serializeStreamingSource('code');

// @ts-expect-error Unknown policies must not enter the typed selection boundary.
shouldStreamMappedSource('unknown', 100);
