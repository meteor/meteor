@echo off

SETLOCAL
rem only if we are running from a checkout
IF EXIST "%~dp0\.git" (
  rem verify that we have 7zip in the path
  7z.exe --help > nul
  IF errorlevel 1 (
    REM For some reason, without quotes this line causes an error
    echo "Please install 7z.exe (7-Zip) and put it into your PATH"
    exit /b 1
  )

  rem if dev_bundle is not present, get it
  IF NOT EXIST "%~dp0\dev_bundle" (
    REM need `< con` so that we can run this file from Node
    REM (See http://stackoverflow.com/questions/9155289/calling-powershell-from-nodejs)
    PowerShell.exe -executionpolicy ByPass -file "%~dp0\scripts\windows\download-dev-bundle.ps1" < con
    IF errorlevel 1 (
      echo An error occurred while obtaining the dev_bundle.  Please try again.
      exit /b 1
    )
  )

  rem if dev_bundle is the wrong version, remove it and get a new one
  PowerShell.exe -executionpolicy ByPass -file "%~dp0\scripts\windows\check-dev-bundle.ps1" < con

  IF errorlevel 1 (
    rmdir /s /q "%~dp0\dev_bundle"
    IF EXIST "%~dp0\dev_bundle" (
      echo Couldn't delete old dependency kit. Please try again.
      exit /b 1
    )
    PowerShell.exe -executionpolicy ByPass -file "%~dp0\scripts\windows\download-dev-bundle.ps1" < con
    IF errorlevel 1 (
      echo An error occurred while obtaining the dev_bundle.  Please try again.
      exit /b 1
    )
  )

  rem Only set this when we're in a checkout. When running from a release,
  rem this is correctly set in the top-level `meteor.bat` file
  SET METEOR_INSTALLATION=%~dp0
)

SET NODE_PATH=%~dp0\dev_bundle\lib\node_modules
SET BABEL_CACHE_DIR=%~dp0\.babel-cache

"%~dp0\dev_bundle\bin\node.exe" ^
  --no-wasm-code-gc ^
  --require="%~dp0\tools\node-process-warnings.js" ^
  %TOOL_NODE_FLAGS% ^
  "%~dp0\tools\index.js" %*

ENDLOCAL

EXIT /b %ERRORLEVEL%

