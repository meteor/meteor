import { WebAppInternals } from "meteor/webapp";
import cheerio from "cheerio";
import MagicString from "magic-string";
import { SAXParser } from "parse5";
import { create as createStream } from "combined-stream2";
import { ServerSink, isReadable } from "./server-sink.js";
import { onPageLoad } from "./server.js";

function updateContent(data, section, selector, itemArray) {
  let reallyMadeChanges = false;
  const content = section === "head" ?
    `<head>${data.head}</head>` :
    `<body>${data.body}</body>`;
  $ = cheerio.load(content,
    { 
      withDomLvl1: true,
      normalizeWhitespace: false,
      xmlMode: true,
      decodeEntities: true
    }
  );

  itemArray.forEach((item) => {
    let searchField = "";
    if (selector === "id") {
      searchField = `#${item.id}`;
    } else {
      searchField = item.searchAttribute && item.searchAttributeValue ?
        `${item.tag}[${item.searchAttribute}=${item.searchAttributeValue}]` :
        item.tag;
    }
    if (!item.value) {
      $(searchField).remove();
    } else {
      if (item.updateAttribute) {
        $(searchField).attr(item.updateAttribute, item.value);
      } else {
        if (item.updateType === 'prepend') {
          $(searchField).prepend(item.value);
        } else if (item.updateType === 'append') {
          $(searchField).append(item.value);
        } else {
          $(searchField).html(item.value);
        }
      }
      reallyMadeChanges = true;
    }
  });
  if (reallyMadeChanges) {
    data[section] = $(section).html();
  }

  return reallyMadeChanges;
}

WebAppInternals.registerBoilerplateDataCallback(
  "meteor/server-render",
  (request, data, arch) => {
    const sink = new ServerSink(request, arch);

    return onPageLoad.chain(
      callback => callback(sink, request)
    ).then(() => {
      if (! sink.maybeMadeChanges) {
        return false;
      }

      let reallyMadeChanges = false;

      function rewrite(property) {
        const html = data[property];
        if (typeof html !== "string") {
          return;
        }

        const magic = new MagicString(html);
        const parser = new SAXParser({
          locationInfo: true
        });

        data[property] = parser;

        if (Object.keys(sink.htmlById).length) {
          const stream = createStream();

          let lastStart = magic.start;
          parser.on("startTag", (name, attrs, selfClosing, loc) => {
            attrs.some(attr => {
              if (attr.name === "id") {
                let html = sink.htmlById[attr.value];
                if (html) {
                  reallyMadeChanges = true;
                  const start = magic.slice(lastStart, loc.endOffset);
                  stream.append(Buffer.from(start, "utf8"));
                  stream.append(
                    typeof html === "string"
                      ? Buffer.from(html, "utf8")
                      : html
                  );
                  lastStart = loc.endOffset;
                }
                return true;
              }
            });
          });

          parser.on("endTag", (name, location) => {
            if (location.endOffset === html.length) {
              // reached the end of the template
              const end = magic.slice(lastStart);
              stream.append(Buffer.from(end, "utf8"));
            }
          })

          data[property] = stream;
        }

        parser.write(html, parser.end.bind(parser));
      }

      if (sink.head) {
        data.dynamicHead = (data.dynamicHead || "") + sink.head;
        reallyMadeChanges = true;
      }

      if (Object.keys(sink.htmlById).length > 0) {
        // We don't currently allow injecting HTML into the <head> except
        // by calling sink.appendHead(html).
        rewrite("body");
        rewrite("dynamicBody");
      }

      if (sink.body) {
        data.dynamicBody = (data.dynamicBody || "") + sink.body;
        reallyMadeChanges = true;
      }

      if (sink.statusCode) {
        data.statusCode = sink.statusCode;
        reallyMadeChanges = true;
      }

      if (Object.keys(sink.responseHeaders)){
        data.headers = sink.responseHeaders;
        reallyMadeChanges = true;
      }

      if (sink.headHtmlByTag) {
        reallyMadeChanges = updateContent(data, "head", "tag", sink.headHtmlByTag);
      }

      if (sink.bodyHtmlById) {
        reallyMadeChanges = updateContent(data, "body", "id", sink.bodyHtmlById);
      }

      return reallyMadeChanges;
    });
  }
);
