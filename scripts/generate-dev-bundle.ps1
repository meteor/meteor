# determine the platform
# use 32bit by default
$PLATFORM = "windows_x86"
$MONGO_VERSION = "2.6.7"
$NODE_VERSION = "4.4.3"
$NPM_VERSION = "2.15.1"
$PYTHON_VERSION = "2.7.10" # For node-gyp

# take it form the environment if exists
if (Test-Path env:PLATFORM) {
  $PLATFORM = (Get-Item env:PLATFORM).Value
}

$script_path = Split-Path -parent $MyInvocation.MyCommand.Definition
$CHECKOUT_DIR = Split-Path -parent $script_path

# extract the bundle version from the meteor bash script
$BUNDLE_VERSION = Select-String -Path ($CHECKOUT_DIR + "\meteor") -Pattern 'BUNDLE_VERSION=(\S+)'  | % { $_.Matches[0].Groups[1].Value } | Select-Object -First 1
$BUNDLE_VERSION = $BUNDLE_VERSION.Trim()

# generate-dev-bundle-xxxxxxxx shortly
# convert relative path to absolute path because not all commands know how to deal with this themselves
$DIR = $executionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath("${script_path}\..\gdbXXX")
echo $DIR

cmd /c rmdir "$DIR" /s /q
mkdir "$DIR"
cd "$DIR"

mkdir lib
mkdir lib\node_modules
mkdir bin
cd bin

$webclient = New-Object System.Net.WebClient
$shell = New-Object -com shell.application

# download node
# same node on 32bit vs 64bit?
$node_link = "http://nodejs.org/dist/v${NODE_VERSION}/node.exe"
$webclient.DownloadFile($node_link, "$DIR\bin\node.exe")

# On Windows we provide a reliable version of python.exe for use by
# node-gyp (the tool that rebuilds binary node modules). #WinPy
$py_msi_link = "http://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}.msi"
$py_msi = "${DIR}\python.msi"
$webclient.DownloadFile($py_msi_link, $py_msi)
$py_dir = "${DIR}\python"
msiexec /i "$py_msi" TARGETDIR="$py_dir" /quiet /qn /norestart
$env:PATH = "${py_dir};${env:PATH}"

# download initial version of npm
$npm_zip = "$DIR\bin\npm.zip"

# These dist/npm archives were only published for 1.x versions of npm, and
# this is the most recent one.
$npm_link = "https://nodejs.org/dist/npm/npm-1.4.12.zip"
$webclient.DownloadFile($npm_link, $npm_zip)

$zip = $shell.NameSpace($npm_zip)
foreach($item in $zip.items()) {
  $shell.Namespace("$DIR\bin").copyhere($item, 0x14) # 0x10 - overwrite, 0x4 - no dialog
}

rm -Recurse -Force $npm_zip

# add bin to the front of the path so we can use our own node for building
$env:PATH = "${DIR}\bin;${env:PATH}"

# Install the version of npm that we're actually going to expose from the
# dev bundle. Note that we use npm@1.4.12 to install npm@${NPM_VERSION},
# but we use npm@3.1.2 to install dev_bundle\lib\node_modules, so that the
# dev bundle packages have a flatter structure. Three different versions!
cd "${DIR}\lib"
npm install npm@${NPM_VERSION}
rm -Recurse -Force "${DIR}\bin\node_modules"
copy "${CHECKOUT_DIR}\scripts\npm.cmd" "${DIR}\bin\npm.cmd"
npm version

mkdir "${DIR}\bin\npm3"
cd "${DIR}\bin\npm3"
echo "{}" | Out-File package.json -Encoding ascii # otherwise it doesn't install in local dir
npm install npm@3.1.2

# add bin\npm3 to the front of the path so we can use npm 3 for building
$env:PATH = "${DIR}\bin\npm3;${env:PATH}"

# npm depends on a hardcoded file path to node-gyp, so we need this to be
# un-flattened
cd node_modules\npm
npm install node-gyp
cd ..\..
cp node_modules\npm\bin\npm.cmd

# install dev-bundle-package.json
# use short folder names
# b for build
mkdir "$DIR\b\t"
cd "$DIR\b\t"

npm config set loglevel error
node "${CHECKOUT_DIR}\scripts\dev-bundle-server-package.js" | Out-File -FilePath package.json -Encoding ascii
npm install
npm shrinkwrap

mkdir -Force "${DIR}\server-lib\node_modules"
cmd /c robocopy "${DIR}\b\t\node_modules" "${DIR}\server-lib\node_modules" /e /nfl /ndl

mkdir -Force "${DIR}\etc"
Move-Item package.json "${DIR}\etc\"
Move-Item npm-shrinkwrap.json "${DIR}\etc\"

mkdir -Force "${DIR}\b\p"
cd "${DIR}\b\p"
node "${CHECKOUT_DIR}\scripts\dev-bundle-tool-package.js" | Out-File -FilePath package.json -Encoding ascii
npm install
cmd /c robocopy "${DIR}\b\p\node_modules" "${DIR}\lib\node_modules" /e /nfl /ndl
cd "$DIR"
cmd /c rmdir "${DIR}\b" /s /q

cd "$DIR"
mkdir "$DIR\mongodb"
mkdir "$DIR\mongodb\bin"

# download Mongo
$mongo_name = "mongodb-win32-i386-${MONGO_VERSION}"
If ($PLATFORM -eq 'windows_x86_64') {
  # 64-bit would be mongodb-win32-x86_64-2008plus-${MONGO_VERSION}.zip
  $mongo_name = "mongodb-win32-x86_64-2008plus-${MONGO_VERSION}"
}
$mongo_link = "https://fastdl.mongodb.org/win32/${mongo_name}.zip"
$mongo_zip = "$DIR\mongodb\mongo.zip"

$webclient.DownloadFile($mongo_link, $mongo_zip)

$zip = $shell.NameSpace($mongo_zip)
foreach($item in $zip.items()) {
  $shell.Namespace("$DIR\mongodb").copyhere($item, 0x14) # 0x10 - overwrite, 0x4 - no dialog
}

cp "$DIR\mongodb\$mongo_name\bin\mongod.exe" $DIR\mongodb\bin
cp "$DIR\mongodb\$mongo_name\bin\mongo.exe" $DIR\mongodb\bin

rm -Recurse -Force $mongo_zip
rm -Recurse -Force "$DIR\mongodb\$mongo_name"

# Remove npm 3 before we package the dev bundle
rm -Recurse -Force "${DIR}\bin\npm3"

rm -Recurse -Force "$py_msi"
python --version

cd $DIR

# mark the version
echo "${BUNDLE_VERSION}" | Out-File .bundle_version.txt -Encoding ascii

cd "$DIR\.."

# rename the folder with the devbundle
cmd /c rename "$DIR" "dev_bundle_${PLATFORM}_${BUNDLE_VERSION}"

cmd /c 7z.exe a -ttar dev_bundle.tar "dev_bundle_${PLATFORM}_${BUNDLE_VERSION}"
cmd /c 7z.exe a -tgzip "${CHECKOUT_DIR}\dev_bundle_${PLATFORM}_${BUNDLE_VERSION}.tar.gz" dev_bundle.tar
del dev_bundle.tar
cmd /c rmdir "dev_bundle_${PLATFORM}_${BUNDLE_VERSION}" /s /q

echo "Done building Dev Bundle!"
