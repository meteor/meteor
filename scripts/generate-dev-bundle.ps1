$ErrorActionPreference = "Stop"
$DebugPreference = "Continue"

Import-Module -Force "$PSScriptRoot\windows\dev-bundle-lib.psm1"
$PLATFORM = Get-MeteorPlatform

$PYTHON_VERSION = "3.9.5" # For node-gyp
& cmd /c 'du 2>&1'

$dirCheckout = (Get-Item $PSScriptRoot).parent.FullName
$shCommon = Join-Path $PSScriptRoot 'build-dev-bundle-common.sh'

$tempSrcNode = Join-Path $(Join-Path $dirCheckout 'temp_build_src') 'node.7z'

# This will be the temporary directory we build the dev bundle in.
$DIR = Join-Path $dirCheckout 'gdbXXX'

# extract the bundle version from the meteor bash script
$BUNDLE_VERSION = Read-VariableFromShellScript "${dirCheckout}\meteor" 'BUNDLE_VERSION'

# extract the major package versions from the build-dev-bundle-common script.
$MONGO_VERSION_64BIT = Read-VariableFromShellScript $shCommon 'MONGO_VERSION_64BIT'

$NPM_VERSION = Read-VariableFromShellScript $shCommon 'NPM_VERSION'

$NODE_VERSION = Read-VariableFromShellScript $shCommon 'NODE_VERSION'

# 7-zip path.
$system7zip = "C:\Program Files\7-zip\7z.exe"

# Required for downloading MongoDB via HTTPS
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# Since we reuse the same temp directory, cleanup from previous failed runs.
Remove-DirectoryRecursively $DIR

# Some commonly used paths in this script.
$dirBin = Join-Path $DIR 'bin'
$dirLib = Join-Path $DIR 'lib'
$dirServerLib = Join-Path $DIR 'server-lib'
$dirTemp = Join-Path $DIR 'temp'

# Use a cache just for this build.
$dirNpmCache = Join-Path $dirTemp 'npm-cache'

# Build our directory framework.
New-Item -ItemType Directory -Force -Path $DIR | Out-Null
New-Item -ItemType Directory -Force -Path $dirTemp | Out-Null
New-Item -ItemType Directory -Force -Path $dirBin | Out-Null
New-Item -ItemType Directory -Force -Path $dirLib | Out-Null
New-Item -ItemType Directory -Force -Path $dirServerLib | Out-Null

$webclient = New-Object System.Net.WebClient
$shell = New-Object -com shell.application

Function Invoke-Install7ZipApplication {
  Write-Host "Downloading 7-zip..." -ForegroundColor Magenta
  $7zMsiPath = Join-Path $dirTemp '7z.msi'
  # 32-bit, right now.  But this does not go in the bundle.
  $webclient.DownloadFile("https://www.7-zip.org/a/7z1604.msi", $7zMsiPath)

  Write-Host "Installing 7-zip system-wide..." -ForegroundColor Magenta
  & "msiexec.exe" /i $7zMsiPath /quiet /qn /norestart | Out-Null

  # Cleanup.
  Remove-Item $7zMsiPath
}

Function Add-7ZipTool {
  Write-Host "Downloading 7-zip 'extra'..." -ForegroundColor Magenta
  $extraArchive = Join-Path $dirTemp 'extra.7z'
  $webclient.DownloadFile("https://www.7-zip.org/a/7z1604-extra.7z", $extraArchive)

  $pathToExtract = 'x64/7za.exe'

  Write-Host 'Placing 7za.exe from extra.7z in \bin...' -ForegroundColor Magenta
  & "$system7zip" e $extraArchive -o"$dirTemp" $pathToExtract | Out-Null
  Move-Item $(Join-Path $dirTemp '7za.exe') $(Join-Path $dirBin "7z.exe")

  # Cleanup
  Remove-Item $extraArchive
}

Function Add-Python {
  # On Windows we provide a reliable version of python.exe for use by
  # node-gyp (the tool that rebuilds binary node modules).
  # This self-hosted 7z is created by archiving the result of running the
  # Python MSI installer (from python.org), targeted at a temp directory, and
  # only including: "Python" and "Utility Scripts". Then, 7z the temp directory.
  $pythonUrl = "https://s3.amazonaws.com/com.meteor.static/windows-python/",
    "$PLATFORM/python-${PYTHON_VERSION}.7z" -Join ''
  $pythonArchive = Join-Path $dirTemp 'python.7z'

  $webclient.DownloadFile($pythonUrl, $pythonArchive)

  Expand-7zToDirectory $pythonArchive $DIR

  $pythonDir = Join-Path $DIR 'python'
  $pythonExe = Join-Path $pythonDir 'python.exe'

  # Make sure the version is right, when python is called.
  if (!(cmd /c python.exe --version '2>&1' -Eq "Python ${PYTHON_VERSION}")) {
    throw "Python was not the version we expected it to be ($PYTHON_VERSION)"
  }

  Remove-Item $pythonArchive

  "$pythonExe"
}

