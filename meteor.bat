@echo off

rem only if we are running from a checkout
IF EXIST "%~dp0\.git" (
  rem if dev_bundle is not present, get it
  IF NOT EXIST "%~dp0\dev_bundle" (
    PowerShell.exe -executionpolicy ByPass -file "%~dp0\scripts\windows\download-dev-bundle.ps1"
  )

  rem if dev_bundle is the wrong version, remove it and get a new one
  PowerShell.exe -executionpolicy ByPass -file "%~dp0\scripts\windows\check-dev-bundle.ps1"
  IF errorlevel 1 (
    rmdir /s /q "%~dp0\dev_bundle"
    PowerShell.exe -executionpolicy ByPass -file "%~dp0\scripts\windows\download-dev-bundle.ps1"
  )
)

SET NODE_PATH=%~dp0\dev_bundle\lib\node_modules

"%~dp0\dev_bundle\bin\node.exe" "%~dp0\tools\main.js" %*

