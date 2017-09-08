const HEAD_REGEX = /<head[^>]*>((.|[\n\r])*)<\/head>/im
const BODY_REGEX = /<body[^>]*>((.|[\n\r])*)<\/body>/im;

export class ServerSink {
  constructor(request, arch) {
    this.request = request;
    this.arch = arch;
    this.head = "";
    this.body = "";
    this.htmlById = Object.create(null);
    this.maybeMadeChanges = false;
  }

  appendToHead(html) {
    if (appendContent(this, "head", html)) {
      this.maybeMadeChanges = true;
    }
  }

  appendToBody(html) {
    if (appendContent(this, "body", html)) {
      this.maybeMadeChanges = true;
    }
  }

  appendToElementById(id, html) {
    if (appendContent(this.htmlById, id, html)) {
      this.maybeMadeChanges = true;
    }
  }

  renderIntoElementById(id, html) {
    this.htmlById[id] = "";
    this.appendToElementById(id, html);
  }

  renderDocument(html){
      // Extract head
      const head = HEAD_REGEX.exec(html)[1];
      this.appendToHead(head);

      // Extract body
      const body = BODY_REGEX.exec(html)[1];
      this.appendToBody(body);
  }
}

function appendContent(object, property, content) {
  let madeChanges = false;

  if (Array.isArray(content)) {
    content.forEach(elem => {
      if (appendContent(object, property, elem)) {
        madeChanges = true;
      }
    });
  } else if ((content = content && content.toString("utf8"))) {
    object[property] = (object[property] || "") + content;
    madeChanges = true;
  }

  return madeChanges;
}
