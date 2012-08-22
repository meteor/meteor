var fs = require('fs');
var exec = require('child_process').exec;
var crypto = require('crypto');

function deleteFile(file) {
    try {
        if (fs.statSync(file).isFile()) {
            fs.unlinkSync(file);
        }
    } catch (e) {}
}

function cleanup(all) {
    if (all) {
        deleteFile('Meteor.msi');
    }

    deleteFile('Meteor.wixpdb');
    deleteFile('admin\\wix\\Meteor.wixobj');
    deleteFile('admin\\wix\\Meteor.wxs');
    deleteFile('admin\\wix\\extra\\license.rtf');
}

var files = '';
var fileHashes = [];
var readFiles = function(dir, tabs) {
    var dirFiles = fs.readdirSync(dir);

    for (var file in dirFiles) {
        var fileObject = dir + '\\' + dirFiles[file];

        if (fileObject.match(/\.\\\.git|\.\\admin|\.\\dev_bundle\\bin\\node_modules\\(?!npm)|\.\\\.sublime-(?:project|workspace)|\.\\dev_bundle_.*/) === null) {
            console.log(fileObject);
            var tabString = '';
            for (var i = 0; i < tabs; i++)
                tabString += "    ";

            var stat = fs.statSync(fileObject);
            var fileHash = crypto.createHash('md5').update(fileObject).digest("hex");
            if (stat.isDirectory()) {
                if (dirFiles[file].match(/dev_bundle/g) === null) {
                    files += "            " + tabString + "<Directory Id=\"D" + fileHash + "\" Name=\"" + dirFiles[file] + "\">\r\n";
                    readFiles(fileObject, tabs + 1);
                    files += "            " + tabString + "</Directory>\r\n";
                } else {
                    readFiles(fileObject, tabs);
                }
            } else if (stat.isFile()) {
                fileHashes.push(fileHash);
                files += "            " + tabString + "<Component Id=\"C" + fileHash + "\" Guid=\"*\"><File Id=\"F" + fileHash + "\" Source=\"" + fileObject + "\" KeyPath=\"yes\"/></Component>\r\n";
            }
        }
    }
};

console.log('Cleaning...');
cleanup(true);
console.log('Listing files...');
files += "\t\t<DirectoryRef Id=\"INSTALLDIR\">\r\n";
readFiles('.', 0);
files += "\t\t</DirectoryRef>\r\n\t\t<ComponentGroup Id=\"Meteor\">\r\n\t\t\t<ComponentRef Id=\"Installation\" />\r\n";
for (var hash in fileHashes) {
    files += "\t\t\t<ComponentRef Id=\"C" + fileHashes[hash] + "\" />\r\n";
}
files += "\t\t</ComponentGroup>";

var specifications = fs.readFileSync('admin\\meteor.spec', 'utf8');
var version = specifications.match(/Version: (.*)/)[1];
var version_numbers = version.match(/(.*)\.(.*)\.(.*)/);
var major = parseInt(version_numbers[1]);
var minor = parseInt(version_numbers[2]);
var build = parseInt(version_numbers[3]);
if (build == 0) {
    if (minor == 0) {
        major = major - 1;
        minor = 99;
        build = 99;
    }
    else {
        minor = minor - 1;
        build = 99;
    }
} else {
    build = build - 1;
}
var prev_version = major + '.' + minor + '.' + build;

fs.writeFileSync('admin\\wix\\extra\\license.rtf', '{\\rtf1\\ansi\\deff0\\nouicompat{\\fonttbl{\\f0\\fnil\\fcharset0 Courier New;}{\\f1\\fnil\\fcharset238 Courier New;}}\r\n{\\*\\generator Riched20 6.2.8400}\\viewkind4\\uc1 \r\n\\pard\\f0\\fs22\\lang1033 ' + fs.readFileSync('LICENSE.txt', 'utf8').replace (/\r\n/gm, "\\par\r\n"), 'utf8');

var template = fs.readFileSync('admin\\wix\\Meteor_template.wxs', 'utf8');
template = template.replace(/{{NAME}}/g, 'Meteor PREVIEW');
template = template.replace(/{{VERSION}}/g, version);
template = template.replace(/{{PREV_VERSION}}/g, prev_version);
template = template.replace(/{{FILES}}/g, files);

if (template.match('{{.*}}')) {
    console.log('ERROR: There was something not replaced in the Meteor template.');
    process.exit(1);
} else {
    fs.writeFileSync('admin\\wix\\Meteor.wxs', template, 'utf8');

    console.log('Compiling...');
    exec('candle -o admin\\wix\\Meteor.wixobj admin\\wix\\Meteor.wxs', function (error, stdout, stderr) {
        if (stdout)   console.log(stdout);
        if (stderr) { console.log(stderr); process.exit(1); }
        if (error) {  console.log(error);  process.exit(1); }

        console.log('Linking...');
        exec('light -sw1076 -out Meteor.msi -ext WixUIExtension admin\\wix\\Meteor.wixobj', function (error, stdout, stderr) {
            if (stdout)   console.log(stdout);
            if (stderr) { console.log(stderr); process.exit(1); }
            if (error) {  console.log(error);  process.exit(1); }

            console.log('Cleaning...');
            cleanup(false);

            console.log('Packed!');
        });
    });
}