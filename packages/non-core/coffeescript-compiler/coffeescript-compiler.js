import { BabelCompiler } from 'meteor/babel-compiler';
import CoffeeScript from 'coffeescript';
import { SourceMapConsumer, SourceMapGenerator } from 'source-map';


// The CoffeeScript compiler overrides Error.prepareStackTrace, mostly for the
// use of coffee.run which we don't use. This conflicts with the tool's use of
// Error.prepareStackTrace to properly show error messages in linked code.
// Restore the tool's one after CoffeeScript clobbers it at import time.
if (Error.METEOR_prepareStackTrace) {
  Error.prepareStackTrace = Error.METEOR_prepareStackTrace;
}


// The CompileResult for this CachingCompiler is a {source, sourceMap} object.
export class CoffeeScriptCompiler {
  constructor() {
    this.babelCompiler = new BabelCompiler({
      // Prevent Babel from importing helpers from babel-runtime, since
      // the CoffeeScript plugin does not imply the modules package, which
      // means require may not be defined. Note that this in no way
      // prevents CoffeeScript projects from using the modules package and
      // putting require or import statements within backticks; it just
      // won't happen automatically because of Babel.
      runtime: false,
      // CoffeeScript 2 supports for JSX, which Meteor supports only for React,
      // per packages/ecmascript/plugin.js.
      react: true
    });
  }

  getCompileOptions(inputFile) {
    return {
      bare: true,
      filename: inputFile.getPathInPackage(),
      literate: inputFile.getExtension() !== 'coffee',
      // Return a source map.
      sourceMap: true,
      // This becomes the `file` field of the source map.
      generatedFile: '/' + this.outputFilePath(inputFile),
      // This becomes the `sources` field of the source map.
      sourceFiles: [inputFile.getDisplayPath()],
    };
  }

  outputFilePath(inputFile) {
    return inputFile.getPathInPackage();
  }

  compileOneFile(inputFile) {
    const source = inputFile.getContentsAsString();
    const compileOptions = this.getCompileOptions(inputFile);

    let output;
    try {
      output = CoffeeScript.compile(source, compileOptions);
    } catch (e) {
      inputFile.error({
        message: e.message,
        line: e.location && (e.location.first_line + 1),
        column: e.location && (e.location.first_column + 1)
      });
      return null;
    }

    let sourceMap = JSON.parse(output.v3SourceMap);
    sourceMap.sourcesContent = [source];

    output.js = this.stripExportedVars(
      output.js,
      inputFile.getDeclaredExports().map(e => e.name)
    );

    // CoffeeScript contains a handful of features that output as ES2015+,
    // such as modules, generator functions, for…of, and tagged template
    // literals. Because they’re too varied to detect, pass all CoffeeScript
    // compiler output through the Babel compiler.
    const doubleRoastedCoffee =
      this.babelCompiler.processOneFileForTarget(inputFile, output.js);

    if (doubleRoastedCoffee != null &&
        doubleRoastedCoffee.data != null) {
      output.js = doubleRoastedCoffee.data;

      const coffeeSourceMap = doubleRoastedCoffee.sourceMap;

      if (coffeeSourceMap) {
        // Reference the compiled CoffeeScript file so that `applySourceMap`
        // below can match it with the source map produced by the CoffeeScript
        // compiler.
        coffeeSourceMap.sources[0] = '/' + this.outputFilePath(inputFile);

        // Combine the original CoffeeScript source map with the one
        // produced by this.babelCompiler.processOneFileForTarget.
        const smg = SourceMapGenerator.fromSourceMap(
          new SourceMapConsumer(coffeeSourceMap)
        );
        smg.applySourceMap(new SourceMapConsumer(sourceMap));
        sourceMap = smg.toJSON();
      } else {
        // If the .coffee file is contained by a node_modules directory,
        // then BabelCompiler will not transpile it, and there will be
        // no sourceMap, but that's fine because the original
        // CoffeeScript sourceMap will still be valid.
      }
    }

    return this.addSharedHeader(output.js, sourceMap);
  }

