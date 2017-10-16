# determine the platform
# use 32bit by default
$PLATFORM = "windows_x86"
$PYTHON_VERSION = "2.7.12" # For node-gyp

# take it from the environment if exists
if (Test-Path env:PLATFORM) {
  $PLATFORM = (Get-Item env:PLATFORM).Value
}

$script_path = Split-Path -parent $MyInvocation.MyCommand.Definition
$CHECKOUT_DIR = Split-Path -parent $script_path
$common_script = "${script_path}\build-dev-bundle-common.sh"

function Get-ShellScriptVariableFromFile {
  Param ([string]$Path, [string]$Name)
  $v = Select-String -Path $Path -Pattern "^\s*${Name}=(\S+)" | % { $_.Matches[0].Groups[1].Value } | Select-Object -First 1
  $v = $v.Trim()
  Write-Output $v
}

# extract the bundle version from the meteor bash script
$BUNDLE_VERSION = Get-ShellScriptVariableFromFile -Path "${CHECKOUT_DIR}\meteor" -Name 'BUNDLE_VERSION'

# extract the major package versions from the build-dev-bundle-common script.
$MONGO_VERSION = Get-ShellScriptVariableFromFile -Path $common_script -Name 'MONGO_VERSION'
$NODE_VERSION = Get-ShellScriptVariableFromFile -Path $common_script -Name 'NODE_VERSION'
$NPM_VERSION = Get-ShellScriptVariableFromFile -Path $common_script -Name 'NPM_VERSION'

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

# add bin to the front of the path so we can use our own node for building
$env:PATH = "${DIR}\bin;${env:PATH}"

$webclient = New-Object System.Net.WebClient
$shell = New-Object -com shell.application

mkdir "$DIR\7z"
cd "$DIR\7z"
$webclient.DownloadFile("http://www.7-zip.org/a/7z1604.msi", "$DIR\7z\7z.msi")
$webclient.DownloadFile("http://www.7-zip.org/a/7z1604-extra.7z", "$DIR\7z\extra.7z")
msiexec /i 7z.msi /quiet /qn /norestart
ping -n 4 127.0.0.1 | out-null
& "C:\Program Files\7-Zip\7z.exe" x extra.7z
mv 7za.exe "$DIR\bin\7z.exe"
cd "$DIR\bin"

# download node
# same node on 32bit vs 64bit?
$node_link = "http://nodejs.org/dist/v${NODE_VERSION}/win-x86/node.exe"
$webclient.DownloadFile($node_link, "$DIR\bin\node.exe")

mkdir "$DIR\Release"
cd "$DIR\Release"
$nodeLibUrl = & "$DIR\bin\node.exe" -p process.release.libUrl
echo "Downloading node.lib from ${nodeLibUrl}"
$webclient.DownloadFile($nodeLibUrl, "$DIR\Release\node.lib")
echo ""
echo "Node lib:"
dir

mkdir "$DIR\include"
cd "$DIR\include"
$nodeHeadersUrl = & "$DIR\bin\node.exe" -p process.release.headersUrl
$nodeHeadersTar = "node-v${NODE_VERSION}-headers.tar"
$nodeHeadersTarGz = "${nodeHeadersTar}.gz"
echo "Downloading ${nodeHeadersTarGz} from ${nodeHeadersUrl}"
$webclient.DownloadFile($nodeHeadersUrl, "$DIR\include\$nodeHeadersTarGz")
7z x "$nodeHeadersTarGz"
7z x "$nodeHeadersTar"
$nodeHeadersDir = "node-v${NODE_VERSION}"
mv "$nodeHeadersDir\include\node" .
rm "$nodeHeadersTarGz"
rm "$nodeHeadersTar"
rm -Recurse -Force "$nodeHeadersDir"
echo ""
echo "Node headers:"
dir node

# On Windows we provide a reliable version of python.exe for use by
# node-gyp (the tool that rebuilds binary node modules). #WinPy

cd "$DIR"
$py_s3_url = "https://s3.amazonaws.com/com.meteor.static/windows-python/python-${PYTHON_VERSION}.7z"
$py_archive = "${DIR}\python.7z"
$webclient.DownloadFile($py_s3_url, $py_archive)
& "$DIR\bin\7z.exe" x "$py_archive"
rm -Recurse -Force "$py_archive"
$env:PATH = "${DIR}\python;${env:PATH}"
python --version

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
rm -Recurse -Force "$DIR\7z"

# Install the version of npm that we're actually going to expose from the
# dev bundle. Note that we use npm@1.4.12 to install npm@${NPM_VERSION}.
cd "${DIR}\lib"
npm install npm@${NPM_VERSION}
rm -Recurse -Force "${DIR}\bin\node_modules"
copy "${CHECKOUT_DIR}\scripts\npm.cmd" "${DIR}\bin\npm.cmd"
npm version

# npm depends on a hardcoded file path to node-gyp, so we need this to be
# un-flattened
cd node_modules\npm
npm install node-gyp

# Make sure node-gyp knows how to find its build tools.
$env:PYTHON = "${DIR}\python\python.exe"
$env:GYP_MSVS_VERSION = "2015"
$env:HOME = "$DIR";
$env:USERPROFILE = "$DIR";

# Make node-gyp install Node headers and libraries in $DIR\.node-gyp\.
# https://github.com/nodejs/node-gyp/blob/4ee31329e0/lib/node-gyp.js#L52
& "${DIR}\bin\node.exe" node_modules\node-gyp\bin\node-gyp.js install
$include_path = "${DIR}\.node-gyp\${NODE_VERSION}\include\node"
echo "Contents of ${include_path}:"
dir "$include_path"

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

cd $DIR

# mark the version
echo "${BUNDLE_VERSION}" | Out-File .bundle_version.txt -Encoding ascii

cd "$DIR\.."

# rename the folder with the devbundle
cmd /c rename "$DIR" "dev_bundle_${PLATFORM}_${BUNDLE_VERSION}"

& "C:\Program Files\7-zip\7z.exe" a -ttar dev_bundle.tar "dev_bundle_${PLATFORM}_${BUNDLE_VERSION}"
& "C:\Program Files\7-zip\7z.exe" a -tgzip "${CHECKOUT_DIR}\dev_bundle_${PLATFORM}_${BUNDLE_VERSION}.tar.gz" dev_bundle.tar
del dev_bundle.tar
cmd /c rmdir "dev_bundle_${PLATFORM}_${BUNDLE_VERSION}" /s /q

echo "Done building Dev Bundle!"
