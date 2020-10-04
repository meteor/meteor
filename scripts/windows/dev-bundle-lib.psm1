# This is the "/scripts" directory, useful for accessing other scripts.
$scriptsDir = (Get-Item $PSScriptRoot).parent.FullName

# This is the root of the Meteor repository.
$rootDir = (Get-Item $scriptsDir).parent.FullName

# This is the "meteor" shell script.
$meteorSh = Join-Path $rootDir 'meteor'

<#
  .Synopsis
  Get the architecture for the Meteor Dev Bundle

  .Description
  Determine the architecture (64-bit/32-bit) from the environment,
  taking into consideration the PLATFORM override environment variable,
  which is used by Jenkins when building the dev bundle for Windows.

  Otherwise, use logic similar to that of Chocolatey's
  Get-OSArchitectureWidth method, as seen here: https://git.io/vd2e9
#>
Function Get-MeteorPlatform {
  if (Test-Path env:PLATFORM) {
    $PLATFORM = (Get-Item env:PLATFORM).Value
  } elseif (([System.IntPtr]::Size -eq 4) -and (Test-Path env:\PROCESSOR_ARCHITEW6432)) {
    $PLATFORM = "windows_x64"
  } elseif ([System.IntPtr]::Size -eq 4) {
    $PLATFORM = "windows_x86"
  } else {
    $PLATFORM = "windows_x64"
  }
  $PLATFORM
}

<#
  .Synopsis
  Get a shell script variable out of a regular Bash script.
#>
Function Read-VariableFromShellScript {
  Param (
    [Parameter(Mandatory=$True, Position=0)]
    [string]$Path,
    [Parameter(Mandatory=$True, Position=1)]
    [string]$Name
  )
  $v = Select-String -Path $Path -Pattern "^\s*${Name}=(\S+)" |
    % { $_.Matches[0].Groups[1].Value } |
    Select-Object -First 1
  $v = $v.Trim()
  $v
}

<#
  .Synopsis
  Create and return a unique temporary directory.
#>
Function New-TemporaryDirectory {
  $parent = [System.IO.Path]::GetTempPath()
  [string] $name = [System.Guid]::NewGuid()
  New-Item -ItemType Directory -Path (Join-Path $parent $name)
}

<#
  .Synopsis
  Recursively remove a directory using force, and avoiding
  filesystem tools.

  .Description
  Some of the more complex file structures created by npm node_modules'
  directories pose a problem for native Windows filesystem tools.  This
  command takes a different approach by using Windows' "Robocopy" tool to
  clone the directory with an empty directory, and purge files which are
  not present in the empty directory.
#>
Function Remove-DirectoryRecursively {
  Param (
    [Parameter(Mandatory=$True, Position=0)]
    [string]$Path
  )
  if (Test-Path -LiteralPath $Path -PathType 'Container') {
    $emptyTempDir = New-TemporaryDirectory
    & robocopy.exe $emptyTempDir $Path /purge | Out-Null
    Remove-Item $Path -Recurse -Force
    Remove-Item $emptyTempDir -Force
  }
}

<#
  .Synopsis
  Extract a .tar.gz file to a directory using 7z.

  .Description
  7z doesn't have the capability to deal with both tar and gz in a single
  operation so this function chains them together in a piped operation.
#>
Function Expand-TarGzToDirectory {
  Param (
    [Parameter(Mandatory=$True, Position=0)]
    [string]$Path,
    [Parameter(Mandatory=$True, Position=1)]
    [string]$Destination,
    [string]$Binary = "7z.exe"
  )
  & cmd /C "$Binary x $Path -so | $Binary x -aoa -si -ttar -o$Destination"
  if ($LASTEXITCODE -eq 0) {
    return $True
  }
  $False
}

<#
  .Synopsis
  Extract a .7z archive to a directory using 7z.

  .Description
  Purely a shorthand function to simplify 7z extraction.
#>
Function Expand-7zToDirectory {
  Param (
    [Parameter(Mandatory=$True, Position=0)]
    [string]$Path,
    [Parameter(Mandatory=$True, Position=1)]
    [string]$Destination,
    [string]$Binary = "7z.exe"
  )
  & "$Binary" x "$Path" -o"$Destination" | Out-Null
}

Export-ModuleMember -Function `
  Expand-7zToDirectory,
  Expand-TarGzToDirectory,
  Get-MeteorPlatform,
  Read-VariableFromShellScript,
  Remove-DirectoryRecursively
