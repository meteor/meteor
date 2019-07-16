import * as fs from "fs";
import * as path from "path";
import * as net from "net";
import { isEmacs } from "./utils/utils";
import { eachline } from "./utils/eachline";

const chalk = require("chalk");
const EOL = require("os").EOL;

// These two values (EXITING_MESSAGE and getInfoFile) must match the
// values used by the shell-server package.
const EXITING_MESSAGE = "Shell exiting...";

function getInfoFile(shellDir: string): string {
  return path.join(shellDir, "info.json");
}

// Invoked by the process running `meteor shell` to attempt to connect to
// the server via the socket file.
export function connect(shellDir: string) {
  new Client(shellDir).connect();
}

class Client {
  public connected = false;

  private exitOnClose = false;
  private firstTimeConnecting = true;
  private reconnectCount = 0;
  private reconnectTimer?: NodeJS.Timeout;

  constructor(public shellDir: string) {}

  reconnect(delay: number = 100) {
    // Display the "Server unavailable" warning only on the third attempt
    // to reconnect, so it doesn't get shown for successful reconnects.
    if (++this.reconnectCount === 3) {
      console.error(chalk.yellow(
        "Server unavailable (waiting to reconnect)"
      ));
    }

    if (!this.reconnectTimer) {
      this.reconnectTimer = setTimeout(() => {
        delete this.reconnectTimer;
        this.connect();
      }, delay);
    }
  };

  connect() {
    const infoFile = getInfoFile(this.shellDir);

    fs.readFile(infoFile, "utf8", (err, json) => {
      if (err) {
        return this.reconnect();
      }

      let info;
      try {
        info = JSON.parse(json);
      } catch (err) {
        return this.reconnect();
      }

      if (info.status !== "enabled") {
        if (this.firstTimeConnecting) {
          return this.reconnect();
        }

        if (info.reason) {
          console.error(info.reason);
        }

        console.error(EXITING_MESSAGE);
        process.exit(0);
      }

      this.setUpSocket(
        net.connect(info.port, "127.0.0.1"),
        info.key
      );
    });
  };

  setUpSocketForSingleUse(sock: net.Socket, key: string) {
    sock.on("connect", function () {
      const inputBuffers: Buffer[] = [];
      process.stdin.on("data", buffer => inputBuffers.push(buffer));
      process.stdin.on("end", () => {
        sock.write(JSON.stringify({
          evaluateAndExit: {
            // Make sure the entire command is written as a string within a
            // JSON object, so that the server can easily tell when it has
            // received the whole command.
            command: Buffer.concat(inputBuffers).toString("utf8")
          },
          terminal: false,
          key: key
        }) + "\n");
      });
    });

    const outputBuffers: Buffer[] = [];
    sock.on("data", buffer => outputBuffers.push(buffer));
    sock.on("close", function () {
      const output = JSON.parse(Buffer.concat(outputBuffers));
      if (output.error) {
        console.error(output.error);
        process.exit(output.code);
      } else {
        process.stdout.write(JSON.stringify(output.result) + "\n");
        process.exit(0);
      }
    });
  };

  setUpSocket(sock: net.Socket, key: string) {
    if (!process.stdin.isTTY) {
      return this.setUpSocketForSingleUse(sock, key);
    }

    // Put STDIN into "flowing mode":
    // http://nodejs.org/api/stream.html#stream_compatibility_with_older_node_versions
    process.stdin.resume();

    const onConnect = () => {
      this.firstTimeConnecting = false;
      this.reconnectCount = 0;
      this.connected = true;

      // Sending a JSON-stringified options object (even just an empty
      // object) over the socket is required to start the REPL session.
      sock.write(JSON.stringify({
        columns: process.stdout.columns,
        terminal: !isEmacs(),
        key: key
      }) + "\n");

      process.stderr.write(shellBanner());
      process.stdin.pipe(sock);
      if (process.stdin.setRawMode) { // https://github.com/joyent/node/issues/8204
        process.stdin.setRawMode(true);
      }
    }

    const onClose = () => {
      tearDown();

      // If we received the special EXITING_MESSAGE just before the socket
      // closed, then exit the shell instead of reconnecting.
      if (this.exitOnClose) {
        process.exit(0);
      } else {
        this.reconnect();
      }
    }

    const onError = () => {
      tearDown();
      this.reconnect();
    }

    const tearDown = () => {
      this.connected = false;

      if (process.stdin.setRawMode) { // https://github.com/joyent/node/issues/8204
        process.stdin.setRawMode(false);
      }

      process.stdin.unpipe(sock);
      sock.unpipe(process.stdout);
      sock.removeListener("connect", onConnect);
      sock.removeListener("close", onClose);
      sock.removeListener("error", onError);
      sock.end();
    }

    sock.pipe(process.stdout);

    eachline(sock, (line: string) => {
      this.exitOnClose = line.indexOf(EXITING_MESSAGE) >= 0;
      return line;
    });

    sock.on("connect", onConnect);
    sock.on("close", onClose);
    sock.on("error", onError);
  };
}



function shellBanner(): string {
  const bannerLines = [
    "",
    "Welcome to the server-side interactive shell!"
  ];

  if (!isEmacs()) {
    // Tab completion sadly does not work in Emacs.
    bannerLines.push(
      "",
      "Tab completion is enabled for global variables."
    );
  }

  bannerLines.push(
    "",
    "Type .reload to restart the server and the shell.",
    "Type .exit to disconnect from the server and leave the shell.",
    "Type .help for additional help.",
    EOL
  );

  return chalk.green(bannerLines.join(EOL));
}
