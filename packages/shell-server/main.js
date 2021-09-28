export * from "./shell-server.js";
import { listen } from "./shell-server.js";

const shellDir = process.env.METEOR_SHELL_DIR;
if (shellDir) {
  listen(shellDir);
}
