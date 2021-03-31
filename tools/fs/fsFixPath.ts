export {
  // The tools/fs/files module used to export wrappers for both fiberized
  // and synchronous fs.* functions. This module exists to preserve backwards
  // compatibility with that behavior, even though everything is sync now.
  appendFile, appendFile as appendFileSync,
  chmod, chmod as chmodSync,
  close, close as closeSync,
  copyFile, copyFile as copyFileSync,
  createReadStream,
  createWriteStream,
  lstat, lstat as lstatSync,
  mkdir, mkdir as mkdirSync,
  open, open as openSync,
  read, read as readSync,
  readFile, readFile as readFileSync,
  readdir, readdir as readdirSync,
  readlink, readlink as readlinkSync,
  realpath, realpath as realpathSync,
  rename, rename as renameSync,
  rmdir, rmdir as rmdirSync,
  stat, stat as statSync,
  symlink, symlink as symlinkSync,
  unlink, unlink as unlinkSync,
  watchFile, unwatchFile,
  write, write as writeSync,
  writeFile, writeFile as writeFileSync,
} from "./files";
