

if (Meteor.isClient) {
  Meteor.startup(function () {
    if (! Session.get("input"))
      Session.set("input", "var x = 3");
    if (! Session.get("output-type"))
      Session.set("output-type", "jsparse");
  });

  Template.page.input = function () {
    return Session.get("input") || '';
  };

  Template.page.output = function () {
    var input = Session.get("input") || "";

    var outputType = Session.get("output-type");

    if (outputType === "jslex") {
      // LEXER

      var lexer = new JSLexer(input);
      var html = "";
      var L;
      do {
        L = lexer.next();
        var content;
        if (L.type() === "NEWLINE") {
          content = '&nbsp;<br>';
        } else if (L.type() === "EOF") {
          content = Handlebars._escape("<EOF>");
        } else {
          content = Handlebars._escape(L.text() || ' ');
          content = content.replace(/(?!.)\s/g, '<br>'); // for multiline comments
          content = content.replace(/\s/g, '&nbsp;');
        }
        html += Spark.setDataContext(
          L,
          '<span class="lex lex_' + L.type().toLowerCase() + '" ' +
            'title="' + Handlebars._escape(L.type()) + '">' +
            content + '</span>');
      } while (! L.isError() && ! L.isEOF());
      return new Handlebars.SafeString(html);

    } else if (outputType === "jsparse") {

      // PARSER
      var html;
      var tree = null;
      var parser = new JSParser(input, {includeComments: true});
      try {
        tree = parser.getSyntaxTree();
      } catch (parseError) {
        var errorLexeme = parser.lexer.lastLexeme;

        html = Handlebars._escape(
          input.substring(0, errorLexeme.startPos()));
        html += Spark.setDataContext(
          errorLexeme,
          '<span class="parseerror">' +
            Handlebars._escape(errorLexeme.text() || '<EOF>') +
            '</span>');
        html = html.replace(/(?!.)\s/g, '<br>');
        html += '<div class="parseerrormessage">' +
          Handlebars._escape(parseError.toString()) + '</div>';
      }
      if (tree) {
        var curPos = 0;
        var unclosedInfos = [];
        var toHtml = function (obj) {
          if (obj instanceof ParseNode) {
            var head = obj.name || '';
            var children = obj.children;
            var info = { startPos: curPos };
            var isStatement = (head.indexOf('Stmnt') >= 0 ||
                               head === "comment" ||
                               head === "functionDecl");
            var html = Spark.setDataContext(
              info,
              '<div class="box named' + (isStatement ? ' statement' : '') +
                '"><div class="box head">' + Handlebars._escape(head) + '</div>' +
                _.map(children, toHtml).join('') + '</div>');
            unclosedInfos.push(info);
            return html;
          } else if (obj.text) {
            // token
            _.each(unclosedInfos, function (info) {
              info.endPos = curPos;
            });
            curPos = obj.endPos();
            unclosedInfos.length = 0;
            var text = obj.text();
            // insert zero-width spaces to allow wrapping
            text = text.replace(/.{20}/g, "$&\u200b");
            text = Handlebars._escape(text);
            text = text.replace(/\u200b/g, '&#8203;');
            text = text.replace(/\n/g, '<br>');
            return Spark.setDataContext(
              obj,
              '<div class="box token">' + text + '</div>');
          } else {
            // other?
            return '<div class="box other">' +
              Handlebars._escape(JSON.stringify(obj)) + '</div>';
          }
        };
        html = toHtml(tree);
        curPos = parser.lexer.pos;
        _.each(unclosedInfos, function (info) {
          info.endPos = curPos;
        });
      }

      return new Handlebars.SafeString(html);
    }
    else return ''; // unknown output tab?
  };

  Template.page.events({
    'keyup #inputarea textarea': function (event) {
      var input = event.currentTarget.value;
      Session.set("input", input);
    },
    'mouseover .box.named, mouseover .box.token': function (event) {
      event.currentTarget.setAttribute('mousehover', 'mousehover');
      event.stopImmediatePropagation();
    },
    'mouseout .box.named, mouseout .box.token': function (event) {
      event.currentTarget.removeAttribute('mousehover');
      event.stopImmediatePropagation();
    },
    'click .box.token': function (event) {
      selectInputText(this.startPos(), this.endPos());
      return false;
    },
    'click .box.named': function (event) {
      selectInputText(this.startPos, this.endPos);
      return false;
    },
    'click .parseerror': function (event) {
      selectInputText(this.startPos(), this.endPos());
      return false;
    },
    'click .output-type': function (event) {
      Session.set("output-type", this.value);
    },
    'click .lex': function (event) {
      selectInputText(this.startPos(), this.endPos());
      return false;
    }
  });

  Template.page.outputTypes = [
    {name: "JS Lex", value: "jslex"},
    {name: "JS Parse", value: "jsparse"}
  ];

  Template.page.is_outputtype_selected = function (which) {
    return Session.equals("output-type", which) ? "selected" : "";
  };

  var selectTextInArea = function (e, start, end){
    e.focus();
    if (e.setSelectionRange) {
      e.setSelectionRange(start, end);
    } else if (e.createTextRange) {
      var r = e.createTextRange();
      r.collapse(true);
      r.moveEnd('character', end);
      r.moveStart('character', start);
      r.select();
    }
  };

  var selectInputText = function (start, end) {
    var textarea = DomUtils.find(document, '#inputarea textarea');
    selectTextInArea(textarea, start, end);
  };

}