Function Add-NodeAndNpm {
  if ("${NODE_VERSION}" -match "-rc\.\d+$") {
    $nodeUrlBase = 'https://nodejs.org/download/rc'
  } else {
    $nodeUrlBase = 'https://nodejs.org/dist'
  }

  $nodeArchitecture = 'win-x64'

  # Various variables which are used as part of directory paths and
  # inside Node release and header archives.
  $nodeVersionSegment = "v${NODE_VERSION}"
  $nodeNameVersionSegment = "node-${nodeVersionSegment}"
  $nodeNameSegment = "${nodeNameVersionSegment}-${nodeArchitecture}"

  # The URL for the Node 7z archive, which includes its shipped version of npm.
  $nodeUrl = $nodeUrlBase, $nodeVersionSegment,
    "${nodeNameSegment}.7z" -Join '/'

  $archiveNode = Join-Path $dirTemp 'node.7z'
  Write-Host "Downloading Node.js from ${nodeUrl}" -ForegroundColor Magenta
  $webclient.DownloadFile($nodeUrl, $archiveNode)

  Write-Host "Extracting Node 7z file..." -ForegroundColor Magenta
  & "$system7zip" x $archiveNode -o"$dirTemp" | Out-Null

  # This will be the location of the extracted Node tarball.
  $dirTempNode = Join-Path $dirTemp $nodeNameSegment

  # Delete the no longer necessary Node archive.
  Remove-Item $archiveNode

  $tempNodeExe = Join-Path $dirTempNode 'node.exe'
  $tempNpmCmd = Join-Path $dirTempNode 'npm.cmd'

  # Get additional values we'll need to fetch to complete this release.
  $nodeProcessRelease = @{
    headersUrl = & "$tempNodeExe" -p 'process.release.headersUrl'
    libUrl = & "$tempNodeExe" -p 'process.release.libUrl'
  }

  if (!($nodeProcessRelease.headersUrl -And $nodeProcessRelease.libUrl)) {
    throw "No 'headersUrl' or 'libUrl' in Node.js's 'process.release' output."
  }

  $nodeHeadersTarGz = Join-Path $dirTemp 'node-headers.tar.gz'
  Write-Host "Downloading Node headers from $($nodeProcessRelease.headersUrl)" `
    -ForegroundColor Magenta
  $webclient.DownloadFile($nodeProcessRelease.headersUrl, $nodeHeadersTarGz)

  $dirTempNodeHeaders = Join-Path $dirTemp 'node-headers'
  if (!(Expand-TarGzToDirectory $nodeHeadersTarGz $dirTempNodeHeaders)) {
    throw "Couldn't extract Node headers."
  }

  # Move the extracted include directory to the Node dir.
  $dirTempNodeHeadersInclude = `
    Join-Path $dirTempNodeHeaders $nodeNameVersionSegment |
    Join-Path -ChildPath 'include'
  Move-Item $dirTempNodeHeadersInclude $dirTempNode
  $dirTempNodeHeadersInclude = Join-Path $dirTempNode 'include'

  # The node.lib goes into a \Release directory.
  $dirNodeRelease = Join-Path $dirTempNode 'Release'
  New-Item -ItemType Directory -Force -Path $dirNodeRelease | Out-Null

  Write-Host "Downloading node.lib from $($nodeProcessRelease.libUrl)" `
    -ForegroundColor Magenta
  $nodeLibTarget = Join-Path $dirNodeRelease 'node.lib'
  $webclient.DownloadFile($nodeProcessRelease.libUrl, $nodeLibTarget)

  #
  # We should now have a fully functionaly local Node with headers to use.
  #

  # Let's install the npm version we really want.
  Write-Host "Installing npm@${NPM_VERSION}..." -ForegroundColor Magenta
  Write-Host (& "$tempNpmCmd" install --prefix="$dirLib" --no-bin-links --save `
      --cache="$dirNpmCache" --nodedir="$dirTempNode" npm@${NPM_VERSION} 2>&1)

  if ($LASTEXITCODE -ne 0) {
    throw "Couldn't install npm@${NPM_VERSION}."
  }

  # After finishing up with our Node, let's put it in its final home
  # and abandon this local npm directory.

  # Move exe and cmd files to the \bin directory.
  Move-Item $(Join-Path $dirTempNode '*.exe') $dirBin
  # Move-Item $(Join-Path $dirTempNode '*.cmd') $dirBin
  Move-Item $dirTempNodeHeadersInclude $DIR
  Move-Item $dirNodeRelease $DIR

  $finalNodeExe = Join-Path $dirBin 'node.exe'
  $finalNpmCmd = Join-Path $dirBin 'npm.cmd'

  # Uses process.execPath to infer dev_bundle\bin, npm location, &c.
  & "$finalNodeExe" "${dirCheckout}\scripts\windows\link-npm-bin-commands.js"

  # We use our own npm.cmd.
  Copy-Item "${dirCheckout}\scripts\npm.cmd" $finalNpmCmd

  Remove-DirectoryRecursively $dirTempNodeHeaders
  Remove-DirectoryRecursively $dirTempNode

  return New-Object -Type PSObject -Prop $(@{
    node = $finalNodeExe
    npm = $finalNpmCmd
  })
}

