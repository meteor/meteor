Formatter = {};
Formatter.prettify = function(line, color){
    if(!color) return line;
    return require("chalk")[color](line);
};
