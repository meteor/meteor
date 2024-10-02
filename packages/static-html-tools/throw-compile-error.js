export class CompileError {}

export function throwCompileError(tag, message, overrideIndex) {
  const finalIndex = (typeof overrideIndex === 'number' ?
    overrideIndex : tag.tagStartIndex);

  const err = new CompileError();
  err.message = message || "bad formatting in template file";
  err.file = tag.sourceName;
  err.line = tag.fileContents.substring(0, finalIndex).split('\n').length;
  throw err;
}