Function Add-Mongo {
  # Mongo >= 3.4 no longer supports 32-bit (x86) architectures, so we package
  # the latest 3.2 version of Mongo for those builds and >= 3.4 for x64.
  $mongo_filenames = @{
    windows_x64 = "mongodb-windows-x86_64-${MONGO_VERSION_64BIT}"
  }

  # the folder inside the zip still uses win32
  $mongo_zip_filenames = @{
    windows_x64 = "mongodb-win32-x86_64-windows-${MONGO_VERSION_64BIT}"
  }

  $previousCwd = $PWD

  cd "$DIR"
  mkdir "$DIR\mongodb"
  mkdir "$DIR\mongodb\bin"
  $mongo_name = $mongo_filenames.Item($PLATFORM)
  $mongo_zip_name = $mongo_zip_filenames.Item($PLATFORM)
  $mongo_link = "https://fastdl.mongodb.org/windows/${mongo_name}.zip"
  $mongo_zip = "$DIR\mongodb\mongo.zip"

  Write-Host "Downloading Mongo from ${mongo_link}..." -ForegroundColor Magenta
  $webclient.DownloadFile($mongo_link, $mongo_zip)

  Write-Host "Extracting Mongo ${mongo_zip}..." -ForegroundColor Magenta
  $zip = $shell.NameSpace($mongo_zip)
  foreach($item in $zip.items()) {
    $shell.Namespace("$DIR\mongodb").copyhere($item, 0x14) # 0x10 - overwrite, 0x4 - no dialog
  }

  Write-Host "Putting MongoDB mongod.exe in mongodb\bin" -ForegroundColor Magenta
  cp "$DIR\mongodb\$mongo_zip_name\bin\mongod.exe" $DIR\mongodb\bin
  Write-Host "Putting MongoDB mongos.exe in mongodb\bin" -ForegroundColor Magenta
  cp "$DIR\mongodb\$mongo_zip_name\bin\mongos.exe" $DIR\mongodb\bin

  Write-Host "Removing the old Mongo zip..." -ForegroundColor Magenta
  rm -Recurse -Force $mongo_zip
  Write-Host "Removing the old Mongo directory..." -ForegroundColor Magenta
  rm -Recurse -Force "$DIR\mongodb\$mongo_zip_name"

  cd "$previousCwd"
}

Function Add-NpmModulesFromJsBundleFile {
  Param (
    [Parameter(Mandatory=$True, Position=0)]
    [string]$SourceJs,
    [Parameter(Mandatory=$True, Position=1)]
    [string]$Destination,
    [Parameter(Mandatory=$True)]
    $Commands,
    [bool]$Shrinkwrap = $False
  )

  $previousCwd = $PWD

  If (!(Test-Path $SourceJs)) {
    throw "Couldn't find the source: $SourceJs"
  }

  New-Item -ItemType Directory -Force -Path $Destination | Out-Null

  cd "$Destination"

  Write-Host "Writing 'package.json' from ${SourceJs} to ${Destination}" `
    -ForegroundColor Magenta
  & "$($Commands.node)" $SourceJs |
    Out-File -FilePath $(Join-Path $Destination 'package.json') -Encoding ascii

  # No bin-links because historically, they weren't used anyway.
  & "$($Commands.npm)" install
  if ($LASTEXITCODE -ne 0) {
    throw "Couldn't install npm packages."
  }

  # As of npm@5, this just renames `package-lock.json` to `npm-shrinkwrap.json`.
  if ($Shrinkwrap -eq $True) {
    & "$($Commands.npm)" shrinkwrap
    if ($LASTEXITCODE -ne 0) {
      throw "Couldn't make shrinkwrap."
    }
  }

  cd node_modules

  cd "$previousCwd"
}

# Install the global 7zip application, if necessary.
if (!(Test-Path "$system7zip")) {
  Write-Host "Installing 7-zip since not found at ${system7zip}" `
    -ForegroundColor Magenta
  Invoke-Install7ZipApplication
}

