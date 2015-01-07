@echo off

IF NOT EXIST "%~dp0\dev_bundle" (
  PowerShell.exe -version 2.0 -file "%~dp0\scripts\windows\download-dev-bundle.ps1"
)

SET NODE_PATH=%~dp0\dev_bundle\lib\node_modules

"%~dp0\dev_bundle\bin\node.exe" "%~dp0\tools\main.js" %*

