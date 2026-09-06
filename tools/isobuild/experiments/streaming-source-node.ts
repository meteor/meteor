/*
 * Copyright (c) 2009-2011, Mozilla Foundation and contributors
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * * Redistributions of source code must retain the above copyright notice, this
 *   list of conditions and the following disclaimer.
 *
 * * Redistributions in binary form must reproduce the above copyright notice,
 *   this list of conditions and the following disclaimer in the documentation
 *   and/or other materials provided with the distribution.
 *
 * * Neither the names of the Mozilla Foundation nor the names of project
 *   contributors may be used to endorse or promote products derived from this
 *   software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

import { SourceMapConsumer, SourceNode } from 'source-map';
import type { CodeWithSourceMap, RawIndexMap, RawSourceMap, StartOfSourceMap } from 'source-map';

export type SourceMapInput = RawSourceMap | RawIndexMap | string;
export type StreamingMode = 'class' | 'stream' | 'hybrid';
export const HYBRID_STREAM_MIN_CODE_UNITS = 1 << 20;

/**
 * Compare a fixed code-length heuristic independently of map parsing or timing.
 * Code length is a proxy for expansion weight, not a bound on mapping density.
 */
export function shouldStreamMappedSource(mode: StreamingMode, codeUnits: number): boolean {
  return mode === 'stream' ||
    (mode === 'hybrid' && codeUnits >= HYBRID_STREAM_MIN_CODE_UNITS);
}

/**
 * Runtime mappings can be unmapped despite the dependency's non-null typings.
 */
export interface SourceLocation {
  readonly source: string | null;
  readonly line: number | null;
  readonly column: number | null;
  readonly name: string | null;
}

export interface DecodedMapping {
  readonly generatedLine: number;
  readonly generatedColumn: number;
  readonly source: string | null | undefined;
  readonly originalLine: number | null;
  readonly originalColumn: number | null;
  readonly name: string | null;
}

export interface MappingConsumer {
  readonly sources: readonly string[];
  eachMapping(callback: (mapping: DecodedMapping) => void): void;
  sourceContentFor(source: string): string | null;
  destroy(): void;
}

export type SegmentSink = (code: string, location: SourceLocation) => void;
type ContentSink = (source: string, content: string) => void;
export interface StreamingDependencies {
  readonly createConsumer?: (map: SourceMapInput) => Promise<MappingConsumer>;
}

const SOURCE_NODE_MARKER = '$$$isSourceNode$$$';
const REGEX_NEWLINE = /(\r?\n)/;
const UNMAPPED: SourceLocation = { source: null, line: null, column: null, name: null };

/**
 * Cache only immutable inputs. A consumer belongs to a serialization invocation,
 * never to this reusable chunk. Ordinary synchronous traversal fails explicitly
 * so an unadapted caller cannot silently omit the mapped source.
 */
export class StreamingMappedSource {
  readonly [SOURCE_NODE_MARKER] = true;

  constructor(readonly code: string, readonly map: SourceMapInput) {}

  walk(): never {
    throw new Error('Streaming mapped sources require serializeStreamingSource');
  }

  walkSourceContents(): never {
    throw new Error('Streaming mapped sources require serializeStreamingSource');
  }
}

interface Walkable {
  walk(callback: SegmentSink): void;
  walkSourceContents(callback: ContentSink): void;
}

function isWalkable(value: unknown): value is Walkable {
  return typeof value === 'object' && value !== null &&
    'walk' in value && typeof value.walk === 'function' &&
    'walkSourceContents' in value && typeof value.walkSourceContents === 'function';
}

interface PreparedSource {
  readonly consumer: MappingConsumer;
  readonly contents: Array<readonly [string, string]>;
  remainingWalks: number;
  destroyed: boolean;
}

function dispose(prepared: PreparedSource): void {
  if (!prepared.destroyed) {
    prepared.destroyed = true;
    prepared.consumer.destroy();
  }
}

/**
 * Preserve source-map 0.7.4 segmentation while emitting each fragment directly.
 * No fragment objects or full mapping table are retained by this function.
 * Keep differential tests when upgrading the dependency's segmentation logic.
 */
