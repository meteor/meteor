@echo off

pushd "%~dp0"

echo Compiling InstallMeteor
%WINDIR%\Microsoft.NET\Framework\v3.5\csc.exe InstallMeteor.cs /debug /nologo

popd