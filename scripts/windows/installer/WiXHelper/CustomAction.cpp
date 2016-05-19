#include "stdafx.h"


#include <string>

#include <wcautil.h>
#include <strutil.h>

#include <pathutil.h>
#include <fileutil.h>
#include <dirutil.h>

#include <urlmon.h>
#include <wininet.h>
#include <sys/stat.h>

#define BUF_LEN 1024
#define MAX_LONG_PATH 2048
#define LOG true


    





HRESULT ExtractBinary(
	__in LPCWSTR wzBinaryId,
	__out BYTE** pbData,
	__out DWORD* pcbData
	)
{
	HRESULT hr = S_OK;
	LPWSTR pwzSql = NULL;
	PMSIHANDLE hView;
	PMSIHANDLE hRec;

	// make sure we're not horked from the get-go
	hr = WcaTableExists(L"Binary");
	if (S_OK != hr)
	{
		if (SUCCEEDED(hr))
		{
			hr = E_UNEXPECTED;
		}
		ExitOnFailure(hr, "There is no Binary table.");
	}

	ExitOnNull(wzBinaryId, hr, E_INVALIDARG, "Binary ID cannot be null");
	ExitOnNull(*wzBinaryId, hr, E_INVALIDARG, "Binary ID cannot be empty string");

	hr = StrAllocFormatted(&pwzSql, L"SELECT `Data` FROM `Binary` WHERE `Name`=\'%s\'", wzBinaryId);
	ExitOnFailure(hr, "Failed to allocate Binary table query.");

	hr = WcaOpenExecuteView(pwzSql, &hView);
	ExitOnFailure(hr, "Failed to open view on Binary table");

	hr = WcaFetchSingleRecord(hView, &hRec);
	ExitOnFailure(hr, "Failed to retrieve request from Binary table");

	hr = WcaGetRecordStream(hRec, 1, pbData, pcbData);
	ExitOnFailure(hr, "Failed to read Binary.Data.");

LExit:
	ReleaseStr(pwzSql);
	return hr;
}


