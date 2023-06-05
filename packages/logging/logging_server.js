import chalk from 'chalk';

Formatter = {};
Formatter.prettify = function(line, color){
    if(!color) return line;
    return chalk[color](line);
};
