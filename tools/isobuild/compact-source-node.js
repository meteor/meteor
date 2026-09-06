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

const { SourceNode } = require('source-map');

const REGEX_NEWLINE = /(\r?\n)/;
const SOURCE_NODE_MARKER = '$$$isSourceNode$$$';

/**
 * A mapped fragment in an internal, immutable prelink tree. Unlike branch
 * nodes, a leaf needs neither a child array nor a source-contents dictionary.
 * The linker and HMR compose and serialize these trees without mutating leaves.
 * This is deliberately not a general replacement for the mutable SourceNode API.
 */
class CompactMappedLeaf {
  constructor(line, column, source, code, name) {
    this.line = line == null ? null : line;
    this.column = column == null ? null : column;
    this.source = source == null ? null : source;
    this.name = name == null ? null : name;
    this.code = code;
  }

  walk(callback) {
    if (this.code !== '') {
      callback(this.code, this);
    }
  }

  walkSourceContents() {
    // Source contents belong to the ordinary root SourceNode.
  }
}

// SourceNode uses this cross-version marker to dispatch traversal to children.
CompactMappedLeaf.prototype[SOURCE_NODE_MARKER] = true;

/**
 * Expand a map into an ordinary SourceNode root containing compact mapped leaves.
 * Segmentation follows source-map 0.7.4's SourceNode.fromStringWithSourceMap;
 * preserve parity with that implementation when upgrading source-map.
 * The consumer remains caller-owned. Relative-path rewriting is intentionally
 * absent because prelinking never requests it.
 *
 * @param {string} aGeneratedCode Generated JavaScript to split into fragments.
 * @param {import('source-map').SourceMapConsumer} aSourceMapConsumer Input map.
 * @returns {import('source-map').SourceNode} Root with read-only mapped leaves.
 */
function fromStringWithSourceMap(aGeneratedCode, aSourceMapConsumer) {
  // The SourceNode we want to fill with the generated code
  // and the SourceMap
  const node = new SourceNode();

  // All even indices of this array are one line of the generated code,
  // while all odd indices are the newlines between two adjacent lines
  // (since `REGEX_NEWLINE` captures its match).
  // Processed fragments are accessed by calling `shiftNextLine`.
  const remainingLines = aGeneratedCode.split(REGEX_NEWLINE);
  let remainingLinesIndex = 0;
  const shiftNextLine = function() {
    const lineContents = getNextLine();
    // The last line of a file might not have a newline.
    const newLine = getNextLine() || "";
    return lineContents + newLine;

    function getNextLine() {
      return remainingLinesIndex < remainingLines.length ?
          remainingLines[remainingLinesIndex++] : undefined;
    }
  };

  // We need to remember the position of "remainingLines"
  let lastGeneratedLine = 1, lastGeneratedColumn = 0;

  // The generate SourceNodes we need a code range.
  // To extract it current and last mapping is used.
  // Here we store the last mapping.
  let lastMapping = null;
  let nextLine;

  aSourceMapConsumer.eachMapping(function(mapping) {
    if (lastMapping !== null) {
      // We add the code from "lastMapping" to "mapping":
      // First check if there is a new line in between.
      if (lastGeneratedLine < mapping.generatedLine) {
        // Associate first line with "lastMapping"
        addMappingWithCode(lastMapping, shiftNextLine());
        lastGeneratedLine++;
        lastGeneratedColumn = 0;
        // The remaining code is added without mapping
      } else {
        // There is no new line in between.
        // Associate the code between "lastGeneratedColumn" and
        // "mapping.generatedColumn" with "lastMapping"
        nextLine = remainingLines[remainingLinesIndex] || "";
        const code = nextLine.substr(0, mapping.generatedColumn -
                                      lastGeneratedColumn);
        remainingLines[remainingLinesIndex] = nextLine.substr(mapping.generatedColumn -
                                            lastGeneratedColumn);
        lastGeneratedColumn = mapping.generatedColumn;
        addMappingWithCode(lastMapping, code);
        // No more remaining code, continue
        lastMapping = mapping;
        return;
      }
    }
    // We add the generated code until the first mapping
    // to the SourceNode without any mapping.
    // Each line is added as separate string.
    while (lastGeneratedLine < mapping.generatedLine) {
      node.add(shiftNextLine());
      lastGeneratedLine++;
    }
    if (lastGeneratedColumn < mapping.generatedColumn) {
      nextLine = remainingLines[remainingLinesIndex] || "";
      node.add(nextLine.substr(0, mapping.generatedColumn));
      remainingLines[remainingLinesIndex] = nextLine.substr(mapping.generatedColumn);
      lastGeneratedColumn = mapping.generatedColumn;
    }
    lastMapping = mapping;
  });
  // We have processed all mappings.
  if (remainingLinesIndex < remainingLines.length) {
    if (lastMapping) {
      // Associate the remaining code in the current line with "lastMapping"
      addMappingWithCode(lastMapping, shiftNextLine());
    }
    // and add the remaining lines without any mapping
    node.add(remainingLines.splice(remainingLinesIndex).join(""));
  }

  // Copy sourcesContent into SourceNode
  aSourceMapConsumer.sources.forEach(function(sourceFile) {
    const content = aSourceMapConsumer.sourceContentFor(sourceFile);
    if (content != null) {
      node.setSourceContent(sourceFile, content);
    }
  });

  return node;

  function addMappingWithCode(mapping, code) {
    if (mapping === null || mapping.source === undefined) {
      node.add(code);
    } else {
      node.add(new CompactMappedLeaf(
        mapping.originalLine,
        mapping.originalColumn,
        mapping.source,
        code,
        mapping.name,
      ));
    }
  }
}

module.exports = { fromStringWithSourceMap };
