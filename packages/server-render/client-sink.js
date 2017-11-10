const doc = document;
const head = doc.getElementsByTagName("head")[0];
const body = doc.body;

const isoError = (method) => {
  return `sink.${method} was called on the client when
    it should only be called on the server.`;
}
export class ClientSink {
  appendToHead(nodeOrHtml) {
    appendContent(head, nodeOrHtml);
  }

  appendToBody(nodeOrHtml) {
    appendContent(body, nodeOrHtml);
  }

  appendToElementById(id, nodeOrHtml) {
    appendContent(doc.getElementById(id), nodeOrHtml);
  }

  renderIntoElementById(id, nodeOrHtml) {
    const element = doc.getElementById(id);
    while (element.lastChild) {
      element.removeChild(element.lastChild);
    }
    appendContent(element, nodeOrHtml);
  }

  redirect(location) {
    // code can't be set on the client
    window.location = location;
  }

  // server only methods
  setStatusCode() {
    console.error(isoError("setStatusCode"));
  }

  setHeader() {
    console.error(isoError("setHeader"));
  }

  getHeaders() {
    console.error(isoError("getHeaders"));
  }

  getCookies() {
    console.error(isoError("getCookies"));
  }
}


function appendContent(destination, nodeOrHtml) {
  if (typeof nodeOrHtml === "string") {
    // Make a shallow clone of the destination node to ensure the new
    // children can legally be appended to it.
    const container = destination.cloneNode(false);
    // Parse the HTML into the container, allowing for multiple children.
    container.innerHTML = nodeOrHtml;
    // Transplant the children to the destination.
    while (container.firstChild) {
      destination.appendChild(container.firstChild);
    }
  } else if (Array.isArray(nodeOrHtml)) {
    nodeOrHtml.forEach(elem => appendContent(destination, elem));
  } else {
    destination.appendChild(nodeOrHtml);
  }
}
