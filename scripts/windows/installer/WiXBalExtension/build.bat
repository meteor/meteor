@echo off

rem Configuring environment
set MSBUILD="%SystemRoot%\Microsoft.NET\Framework\v4.0.30319\msbuild.exe"

set outdir=%~dp0build

rem Removing release folder
Call :DeleteDir "%outdir%"
Call :DeleteDir "ipch"

%MSBUILD% inc\Version.proj /nologo /verbosity:quiet
%MSBUILD% BalExtensionExt.sln /nologo /verbosity:quiet /t:Rebuild /p:Configuration=Release /p:Platform="Mixed Platforms" /p:RunCodeAnalysis=false /p:DefineConstants="TRACE" /p:OutDir="%outdir%\\" /l:FileLogger,Microsoft.Build.Engine;logfile=build.log
if %errorlevel% neq 0 (
	echo Build failed
	rem pause
	goto :EOF
)


set outdir=

goto :EOF

REM *****************************************************************
REM End of Main
REM *****************************************************************


REM *****************************************************************
REM Delete/create directory
REM *****************************************************************
:DeleteDir
rd %1% /q/s 2>nul 1>nul
goto :EOF
