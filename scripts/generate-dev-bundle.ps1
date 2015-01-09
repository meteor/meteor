# determine the platform
# use 32bit by default
$PLATFORM = "windows_x86"

# take it form the environment if exists
if (Test-Path variable:global:PLATFORM) {
  $PLATFORM = (get-item env:PLATFORM).Value
}

$scriptPath = split-path -parent $MyInvocation.MyCommand.Definition
$CHECKOUT_DIR = split-path -parent $scriptPath

# extract the bundle version from the meteor bash script
$BUNDLE_VERSION = select-string -Path ($CHECKOUT_DIR + "\meteor") -Pattern 'BUNDLE_VERSION=(\S+)'  | % { $_.Matches[0].Groups[1].Value } | select-object -First 1
$BUNDLE_VERSION = $BUNDLE_VERSION.Trim()

# generate-dev-bundle-xxxxxxxx shortly
$DIR = $scriptPath + "\gdbXXX"
echo $DIR

# removing folders isn't easy on Windows, try both commands
Remove-Item -Recurse -Force "${DIR}"
cmd /C "rmdir /S /Q ${DIR}"

New-Item -Type Directory "$DIR"
Set-Location "$DIR"

# install dev-bundle-package.json
# use short folder names
mkdir b # for build
cd b
mkdir t
cd t

npm config set loglevel error
node "${CHECKOUT_DIR}\scripts\dev-bundle-server-package.js" | out-file -FilePath package.json -Encoding ascii
npm install
npm shrinkwrap

mkdir -Force "${DIR}\server-lib\node_modules"
cp -R "${DIR}\b\t\node_modules\*" "${DIR}\server-lib\node_modules\"

mkdir -Force "${DIR}\b\p"
cd "${DIR}\b\p"
node "${CHECKOUT_DIR}\scripts\dev-bundle-tool-package.js" | out-file -FilePath package.json -Encoding ascii
npm install
npm dedupe
# install the latest flatten-packages
npm install -g flatten-packages
flatten-packages .
cp -R "${DIR}\b\p\node_modules\" "${DIR}\lib\node_modules\"
cd "$DIR"

# deleting folders is hard so we try twice
rm -Recurse -Force "${DIR}\b"
cmd /C "rmdir /s /q $DIR\b"

cd "$DIR"
mkdir "$DIR\mongodb"
mkdir "$DIR\mongodb\bin"

$webclient = New-Object System.Net.WebClient

# download Mongo
$mongo_name = "mongodb-win32-i386-2.4.12"
If ($PLATFORM -eq 'windows_x86_64') {
  # 64-bit would be mongodb-win32-x86_64-2008plus-2.4.12.zip
  $mongo_name = "mongodb-win32-x86_64-2008plus-2.4.12"
}
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
# same node on 32bit vs 64bit?
$node_link = "http://nodejs.org/dist/v0.10.33/node.exe"
$webclient.DownloadFile($node_link, "$DIR\bin\node.exe")
# install npm
echo "{}" | Out-File package.json -Encoding ascii # otherwise it doesn't install in local dir
npm install npm --save
flatten-packages .

# npm depends on a hardcoded file path to node-gyp, so we need this to be
# un-flattened
cd node_modules\npm
npm install node-gyp
cd ..\..

cp node_modules\npm\bin\npm.cmd .

Set-Location $DIR

# mark the version
echo "${BUNDLE_VERSION}" | Out-File .bundle_version.txt -Encoding ascii

Set-Location "$DIR\.."

# rename and move the folder with the devbundle
# XXX this can generate a path that is too long
Move-Item "$DIR" "dev_bundle_${PLATFORM}_${BUNDLE_VERSION}"

cmd /c 7z.exe a -ttar dev_bundle.tar "dev_bundle_${PLATFORM}_${BUNDLE_VERSION}" 
cmd /c 7z.exe a -tgzip "${CHECKOUT_DIR}\dev_bundle_${PLATFORM}_${BUNDLE_VERSION}.tar.gz" dev_bundle.tar
del dev_bundle.tar
rm -Recurse -Force "dev_bundle_${PLATFORM}_${BUNDLE_VERSION}"
cmd /C "rmdir /s /q dev_bundle_${PLATFORM}_${BUNDLE_VERSION}"

echo "Done building Dev Bundle!"

