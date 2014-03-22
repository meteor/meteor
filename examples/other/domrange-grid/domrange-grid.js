if (Meteor.isClient) {
  Meteor.startup(function () {
    var N = 10;
    var numColors = 6;
    var colors = [];
    for(var z = 0; z < numColors; z++)
      colors[z] = z;

    var guid = 1;

    var table = $('<table id="grid"></table>');
    $(table).appendTo("body");
    var rows = [];
    var tableContent = new UI.DomRange;
    var makeCell = function (row) {
      var cells = row.cells;
      var tr = row.dom.elements()[0];
      var cell = {color: Random.choice(colors),
                  guid: String(guid++)};
      cell.dom = new UI.DomRange(cell);
      cells.push(cell);
      cell.dom.add(cell.guid, $('<td class="color' +
                                cell.color + '">' +
                                cell.color + '</td>'));
      row.content.add(cell.guid, cell);
    };
    var makeRow = function () {
      var row = {cells: [], guid: String(guid++),
                 content: new UI.DomRange};
      row.dom = new UI.DomRange(row);
      rows.push(row);
      tableContent.add(row.guid, row);
      var tr = $("<tr></tr>")[0];
      row.dom.add(tr);
      UI.DomRange.insert(row.content, tr);
      var cells = row.cells;
      for(var c = 0; c < N; c++)
        makeCell(row);
    };
    for (var r = 0; r < N; r++)
      makeRow();

    UI.DomRange.insert(tableContent, table[0]);

    $(document).on('keydown', function (evt) {
      var deltaN = 0;
      var deltaC = 0;
      if (evt.which === 38) {
        deltaN = 1; // up
      } else if (evt.which === 40) {
        deltaN = -1; // down
      } else if (evt.which === 37) {
        deltaC = -1; // left
      } else if (evt.which === 39) {
        deltaC = 1; // right
      } else if (evt.which === 32) {
        // spacebar
        var row0 = rows.shift();
        rows.push(row0);
        tableContent.moveBefore(row0.guid, null);
        for (var i = 0; i < rows.length; i++) {
          var row = rows[i];
          var cell0 = row.cells.shift();
          row.cells.push(cell0);
          row.content.moveBefore(cell0.guid, null);
        }
      }

      if (deltaN === 1) {
        N += 1;
        for (var i = 0; i < N - 1; i++)
          // lengthen old rows
          makeCell(rows[i]);
        makeRow();
      } else if (deltaN === -1) {
        if (N === 0)
          return;
        N -= 1;
        tableContent.remove(rows[N].guid);
        rows.length = N;
        for (var i = 0; i < N; i++) {
          var row = rows[i];
          row.content.remove(row.cells[N].guid);
          rows[i].cells.length = N;
        }
      }

      if (deltaC) {
        for (var r = 0; r < N; r++) {
          var row = rows[r];
          for (var c = 0; c < N; c++) {
            var cell = row.cells[c];
            var td = cell.dom.elements()[0];
            var color =
                  (cell.color =
                   (cell.color + deltaC + numColors)
                   % numColors);
            td.innerHTML = color;
            td.className = 'color' + color;
          }
        }
      }
    });
  });
}
