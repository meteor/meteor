@echo off

set MSBUILD="%SystemRoot%\Microsoft.NET\Framework\v4.0.30319\msbuild.exe"


IF "%1"=="" GOTO :BUILD
IF "%1"=="clean" GOTO :CLEAN

:BUILD

if not exist Release md Release

echo Building WiXBalExtension...
pushd WiXBalExtension
Call Build
popd

rem GOTO :Installer

echo Building custom action collection 32-bit library (WiXHelper project)
%MSBUILD% WiXHelper\WiXHelper.vcxproj /t:Rebuild /p:Configuration="Release" /p:Platform=Win32 /p:DefineConstants="TRACE" /clp:ErrorsOnly
if %errorlevel% neq 0 (
	echo Build failed.
	rem pause
	goto :EOF
)


rem We don't have a 64 bit msi package, so I will command this
rem echo Building custom action collection 64-bit library (WiXHelper project)
rem %MSBUILD% WiXHelper\WiXHelper.vcxproj /t:Rebuild /p:Configuration="Release" /p:Platform=x64 /p:DefineConstants="TRACE" /clp:ErrorsOnly
rem if %errorlevel% neq 0 (
rem 	echo Build failed.
rem 	pause
rem 	goto :EOF
rem )


:Installer

echo Building Meteor installer package...
%MSBUILD% MeteorSetup.sln /t:Rebuild /p:Configuration="Release" /p:Platform="x86" /p:DefineConstants="TRACE" /clp:ErrorsOnly
if %errorlevel% neq 0 (
	echo Build failed
	rem pause
	goto :EOF
)


goto :EOF

REM *****************************************************************
REM End of Main
REM *****************************************************************


:CLEAN
IF EXIST WiXHelper\*.sdf DEL /Q WiXHelper\*.sdf
IF EXIST WiXHelper\*.suo DEL /Q /A:H WiXHelper\*.suo
IF EXIST WiXBalExtension\*.sdf DEL /Q WiXBalExtension\*.sdf
IF EXIST WiXBalExtension\*.suo DEL /Q /A:H WiXBalExtension\*.suo

Call :DeleteDir "ipch"
Call :DeleteDir "WiXHelper\ipch"
Call :DeleteDir "WiXHelper\bin"
Call :DeleteDir "WiXHelper\obj"
Call :DeleteDir "WiXInstaller\bin"
Call :DeleteDir "WiXInstaller\obj"
Call :DeleteDir "WiXBalExtension\ipch"
Call :DeleteDir "WiXBalExtension\wixstdba\Release"
Call :DeleteDir "WiXBalExtension\wixstdba\Debug"
Call :DeleteDir "WiXBalExtension\wixlib\obj"
Call :DeleteDir "WiXBalExtension\wixext\obj"
Call :DeleteDir "WiXBalExtension\wixext\bin"
Call :DeleteDir "WiXBalExtension\bafunctions\Release"
Call :DeleteDir "WiXBalExtension\bafunctions\Debug"
Call :DeleteDir "WiXBalExtension\build\Xsd"

for /f "usebackq delims=" %%I in (`dir /s /b WiXBalExtension\build\*`) do if not %%~nxI==WixBalExtensionExt.dll del /Q "%%I"
goto :EOF



REM *****************************************************************
REM Delete/create directory
REM *****************************************************************
:DeleteDir
rd %1% /q/s 2>nul 1>nul
goto :EOF