  stripExportedVars(source, exports) {
    if (!exports || !exports.length)
      return source;
    const lines = source.split("\n");

    // We make the following assumptions, based on the output of CoffeeScript
    // 1.7.1.
    //   - The var declaration in question is not indented and is the first such
    //     var declaration.  (CoffeeScript only produces one var line at each
    //     scope and there's only one top-level scope.)  All relevant variables
    //     are actually on this line.
    //   - The user hasn't used a ###-comment containing a line that looks like
    //     a var line, to produce something like
    //        /* bla
    //        var foo;
    //        */
    //     before an actual var line.  (ie, we do NOT attempt to figure out if
    //     we're inside a /**/ comment, which is produced by ### comments.)
    //   - The var in question is not assigned to in the declaration, nor are any
    //     other vars on this line. (CoffeeScript does produce some assignments
    //     but only for internal helpers generated by CoffeeScript, and they end
    //     up on subsequent lines.)
    // XXX relax these assumptions by doing actual JS parsing (eg with jsparse).
    //     I'd do this now, but there's no easy way to "unparse" a jsparse AST.
    //     Or alternatively, hack the compiler to allow us to specify unbound
    //     symbols directly.

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = /^var (.+)([,;])$/.exec(line);
      if (!match)
        continue;

      // If there's an assignment on this line, we assume that there are ONLY
      // assignments and that the var we are looking for is not declared. (Part
      // of our strong assumption about the layout of this code.)
      if (match[1].indexOf('=') !== -1)
        continue;

      // We want to replace the line with something no shorter, so that all
      // records in the source map continue to point at valid
      // characters.
      function replaceLine(x) {
        if (x.length >= lines[i].length) {
          lines[i] = x;
        } else {
          lines[i] = x + new Array(1 + (lines[i].length - x.length)).join(' ');
        }
      }

      let vars = match[1].split(', ').filter(v => exports.indexOf(v) === -1);
      if (vars.length) {
        replaceLine('var ' + vars.join(', ') + match[2]);
      } else {
        // We got rid of all the vars on this line. Drop the whole line if this
        // didn't continue to the next line, otherwise keep just the 'var '.
        if (match[2] === ';')
          replaceLine('');
        else
          replaceLine('var');
      }
      break;
    }

    return lines.join('\n');
  }

  addSharedHeader(source, sourceMap) {
    // We want the symbol "share" to be visible to all CoffeeScript files in the
    // package (and shared between them), but not visible to JavaScript
    // files. (That's because we don't want to introduce two competing ways to
    // make package-local variables into JS ("share" vs assigning to non-var
    // variables).) The following hack accomplishes that: "__coffeescriptShare"
    // will be visible at the package level and "share" at the file level.  This
    // should work both in "package" mode where __coffeescriptShare will be added
    // as a var in the package closure, and in "app" mode where it will end up as
    // a global.
    //
    // This ends in a newline to make the source map easier to adjust.
    const header = ("__coffeescriptShare = typeof __coffeescriptShare === 'object' " +
                    "? __coffeescriptShare : {}; " +
                    "var share = __coffeescriptShare;\n");

    // If the file begins with "use strict", we need to keep that as the first
    // statement.
    const processedSource = source.replace(/^(?:((['"])use strict\2;)\n)?/, (match, useStrict) => {
      if (match) {
        // There's a "use strict"; we keep this as the first statement and insert
        // our header at the end of the line that it's on. This doesn't change
        // line numbers or the part of the line that previous may have been
        // annotated, so we don't need to update the source map.
        return useStrict + '  ' + header;
      } else {
        // There's no use strict, so we can just add the header at the very
        // beginning. This adds a line to the file, so we update the source map to
        // add a single un-annotated line to the beginning.
        sourceMap.mappings = ';' + sourceMap.mappings;
        return header;
      }
    });
    return {
      source: processedSource,
      sourceMap: sourceMap
    };
  }

}