# Download and install 7zip command-line tool into \bin
Add-7ZipTool

# Download and install Mongo binaries into \bin
Add-Mongo

# Add Python to \bin, and use it for Node Gyp.
$env:PYTHON = Add-Python

# Set additional options for node-gyp
$env:GYP_MSVS_VERSION = "2015"
$env:npm_config_nodedir = "$DIR"
$env:npm_config_cache = "$dirNpmCache"

# Allow running $dirBin commands like node and npm.
$env:PATH = "$env:PATH;$dirBin"

# Install Node.js and npm and get their paths to use from here on.
$toolCmds = Add-NodeAndNpm

"Location of node.exe:"
& Get-Command node | Select-Object -ExpandProperty Definition

"Node process.versions:"
& node -p 'process.versions'

"Location of npm.cmd:"
& Get-Command npm | Select-Object -ExpandProperty Definition

"Npm 'version':"
& npm version

npm config set loglevel error

#
# Install the npms for the 'server'.
#
$npmServerArgs = @{
  sourceJs = "${dirCheckout}\scripts\dev-bundle-server-package.js"
  destination = $dirServerLib
  commands = $toolCmds
  shrinkwrap = $True
}
Add-NpmModulesFromJsBundleFile @npmServerArgs

# These are used by the Meteor tool bundler and written to the Meteor build.
# For information, see the 'ServerTarget' class in tools/isobuild/bundler.js,
# and look for 'serverPkgJson' and 'npm-shrinkwrap.json'
mkdir -Force "${DIR}\etc"
Move-Item $(Join-Path $dirServerLib 'package.json') "${DIR}\etc\"
Move-Item $(Join-Path $dirServerLib 'npm-shrinkwrap.json') "${DIR}\etc\"

#
# Install the npms for the 'tool'.
#
$npmToolArgs = @{
  sourceJs = "${dirCheckout}\scripts\dev-bundle-tool-package.js"
  destination = $dirLib
  commands = $toolCmds
}
Add-NpmModulesFromJsBundleFile @npmToolArgs

Write-Host "Done writing node_modules build(s)..." -ForegroundColor Magenta

Write-Host "Removing temp scratch $dirTemp" -ForegroundColor Magenta
Remove-DirectoryRecursively $dirTemp

# mark the version
Write-Host "Writing out the bundle version..." -ForegroundColor Magenta
echo "${BUNDLE_VERSION}" | Out-File $(Join-Path $DIR '.bundle_version.txt') -Encoding ascii

$devBundleName = "dev_bundle_${PLATFORM}_${BUNDLE_VERSION}"
$dirBundlePreArchive = Join-Path $dirCheckout $devBundleName
$devBundleTmpTar = Join-Path $dirCheckout "dev_bundle.tar"
$devBundleTarGz = Join-Path $dirCheckout "${devBundleName}.tar.gz"

# Cleanup from previous builds, if there are things in our way.
Remove-DirectoryRecursively $dirBundlePreArchive
If (Test-Path $devBundleTmpTar) {
  Remove-Item -Force $devBundleTmpTar
}
If (Test-Path $devBundleTarGz) {
  Remove-Item -Force $devBundleTarGz
}

# Get out of this directory, before we rename it.
cd "$DIR\.."

# rename the folder with the devbundle
Write-Host "Renaming to $dirBundlePreArchive" -ForegroundColor Magenta
Rename-Item "$DIR" $dirBundlePreArchive

Write-Host "Compressing $dirBundlePreArchive to $devBundleTmpTar"
& "$system7zip" a -ttar $devBundleTmpTar $dirBundlePreArchive
if ($LASTEXITCODE -ne 0) {
  throw "Failure while building $devBundleTmpTar"
}

if ((Get-Item $devBundleTmpTar).length -lt 50mb) {
  throw "Dev bundle .tar is <50mb. If this is correct, update this message!"
}

Write-Host "Compressing $devBundleTmpTar into $devBundleTarGz" `
  -ForegroundColor Magenta
& "$system7zip" a -tgzip $devBundleTarGz $devBundleTmpTar
if ($LASTEXITCODE -ne 0) {
  throw "Failure while building $devBundleTarGz"
}

if ((Get-Item $devBundleTarGz).length -lt 30mb) {
  throw "Dev bundle .tar.gz is <30mb. If this is correct, update this message!"
}

Write-Host "Removing $devBundleTmpTar" -ForegroundColor Magenta
Remove-Item -Force $devBundleTmpTar

Write-Host "Removing the '$devBundleName' temp directory." `
  -ForegroundColor Magenta
Remove-DirectoryRecursively $dirBundlePreArchive

Write-Host "Done building Dev Bundle!" -ForegroundColor Green
Exit 0
