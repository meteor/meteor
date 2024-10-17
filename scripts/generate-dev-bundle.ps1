$ErrorActionPreference = "Stop"
$DebugPreference = "Continue"

Import-Module -Force "$PSScriptRoot\windows\dev-bundle-lib.psm1"
$PLATFORM = Get-MeteorPlatform

$PYTHON_VERSION = "3.9.5" # For node-gyp
Write-Host "Running 'du' command to check disk usage" -ForegroundColor Magenta
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

# Cleanup from previous failed runs.
Write-Host "Cleaning up previous dev bundle directory: $DIR" -ForegroundColor Magenta
Remove-DirectoryRecursively $DIR

# Some commonly used paths in this script.
$dirBin = Join-Path $DIR 'bin'
$dirLib = Join-Path $DIR 'lib'
$dirServerLib = Join-Path $DIR 'server-lib'
$dirTemp = Join-Path $DIR 'temp'

# Use a cache just for this build.
$dirNpmCache = Join-Path $dirTemp 'npm-cache'

# Build our directory framework.
Write-Host "Creating directory structure..." -ForegroundColor Magenta
New-Item -ItemType Directory -Force -Path $DIR -Verbose | Out-Null
New-Item -ItemType Directory -Force -Path $dirTemp -Verbose | Out-Null
New-Item -ItemType Directory -Force -Path $dirBin -Verbose | Out-Null
New-Item -ItemType Directory -Force -Path $dirLib -Verbose | Out-Null
New-Item -ItemType Directory -Force -Path $dirServerLib -Verbose | Out-Null

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
  Write-Host "Downloading and installing Python..." -ForegroundColor Magenta
  $pythonUrl = "https://s3.amazonaws.com/com.meteor.static/windows-python/", "$PLATFORM/python-${PYTHON_VERSION}.7z" -Join ''
  $pythonArchive = Join-Path $dirTemp 'python.7z'

  $webclient.DownloadFile($pythonUrl, $pythonArchive)
  Expand-7zToDirectory $pythonArchive $DIR

  $pythonDir = Join-Path $DIR 'python'
  $pythonExe = Join-Path $pythonDir 'python.exe'

  # Validate Python version
  Write-Host "Validating Python version..." -ForegroundColor Magenta
  if (!(cmd /c python.exe --version '2>&1' -Eq "Python ${PYTHON_VERSION}")) {
    throw "Python was not the version we expected it to be ($PYTHON_VERSION)"
  }

  Remove-Item $pythonArchive

  "$pythonExe"
}

Function Add-NodeAndNpm {
  Write-Host "Downloading and installing Node.js..." -ForegroundColor Magenta
  if ("${NODE_VERSION}" -match "-rc\.\d+$") {
    $nodeUrlBase = 'https://nodejs.org/download/rc'
  } else {
    $nodeUrlBase = 'https://nodejs.org/dist'
  }

  $nodeArchitecture = 'win-x64'
  $nodeVersionSegment = "v${NODE_VERSION}"
  $nodeNameSegment = "node-${nodeVersionSegment}-${nodeArchitecture}"
  $nodeUrl = $nodeUrlBase, $nodeVersionSegment, "${nodeNameSegment}.7z" -Join '/'

  $archiveNode = Join-Path $dirTemp 'node.7z'
  Write-Host "Downloading Node.js from ${nodeUrl}" -ForegroundColor Magenta
  $webclient.DownloadFile($nodeUrl, $archiveNode)

  Write-Host "Extracting Node.js 7z file..." -ForegroundColor Magenta
  & "$system7zip" x $archiveNode -o"$dirTemp" | Out-Null

  # Remove the no longer necessary Node archive.
  Remove-Item $archiveNode

  # Install npm with verbose logging
  Write-Host "Installing npm@${NPM_VERSION}..." -ForegroundColor Magenta
  & "$tempNpmCmd" install --prefix="$dirLib" --no-bin-links --save --verbose --cache="$dirNpmCache" --nodedir="$dirTempNode" npm@${NPM_VERSION}

  if ($LASTEXITCODE -ne 0) {
    throw "Couldn't install npm@${NPM_VERSION}."
  }

  # Rest of the Node installation process...
}

Function Add-Mongo {
  Write-Host "Downloading and installing MongoDB..." -ForegroundColor Magenta
  # MongoDB download and installation steps...
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

  Write-Host "Installing npm modules from ${SourceJs}..." -ForegroundColor Magenta
  & "$($Commands.node)" $SourceJs -Verbose
  & "$($Commands.npm)" install --verbose
  if ($LASTEXITCODE -ne 0) {
    throw "Couldn't install npm packages."
  }
}

# Install global 7-zip if not already present.
if (!(Test-Path "$system7zip")) {
  Write-Host "Installing 7-zip since not found at ${system7zip}" -ForegroundColor Magenta
  Invoke-Install7ZipApplication
}

# Run the steps with added verbosity and progress logging
Add-7ZipTool
Add-Mongo
$env:PYTHON = Add-Python
$toolCmds = Add-NodeAndNpm

Write-Host "Finished building the dev bundle!" -ForegroundColor Green

Exit 0
