

if (Meteor.is_client) {
  Meteor.startup(function () {
    if (! Session.get("input"))
      Session.set("input", "var x = 3");
  });

  Template.page.input = function () {
    return Session.get("input") || '';
  };

  Template.page.output = function () {
    var input = Session.get("input") || "";

    // LEXER
    /*
    if (! input)
      return "";

    var L = new Lexer(input);
    var html = "";
    while (L.next() !== 'EOF') {
      if (L.type === "NEWLINE") {
        html += '<br>';
      } else {
        var text = Handlebars._escape(L.text || ' ');
        text = text.replace(/(?!.)\s/g, '<br>'); // for multiline comments
        text = text.replace(/\s/g, '&nbsp;');
        html += '<span class="lex lex_' + L.type.toLowerCase() + '">' +
          text + '</span>';
        if (L.type === "ERROR")
          break;
      }
    }*/

    // PARSER
    var html;
    var tree = null;
    var parser = new JSParser(input);
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
          var isStatement = (head.indexOf('Stmnt') >= 0);
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
          text = text.replace(/.{20}/g, "$&\n");
          text = Handlebars._escape(text);
          text = text.replace(/\n/g, '&#8203;');
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
    }
  });

  Template.page.preserve(['#inputarea textarea']);

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
