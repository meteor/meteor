@echo off
SET NODE_PATH=%~dp0\dev_bundle\lib\node_modules

"%~dp0\dev_bundle\bin\node.exe" "%~dp0\tools\main.js" %*

