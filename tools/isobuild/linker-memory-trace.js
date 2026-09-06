const MIN_CODE_UNITS = 1024 * 1024;
const TRACE_PREFIX = '[linker-memory] ';

/**
 * Create an investigation-only logger without keeping references to source trees.
 * Heap values describe the whole process, including garbage awaiting collection;
 * cache entry counts do not measure retained bytes. Disabled tracing never reads
 * input metadata or samples memory. The size threshold is in UTF-16 code units.
 *
 * @param {boolean} enabled
 * @param {(line: string) => void} write
 * @returns {(event: string, file: {source: string, sourcePath?: string,
 *   bundleArch: string, sourceMap?: unknown}, cache: {size: number}) => void}
 */
function createMemoryTrace(enabled, write) {
  if (!enabled) {
    return () => {};
  }

  return (event, file, cache) => {
    if (file.source.length < MIN_CODE_UNITS) {
      return;
    }

    write(TRACE_PREFIX + JSON.stringify({
      event,
      arch: file.bundleArch,
      sourcePath: file.sourcePath,
      codeUnits: file.source.length,
      hasMap: Boolean(file.sourceMap),
      cacheEntries: cache.size,
      uptimeSeconds: process.uptime(),
      memory: process.memoryUsage(),
    }));
  };
}

exports.createMemoryTrace = createMemoryTrace;
