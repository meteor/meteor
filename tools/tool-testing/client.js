export default class Client {
  constructor(options) {
    this.host = options.host;
    this.port = options.port;
    this.url = [
      `http://${this.host}:${this.port}/`,
      (Math.random() * 0x100000000 + 1).toString(36),
    ].join('');
    this.timeout = options.timeout || 40;

    if (! this.connect || ! this.stop) {
      console.log("Missing methods in subclass of Client.");
    }
  }
}