export function emitMappedSegments(code: string, consumer: MappingConsumer, sink: SegmentSink): void {
  const remainingLines = code.split(REGEX_NEWLINE);
  let remainingLinesIndex = 0;
  const nextPart = (): string | undefined => remainingLinesIndex < remainingLines.length
    ? remainingLines[remainingLinesIndex++] : undefined;
  const shiftNextLine = (): string => {
    const contents = nextPart();
    const newline = nextPart() || '';
    return `${contents}${newline}`;
  };
  const emit = (fragment: string, mapping: DecodedMapping | null): void => {
    if (fragment === '') return;
    sink(fragment, mapping === null || mapping.source === undefined ? UNMAPPED : {
      source: mapping.source ?? null,
      line: mapping.originalLine ?? null,
      column: mapping.originalColumn ?? null,
      name: mapping.name ?? null,
    });
  };

  let lastGeneratedLine = 1;
  let lastGeneratedColumn = 0;
  let lastMapping: DecodedMapping | null = null;

  consumer.eachMapping(mapping => {
    if (lastMapping !== null) {
      if (lastGeneratedLine < mapping.generatedLine) {
        emit(shiftNextLine(), lastMapping);
        lastGeneratedLine++;
        lastGeneratedColumn = 0;
      } else {
        const line = remainingLines[remainingLinesIndex] || '';
        const length = mapping.generatedColumn - lastGeneratedColumn;
        emit(line.substr(0, length), lastMapping);
        remainingLines[remainingLinesIndex] = line.substr(length);
        lastGeneratedColumn = mapping.generatedColumn;
        lastMapping = mapping;
        return;
      }
    }
    while (lastGeneratedLine < mapping.generatedLine) {
      emit(shiftNextLine(), null);
      lastGeneratedLine++;
    }
    if (lastGeneratedColumn < mapping.generatedColumn) {
      const line = remainingLines[remainingLinesIndex] || '';
      emit(line.substr(0, mapping.generatedColumn), null);
      remainingLines[remainingLinesIndex] = line.substr(mapping.generatedColumn);
      lastGeneratedColumn = mapping.generatedColumn;
    }
    lastMapping = mapping;
  });

  if (remainingLinesIndex < remainingLines.length) {
    if (lastMapping) emit(shiftNextLine(), lastMapping);
    emit(remainingLines.splice(remainingLinesIndex).join(''), null);
  }
}

/**
 * Prepare invocation-local consumers, then use the existing synchronous map
 * generator. Repeated references share one consumer until their final walk.
 * Source contents are captured while it is alive, permitting early disposal.
 * Finally also disposes consumers after partial preparation or traversal failure.
 */
export async function serializeStreamingSource(
  root: SourceNode,
  options: StartOfSourceMap = {},
  dependencies: StreamingDependencies = {},
): Promise<CodeWithSourceMap> {
  const references = new Map<StreamingMappedSource, number>();
  const collect = (value: unknown): void => {
    if (value instanceof StreamingMappedSource) {
      references.set(value, (references.get(value) || 0) + 1);
    } else if (value instanceof SourceNode) {
      for (const child of value.children as readonly unknown[]) collect(child);
    }
  };
  collect(root);
  if (references.size === 0) return root.toStringWithSourceMap(options);

  const createConsumer = dependencies.createConsumer || (async map => new SourceMapConsumer(map));
  const prepared = new Map<StreamingMappedSource, PreparedSource>();
  try {
    for (const [source, count] of references) {
      const consumer = await createConsumer(source.map);
      const entry: PreparedSource = { consumer, contents: [], remainingWalks: count, destroyed: false };
      // Register before reading contents so a failing read still releases it.
      prepared.set(source, entry);
      for (const name of consumer.sources) {
        const content = consumer.sourceContentFor(name);
        if (content !== null) entry.contents.push([name, content]);
      }
    }

    const visit = (value: unknown, sink: SegmentSink): void => {
      if (value instanceof StreamingMappedSource) {
        const entry = prepared.get(value);
        if (!entry || entry.destroyed) throw new Error('Unprepared streaming source');
        emitMappedSegments(value.code, entry.consumer, sink);
        if (--entry.remainingWalks === 0) dispose(entry);
      } else if (value instanceof SourceNode) {
        for (const child of value.children as readonly unknown[]) {
          if (typeof child === 'string') {
            if (child !== '') sink(child, { source: value.source, line: value.line,
              column: value.column, name: value.name });
          } else {
            visit(child, sink);
          }
        }
      } else if (isWalkable(value)) {
        value.walk(sink);
      } else {
        throw new Error('Unsupported source-node child');
      }
    };
    const visitContents = (value: unknown, sink: ContentSink): void => {
      if (value instanceof StreamingMappedSource) {
        const entry = prepared.get(value);
        if (!entry) throw new Error('Unprepared streaming source contents');
        for (const [name, content] of entry.contents) sink(name, content);
      } else if (value instanceof SourceNode) {
        for (const child of value.children as readonly unknown[]) {
          if (typeof child !== 'string') visitContents(child, sink);
        }
        // Let the library decode its own source-content dictionary keys.
        SourceNode.prototype.walkSourceContents.call({ children: [],
          sourceContents: value.sourceContents as unknown }, sink);
      } else if (isWalkable(value)) {
        value.walkSourceContents(sink);
      } else {
        throw new Error('Unsupported source-node child');
      }
    };
    const facade = {
      walk: (sink: SegmentSink): void => visit(root, sink),
      walkSourceContents: (sink: ContentSink): void => visitContents(root, sink),
    };
    return SourceNode.prototype.toStringWithSourceMap.call(facade, options);
  } finally {
    let cleanupError: unknown;
    for (const entry of prepared.values()) {
      try { dispose(entry); } catch (error) { cleanupError = error; }
    }
    if (cleanupError !== undefined) throw cleanupError;
  }
}