HRESULT ExtractBinaryToFile(
	__in LPCWSTR wzBinaryId,
	__in LPCWSTR wzFilePath
	)
{
	HRESULT hr = S_OK;
	BYTE* pbData = NULL;
	DWORD cbData = 0;
	DWORD cbWritten = 0;

	HANDLE hFile = INVALID_HANDLE_VALUE;

	wchar_t szTmpFile[BUF_LEN] = L"";	DWORD nTmpFileLen = BUF_LEN;
	hr = ExtractBinary(wzBinaryId, &pbData, &cbData);

	hFile = CreateFile(wzFilePath, GENERIC_WRITE,FILE_SHARE_WRITE, NULL, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
	if (hFile != INVALID_HANDLE_VALUE) {
		WriteFile(hFile, pbData, cbData, &cbWritten, NULL);
		CloseHandle(hFile);
	}
	else
	{
		hr = HRESULT_FROM_WIN32(::GetLastError());
	}

	return hr;
}




BOOL ExecuteCommandLine(LPWSTR CommandLine, DWORD & exitCode)
{
	PROCESS_INFORMATION processInformation = {0};
	STARTUPINFO startupInfo                = {0};
	startupInfo.cb                         = sizeof(startupInfo);

	// Create the process
	BOOL result = CreateProcess(NULL, CommandLine, 
		NULL, NULL, FALSE, 
		NORMAL_PRIORITY_CLASS | CREATE_NO_WINDOW, 
		NULL, NULL, &startupInfo, &processInformation);

	if (!result)
	{
		// CreateProcess() failed;   Get the error from the system
		LPVOID lpMsgBuf;
		DWORD dw = GetLastError();
		FormatMessage(FORMAT_MESSAGE_ALLOCATE_BUFFER | FORMAT_MESSAGE_FROM_SYSTEM | FORMAT_MESSAGE_IGNORE_INSERTS, 
			NULL, dw, MAKELANGID(LANG_NEUTRAL, SUBLANG_DEFAULT), (LPTSTR) &lpMsgBuf, 0, NULL);

		// Display the error
		LPTSTR strError = (LPTSTR) lpMsgBuf;

		// Free resources created by the system
		LocalFree(lpMsgBuf);

		// We failed.
		return FALSE;
	}
	else
	{
		// Successfully created the process.  Wait for it to finish.
		WaitForSingleObject( processInformation.hProcess, INFINITE );

		// Get the exit code.
		result = GetExitCodeProcess(processInformation.hProcess, &exitCode);

		// Close the handles.
		CloseHandle( processInformation.hProcess );
		CloseHandle( processInformation.hThread );

		if (!result) {
			return FALSE;
		} else {
			// We succeeded.
			return TRUE;
		}
	}
}


HRESULT UnzipToFolder(
	MSIHANDLE hInstall,
	__in LPCWSTR wzFriendlyName,
	__in LPCWSTR wzTarGzFileName,
	__in LPCWSTR wzDestPath
	)
{
	HRESULT hr = S_OK;

	WcaLog(LOGMSG_STANDARD, "Extract \"%S\" package initialized.", wzFriendlyName);

	wchar_t szSourceDir[BUF_LEN] = L"";	DWORD nSourceDirDirLen = BUF_LEN;
	wchar_t szTarGzFilePath[BUF_LEN] = L"";
	wchar_t szTarFilePath[BUF_LEN] = L"";
	MsiGetProperty(hInstall, L"SourceDir", szSourceDir, &nSourceDirDirLen);
	StringCchPrintf(szTarGzFilePath, BUF_LEN, L"%s%s", szSourceDir, wzTarGzFileName);
	StringCchPrintf(szTarFilePath, BUF_LEN, L"%s*.tar", szSourceDir);

	DWORD pdwAttr;
	if (FileExistsEx(szTarGzFilePath, &pdwAttr) == TRUE)
	{
		//Extacting quality_cloud_production.sql to %TEMP% folder
		wchar_t szTmpDir[BUF_LEN] = L"";		DWORD nTmpDirLen = BUF_LEN;
		wchar_t sz7Zip[BUF_LEN] = L"";

		wchar_t szCommandLine1[BUF_LEN] = L"";
		wchar_t szCommandLine2[BUF_LEN] = L"";

		MsiGetProperty(hInstall, L"TempFolder", szTmpDir, &nTmpDirLen);
		StringCchPrintf(sz7Zip, BUF_LEN, L"%s%s", szTmpDir, L"7za.exe");

		DWORD pdwAttr;
		if (FileExistsEx(sz7Zip, &pdwAttr) == FALSE)
		{
			hr = ExtractBinaryToFile(L"SevenZip", sz7Zip);
		}

		DWORD nRes=0;

		// Remove old Meteor installs
		wchar_t szCmdRemoveOld[BUF_LEN] = L"";
		wchar_t szSysDir[BUF_LEN] = L"";
		DWORD nSysDirLen = BUF_LEN;
		MsiGetProperty(hInstall, L"SystemFolder", szSysDir, &nSysDirLen);

		LPTSTR ErrorMessage = NULL;

		StringCchPrintf(szCmdRemoveOld, BUF_LEN, L"%s\\cmd.exe /C \"RD /S /Q \"%s\\.meteor\">NUL\"", szSysDir, wzDestPath);
		StringCchPrintf(szCommandLine1, BUF_LEN, L"\"%s\" x -o\"%s\" -y \"%s\"", sz7Zip, szSourceDir, szTarGzFilePath);
		StringCchPrintf(szCommandLine2, BUF_LEN, L"\"%s\" x -o\"%s\" -y \"%s\"", sz7Zip, wzDestPath, szTarFilePath);

		if (! ExecuteCommandLine(szCmdRemoveOld, nRes)) {
			FormatMessage(FORMAT_MESSAGE_ALLOCATE_BUFFER | FORMAT_MESSAGE_FROM_SYSTEM, NULL, HRESULT_FROM_WIN32(nRes), MAKELANGID(LANG_NEUTRAL, SUBLANG_DEFAULT), (LPTSTR)&ErrorMessage, 0, NULL);
			if (NULL != ErrorMessage) WcaLog(LOGMSG_STANDARD, "Deleting old install completed with (%d): %S", nRes, ErrorMessage);
			return HRESULT_FROM_WIN32(nRes);
		}

		if (! ExecuteCommandLine(szCommandLine1, nRes)) {
			FormatMessage(FORMAT_MESSAGE_ALLOCATE_BUFFER | FORMAT_MESSAGE_FROM_SYSTEM, NULL, HRESULT_FROM_WIN32(nRes), MAKELANGID(LANG_NEUTRAL, SUBLANG_DEFAULT), (LPTSTR)&ErrorMessage, 0, NULL);
			if (NULL != ErrorMessage) WcaLog(LOGMSG_STANDARD, "Archive expanding completed with (%d): %S", nRes, ErrorMessage);
			return HRESULT_FROM_WIN32(nRes);
		}

		if (! ExecuteCommandLine(szCommandLine2, nRes)) {
			FormatMessage(FORMAT_MESSAGE_ALLOCATE_BUFFER | FORMAT_MESSAGE_FROM_SYSTEM, NULL, HRESULT_FROM_WIN32(nRes), MAKELANGID(LANG_NEUTRAL, SUBLANG_DEFAULT), (LPTSTR)&ErrorMessage, 0, NULL);
			if (NULL != ErrorMessage) WcaLog(LOGMSG_STANDARD, "Archive deployment completed with (%d): %S", nRes, ErrorMessage);
			return HRESULT_FROM_WIN32(nRes);
		}
	}
	else
	{
		hr = HRESULT_FROM_WIN32(ERROR_FILE_NOT_FOUND);
		WcaLog(LOGMSG_STANDARD, "Failed to extract %S files. File not found: %S", wzFriendlyName, szTarGzFilePath); 
	}

	WcaLog(LOGMSG_STANDARD, "Extracting \"%S\" package completed.", wzFriendlyName);

	return hr;
}


UINT __stdcall Extract_MeteorFiles(MSIHANDLE hInstall)
{
	// If cancelled, don't try to extract anything.
	wchar_t szValueBuf[64];
	DWORD szValueBufSize = 64;
	MsiGetProperty(hInstall, L"Cancelled", szValueBuf, &szValueBufSize);
	if (szValueBuf[0] == L'Y')
		return 0;

	// Go ahead.
	HRESULT hr = S_OK;
	UINT er = ERROR_SUCCESS;

	hr = WcaInitialize(hInstall, "Extract_MeteorFiles");
	ExitOnFailure(hr, "Failed to initialize Extract_MeteorFiles");

	wchar_t szMeteorDir[BUF_LEN] = L"";	DWORD nMeteorDirLen = BUF_LEN;
	MsiGetProperty(hInstall, L"METEOR_DIR", szMeteorDir, &nMeteorDirLen);

	hr = UnzipToFolder(hInstall, L"Meteor", L"meteor-bootstrap-os.windows.x86_32.tar.gz", szMeteorDir);
	ExitOnFailure(hr, "Failed to extract Meteor files.");

LExit:
	er = SUCCEEDED(hr) ? ERROR_SUCCESS : ERROR_INSTALL_FAILURE;
	return WcaFinalize(er);
}



HRESULT Download_Package(
	MSIHANDLE hInstall,
	__in LPCWSTR wzFriendlyName,
	__in LPCWSTR szDwnUrl,
	__in LPCWSTR wzZipFile)
{
	HRESULT hr = S_OK;

	WcaLog(LOGMSG_STANDARD, "Download package \"%S\" initialized.", wzFriendlyName);

	wchar_t szSourceDir[BUF_LEN] = L"";	DWORD nSourceDirDirLen = BUF_LEN;
	wchar_t szZipFile[BUF_LEN] = L"";

	MsiGetProperty(hInstall, L"SourceDir", szSourceDir, &nSourceDirDirLen);

	StringCchPrintf(szZipFile, BUF_LEN, L"%s%s", szSourceDir, wzZipFile);

	HINTERNET internet = InternetOpen(
		L"MeteorWindowsInstaller/1.0",
		INTERNET_OPEN_TYPE_PRECONFIG,
		NULL,
		NULL,
		0);

	if (internet == NULL) {
		return HRESULT_FROM_WIN32(::GetLastError());
	}

	HINTERNET request = InternetOpenUrl(
		internet,
		szDwnUrl,
		NULL,
		0,
		INTERNET_FLAG_SECURE,
		NULL);

	if (request == NULL) {
		return HRESULT_FROM_WIN32(::GetLastError());
	}

    DWORD dwContentLen;
    DWORD dwBufLen = sizeof(dwContentLen);

	BOOL result = HttpQueryInfo(
		request,
		HTTP_QUERY_CONTENT_LENGTH | HTTP_QUERY_FLAG_NUMBER,
    	(LPVOID)&dwContentLen,
	    &dwBufLen,
	    0);

	if (!request) {
		return HRESULT_FROM_WIN32(::GetLastError());
	}

    const int capacity = 1024*64;
    char* buffer = new char[capacity];
  	DWORD bytes_downloaded = 0;

    FILE* output = _wfopen(szZipFile, L"wb");
    for (;;) {
    	DWORD bytes_read;

    	BOOL result = InternetReadFile(
    		request,
    		buffer,
    		capacity,
    		&bytes_read);

		if (!result) {
			return HRESULT_FROM_WIN32(::GetLastError());
		}

	    if (bytes_read == 0) {
	    	break;
	    }

	    bytes_downloaded += bytes_read;

    	fwrite(buffer, 1, bytes_read, output);

    	// update progress bar
   		PMSIHANDLE hActionRec = MsiCreateRecord(3);
        PMSIHANDLE hProgressRec = MsiCreateRecord(3);

		DWORD ulPrc = 0;
		WCHAR wzInfo[1024] = { };

		ulPrc  = static_cast<DWORD>(100 * static_cast<double>(bytes_downloaded) / static_cast<double>(dwContentLen));
		::StringCchPrintfW(wzInfo, countof(wzInfo), L"Downloading Meteor...  %u%%", ulPrc);
 
        MsiRecordSetString(hActionRec, 1, TEXT("Download_MeteorPackage"));
        MsiRecordSetString(hActionRec, 2, wzInfo);
        MsiRecordSetString(hActionRec, 3, NULL);

        UINT iResult = MsiProcessMessage(hInstall, INSTALLMESSAGE_ACTIONSTART, hActionRec);

        // XXX I *thought* this should return IDCANCEL, and have verified that
        // that's what
        // WixStandardBootstrapperApplication.cpp::OnExecuteMsiMessage
        // returns. But for some reason `iResult` ends up being 1.
        if (iResult == 1) {
        	fclose(output);
        	MsiSetProperty(hInstall, L"Cancelled", L"Y"); // read from Extract_MeteorFiles
            return ERROR_INSTALL_USEREXIT;
        }
	}

    fclose(output);

	WcaLog(LOGMSG_STANDARD, "Download package \"%S\" completed.", wzFriendlyName);

	return hr;
}


// assumes content is at most 1024 characters
UINT FetchHTTPSToShortString(wchar_t *url, char *result) {
	HINTERNET internet = InternetOpen(
		L"MeteorWindowsInstaller/1.0",
		INTERNET_OPEN_TYPE_PRECONFIG,
		NULL,
		NULL,
		0);

	if (internet == NULL) {
		return ::GetLastError();
	}

	HINTERNET request = InternetOpenUrl(
		internet,
		url,
		NULL,
		0,
		INTERNET_FLAG_SECURE,
		NULL);

	if (request == NULL) {
		return ::GetLastError();
	}

	DWORD bytes_read;
	BOOL readResult = InternetReadFile(
		request,
		result,
		1023,
		&bytes_read);
	if (!readResult) {
		return ::GetLastError();
	}
	result[bytes_read] = 0;

	return 0;
}


UINT __stdcall Download_MeteorPackage(MSIHANDLE hInstall)
{
	HRESULT hr = S_OK;
	UINT er = ERROR_SUCCESS;
	UINT httpEr;

	hr = WcaInitialize(hInstall, "Download_MeteorPackage");
	ExitOnFailure(hr, "Failed to initialize Download_MeteorPackage");

	char bootstrapLink[1024];

	httpEr = FetchHTTPSToShortString(L"https://packages.meteor.com/bootstrap-link", bootstrapLink);
	if (httpEr) {
		hr = HRESULT_FROM_WIN32(httpEr);
		MessageBoxA(NULL, "Failed to contact install server. Please try again later.", NULL, NULL);
		ExitOnFailure(hr, "Couldn't get bootstap-link"); 
	}

	// strip trailing newline; if it's not there it's probably because we're
	// getting some bad response from packages.meteor.com.
	char *bootstrapLinkNewline = strchr(bootstrapLink, '\n');
	if (!bootstrapLinkNewline) {
		MessageBoxA(NULL, "Malformed response from install server. Please try again later.", NULL, NULL);
		ExitOnFailure(E_FAIL, "Couldn't parse bootstrap-link"); 		
	}

	*bootstrapLinkNewline = '\0';

	char downloadUrl[1024];
	sprintf(downloadUrl, "%s/meteor-bootstrap-os.windows.x86_32.tar.gz", bootstrapLink);

	wchar_t wDownloadUrl[1024];
	mbstowcs(wDownloadUrl, downloadUrl, 1024);

	hr = Download_Package(hInstall, L"Meteor", wDownloadUrl, L"meteor-bootstrap-os.windows.x86_32.tar.gz");
	if (FAILED(hr)) {
		MessageBoxA(NULL, "Failed to download Meteor installation package. Please try again later.", NULL, NULL);
	}	
	ExitOnFailure(hr, "Failed to download Meteor package from specified URL."); 

LExit:
	er = SUCCEEDED(hr) ? ERROR_SUCCESS : ERROR_INSTALL_FAILURE;
	return WcaFinalize(er);
}




UINT __stdcall BulkRemoveMeteorFiles(MSIHANDLE hInstall)
{
	HRESULT hr = S_OK;
	UINT er = ERROR_SUCCESS;

	hr = WcaInitialize(hInstall, "BulkRemoveMeteorFiles");
	ExitOnFailure(hr, "Failed to initialize BulkRemoveMeteorFiles");

	WcaLog(LOGMSG_STANDARD, "BulkRemoveMeteorFiles Initialized.");

	wchar_t szPathPackages[BUF_LEN] = L"";	DWORD nPathPackages = BUF_LEN;
	wchar_t szPathPkg_Meta[BUF_LEN]  = L"";	DWORD nPathPkg_Meta  = BUF_LEN;

	MsiGetProperty(hInstall, L"METEORDIR_PACKAGES", szPathPackages, &nPathPackages);
	MsiGetProperty(hInstall, L"METEORDIR_PKG_META", szPathPkg_Meta, &nPathPkg_Meta);
	
	wchar_t szSysDir[BUF_LEN] = L"";	DWORD nSysDirLen = BUF_LEN;
	wchar_t szCmd1[BUF_LEN] = L"";		
	wchar_t szCmd2[BUF_LEN] = L"";	

	DWORD nRes=0;
	
	
	MsiGetProperty(hInstall, L"SystemFolder", szSysDir, &nSysDirLen);
	StringCchPrintf(szCmd1, BUF_LEN, L"%s\\cmd.exe /C \"RD /S /Q \"%s\">NUL\"", szSysDir, szPathPackages);
	StringCchPrintf(szCmd2, BUF_LEN, L"%s\\cmd.exe /C \"RD /S /Q \"%s\">NUL\"", szSysDir, szPathPkg_Meta);

	ExecuteCommandLine(szCmd1, nRes);
	ExecuteCommandLine(szCmd2, nRes);

	WcaLog(LOGMSG_STANDARD, "BulkRemoveMeteorFiles done.");

LExit:
	er = SUCCEEDED(hr) ? ERROR_SUCCESS : ERROR_INSTALL_FAILURE;
	return WcaFinalize(er);
}




// DllMain - Initialize and cleanup WiX custom action utils.
extern "C" BOOL WINAPI DllMain(
	__in HINSTANCE hInst,
	__in ULONG ulReason,
	__in LPVOID
	)
{
	switch(ulReason)
	{
	case DLL_PROCESS_ATTACH:
		WcaGlobalInitialize(hInst);
		break;

	case DLL_PROCESS_DETACH:
		WcaGlobalFinalize();
		break;
	}

	return TRUE;
}
