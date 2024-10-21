$ErrorActionPreference = "Stop"
$DebugPreference = "Continue"
$VerbosePreference = "Continue"

Write-Host "Script started" -ForegroundColor Green

try {
    Write-Host "Importing module" -ForegroundColor Yellow
    Import-Module -Force "$PSScriptRoot\windows\dev-bundle-lib.psm1"

    Write-Host "Getting Meteor platform" -ForegroundColor Yellow
    $PLATFORM = Get-MeteorPlatform
    Write-Host "Platform: $PLATFORM" -ForegroundColor Yellow

    $PYTHON_VERSION = "3.9.5" # For node-gyp
    Write-Host "Python Version: $PYTHON_VERSION" -ForegroundColor Yellow

    Write-Host "Running 'du' command" -ForegroundColor Yellow
    & cmd /c 'du 2>&1'

    Write-Host "Setting up directories" -ForegroundColor Yellow
    $dirCheckout = (Get-Item $PSScriptRoot).parent.FullName
    $shCommon = Join-Path $PSScriptRoot 'build-dev-bundle-common.sh'
    $tempSrcNode = Join-Path $(Join-Path $dirCheckout 'temp_build_src') 'node.7z'
    $DIR = Join-Path $dirCheckout 'gdbXXX'

    Write-Host "Reading variables from shell scripts" -ForegroundColor Yellow
    $BUNDLE_VERSION = Read-VariableFromShellScript "${dirCheckout}\meteor" 'BUNDLE_VERSION'
    $MONGO_VERSION_64BIT = Read-VariableFromShellScript $shCommon 'MONGO_VERSION_64BIT'
    $NPM_VERSION = Read-VariableFromShellScript $shCommon 'NPM_VERSION'
    $NODE_VERSION = Read-VariableFromShellScript $shCommon 'NODE_VERSION'

    Write-Host "Setting up 7-zip" -ForegroundColor Yellow
    $system7zip = "C:\Program Files\7-zip\7z.exe"

    Write-Host "Setting SecurityProtocol" -ForegroundColor Yellow
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

    Write-Host "Removing directory: $DIR" -ForegroundColor Yellow
    Remove-DirectoryRecursively $DIR

    Write-Host "Setting up paths" -ForegroundColor Yellow
    $dirBin = Join-Path $DIR 'bin'
    $dirLib = Join-Path $DIR 'lib'
    $dirServerLib = Join-Path $DIR 'server-lib'
    $dirTemp = Join-Path $DIR 'temp'
    $dirNpmCache = Join-Path $dirTemp 'npm-cache'

    Write-Host "Creating directories" -ForegroundColor Yellow
    New-Item -ItemType Directory -Force -Path $DIR | Out-Null
    New-Item -ItemType Directory -Force -Path $dirTemp | Out-Null
    New-Item -ItemType Directory -Force -Path $dirBin | Out-Null
    New-Item -ItemType Directory -Force -Path $dirLib | Out-Null
    New-Item -ItemType Directory -Force -Path $dirServerLib | Out-Null

    Write-Host "Creating WebClient and Shell objects" -ForegroundColor Yellow
    $webclient = New-Object System.Net.WebClient
    $shell = New-Object -com shell.application

    Function Invoke-Install7ZipApplication {
        Write-Host "Downloading 7-zip..." -ForegroundColor Magenta
        $7zMsiPath = Join-Path $dirTemp '7z.msi'
        $webclient.DownloadFile("https://www.7-zip.org/a/7z1604.msi", $7zMsiPath)

        Write-Host "Installing 7-zip system-wide..." -ForegroundColor Magenta
        & "msiexec.exe" /i $7zMsiPath /quiet /qn /norestart | Out-Null

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

        Remove-Item $extraArchive
    }

    Function Add-Python {
        $pythonUrl = "https://s3.amazonaws.com/com.meteor.static/windows-python/",
            "$PLATFORM/python-${PYTHON_VERSION}.7z" -Join ''
        $pythonArchive = Join-Path $dirTemp 'python.7z'

        $webclient.DownloadFile($pythonUrl, $pythonArchive)

        Expand-7zToDirectory $pythonArchive $DIR

        $pythonDir = Join-Path $DIR 'python'
        $pythonExe = Join-Path $pythonDir 'python.exe'

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
        $nodeVersionSegment = "v${NODE_VERSION}"
        $nodeNameVersionSegment = "node-${nodeVersionSegment}"
        $nodeNameSegment = "${nodeNameVersionSegment}-${nodeArchitecture}"
        $nodeUrl = $nodeUrlBase, $nodeVersionSegment, "${nodeNameSegment}.7z" -Join '/'

        $archiveNode = Join-Path $dirTemp 'node.7z'
        Write-Host "Downloading Node.js from ${nodeUrl}" -ForegroundColor Magenta
        $webclient.DownloadFile($nodeUrl, $archiveNode)

        Write-Host "Extracting Node 7z file..." -ForegroundColor Magenta
        & "$system7zip" x $archiveNode -o"$dirTemp" | Out-Null

        $dirTempNode = Join-Path $dirTemp $nodeNameSegment
        Remove-Item $archiveNode

        $tempNodeExe = Join-Path $dirTempNode 'node.exe'
        $tempNpmCmd = Join-Path $dirTempNode 'npm.cmd'

        $nodeProcessRelease = @{
            headersUrl = & "$tempNodeExe" -p 'process.release.headersUrl'
            libUrl = & "$tempNodeExe" -p 'process.release.libUrl'
        }

        if (!($nodeProcessRelease.headersUrl -And $nodeProcessRelease.libUrl)) {
            throw "No 'headersUrl' or 'libUrl' in Node.js's 'process.release' output."
        }

        $nodeHeadersTarGz = Join-Path $dirTemp 'node-headers.tar.gz'
        Write-Host "Downloading Node headers from $($nodeProcessRelease.headersUrl)" -ForegroundColor Magenta
        $webclient.DownloadFile($nodeProcessRelease.headersUrl, $nodeHeadersTarGz)

        $dirTempNodeHeaders = Join-Path $dirTemp 'node-headers'
        if (!(Expand-TarGzToDirectory $nodeHeadersTarGz $dirTempNodeHeaders)) {
            throw "Couldn't extract Node headers."
        }

        $dirTempNodeHeadersInclude = Join-Path $dirTempNodeHeaders $nodeNameVersionSegment | Join-Path -ChildPath 'include'
        Move-Item $dirTempNodeHeadersInclude $dirTempNode
        $dirTempNodeHeadersInclude = Join-Path $dirTempNode 'include'

        $dirNodeRelease = Join-Path $dirTempNode 'Release'
        New-Item -ItemType Directory -Force -Path $dirNodeRelease | Out-Null

        Write-Host "Downloading node.lib from $($nodeProcessRelease.libUrl)" -ForegroundColor Magenta
        $nodeLibTarget = Join-Path $dirNodeRelease 'node.lib'
        $webclient.DownloadFile($nodeProcessRelease.libUrl, $nodeLibTarget)

        Write-Host "Installing npm@${NPM_VERSION}..." -ForegroundColor Magenta

        $npmOutput = $null
        $npmError = $null

        try {
            Write-Host "Current directory: $PWD" -ForegroundColor Yellow
            Write-Host "tempNpmCmd: $tempNpmCmd" -ForegroundColor Yellow
            Write-Host "dirLib: $dirLib" -ForegroundColor Yellow
            Write-Host "dirNpmCache: $dirNpmCache" -ForegroundColor Yellow
            Write-Host "dirTempNode: $dirTempNode" -ForegroundColor Yellow

            $env:NODE_DEBUG = "npm"
            $npmOutput = & "$tempNpmCmd" install --prefix="$dirLib" --no-bin-links --save `
                --cache="$dirNpmCache" --nodedir="$dirTempNode" npm@${NPM_VERSION} --verbose 2>&1

            if ($LASTEXITCODE -ne 0) {
                throw "npm installation exited with code $LASTEXITCODE"
            }
        } catch {
            $npmError = $_
        } finally {
            Write-Host "npm installation output:" -ForegroundColor Cyan
            $npmOutput | ForEach-Object { Write-Host $_ -ForegroundColor Cyan }

            if ($npmError) {
                Write-Host "Error during npm installation:" -ForegroundColor Red
                Write-Host $npmError.Exception.Message -ForegroundColor Red
                Write-Host "StackTrace:" -ForegroundColor Red
                Write-Host $npmError.ScriptStackTrace -ForegroundColor Red

                Write-Host "Environment variables:" -ForegroundColor Yellow
                Get-ChildItem Env: | ForEach-Object { Write-Host "$($_.Name): $($_.Value)" -ForegroundColor Yellow }

                Write-Host "Content of $dirLib:" -ForegroundColor Yellow
                Get-ChildItem $dirLib -Recurse | ForEach-Object { Write-Host $_.FullName -ForegroundColor Yellow }

                throw "Couldn't install npm@${NPM_VERSION}. See error details above."
            }
        }

        Write-Host "npm installation completed successfully." -ForegroundColor Green

        Move-Item $(Join-Path $dirTempNode '*.exe') $dirBin
        Move-Item $dirTempNodeHeadersInclude $DIR
        Move-Item $dirNodeRelease $DIR

        $finalNodeExe = Join-Path $dirBin 'node.exe'
        $finalNpmCmd = Join-Path $dirBin 'npm.cmd'

        & "$finalNodeExe" "${dirCheckout}\scripts\windows\link-npm-bin-commands.js"

        Copy-Item "${dirCheckout}\scripts\npm.cmd" $finalNpmCmd

        Remove-DirectoryRecursively $dirTempNodeHeaders
        Remove-DirectoryRecursively $dirTempNode

        return New-Object -Type PSObject -Prop $(@{
            node = $finalNodeExe
            npm = $finalNpmCmd
        })
    }

    # Install the global 7zip application, if necessary.
    if (!(Test-Path "$system7zip")) {
        Write-Host "Installing 7-zip since not found at ${system7zip}" -ForegroundColor Magenta
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

    # ... rest of your script ...

    Write-Host "Script completed successfully" -ForegroundColor Green
} catch {
    Write-Host "An error occurred:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host "Stack Trace:" -ForegroundColor Red
    Write-Host $_.ScriptStackTrace -ForegroundColor Red
    exit 1
}
