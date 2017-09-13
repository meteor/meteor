import { readFileSync, existsSync } from "fs";
import ignore from "./ignore";
import find from "./find";
import { log } from "../../runners/run-log";

const CWD = process.cwd();

function findMigs(elemPath, self) {
  if (/^node_modules/.test(elemPath)) return [];
  if (/\.meteorignore$/.test(elemPath)) return [];

  if (!self.meteorignoreData.migs) {
    const regexp = new RegExp(`${CWD}/?`);

    self.meteorignoreData.migs = find
      .fileSync(/\.meteorignore$/, CWD)
      .map(fpath => fpath.replace(regexp, ""));
  }

  // find all parent migs
  return self.meteorignoreData.migs.filter(ipath => {
    // root ig
    if (".meteorignore" === ipath) return true;
    // parent ig
    const dir = ipath.replace(/[^\/]*$/, "");
    return dir.length < elemPath.length && elemPath.match(dir);
  });
}

export function filterIgnoredSources(sources, self) {
  if (!sources.length) return sources;
  self.meteorignoreData.igCache = self.meteorignoreData.igCache || {};

  // filter sources that aren't ignored
  return sources.filter(function(src) {
    if (/\.meteorignore$/.test(src)) return;

    // search for migs at the same or parent dir
    const matchedMigs = findMigs(src, self);

    // search one mig that ignores current src
    const ignores = matchedMigs.find(migPath => {
      self.meteorignoreData.igCache[migPath] =
        self.meteorignoreData.igCache[migPath] ||
        ignore().add(readFileSync(`${CWD}/${migPath}`).toString());
      return self.meteorignoreData.igCache[migPath].ignores(src);
    });

    return !ignores;
  });
}
