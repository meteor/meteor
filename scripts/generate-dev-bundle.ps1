$scriptPath = split-path -parent $MyInvocation.MyCommand.Definition
$DIR = $scriptPath + "\generate-dev-bundle-XXXXXXXX"
echo $DIR

cmd /C "rmdir /S /Q ${DIR}"

New-Item -Type Directory -Name generate-dev-bundle-XXXXXXXX
Set-Location $DIR

# install dev-bundle-package.json
mkdir build
cd build
mkdir npm-install
cd npm-install

npm config set loglevel error
cp "${DIR}/../dev-bundle-package.json" package.json
npm install
npm shrinkwrap

rm -Recurse -Force "${DIR}\build\npm-install\node_modules\.bin"
cp -R node_modules "${DIR}\lib\node_modules"

rm -Recurse -Force "${DIR}\build"

# XXX we need to copy the package.json etc
# XXX delete extra fibers code

cd $DIR\lib

# commented out ones don't work on Windows, we don't plan to support them in the first release
echo "{}" | Out-File package.json -Encoding ascii # otherwise it doesn't install in local dir
npm install request@2.47.0
npm install fstream@1.0.2
npm install tar@1.0.2
# npm install kexec@0.2.0
npm install source-map@0.1.40
npm install browserstack-webdriver@2.41.1
npm install node-inspector@0.7.4
npm install chalk@0.5.1
npm install sqlite3@3.0.2
# npm install netroute@0.2.5
npm install phantomjs@1.9.12
npm install http-proxy@1.6.0
npm install esprima@1.2.2
npm install https://github.com/meteor/node-eachline/tarball/ff89722ff94e6b6a08652bf5f44c8fffea8a21da
# npm install "https://github.com/meteor/cordova-cli/tarball/0c9b3362c33502ef8f6dba514b87279b9e440543"

Set-Location $DIR

mkdir $DIR\mongodb
mkdir $DIR\mongodb\bin

$webclient = New-Object System.Net.WebClient

# download Mongo
$mongo_name = "mongodb-win32-i386-2.4.12"
$mongo_link = "https://fastdl.mongodb.org/win32/${mongo_name}.zip"
$mongo_zip = "$DIR\mongodb\mongo.zip"

$webclient.DownloadFile($mongo_link, $mongo_zip)

$shell = new-object -com shell.application
$zip = $shell.NameSpace($mongo_zip)
foreach($item in $zip.items()) {
  $shell.Namespace("$DIR\mongodb").copyhere($item, 0x14) # 0x10 - overwrite, 0x4 - no dialog
}

cp "$DIR\mongodb\$mongo_name\bin\mongod.exe" $DIR\mongodb\bin
cp "$DIR\mongodb\$mongo_name\bin\mongo.exe" $DIR\mongodb\bin

rm -Recurse -Force $mongo_zip
rm -Recurse -Force "$DIR\mongodb\$mongo_name"

mkdir bin
Set-Location bin

# download node
$node_link = "http://nodejs.org/dist/v0.10.33/node.exe"
$webclient.DownloadFile($node_link, "$DIR\bin\node.exe")
# install npm
echo "{}" | Out-File package.json -Encoding ascii # otherwise it doesn't install in local dir
npm install npm
cp node_modules\npm\bin\npm.cmd .

Set-Location $DIR

# mark the version
echo "0.4.0" | Out-File .bundle_version.txt -Encoding ascii

Set-Location $DIR\..

echo "Done building Dev Bundle!"

