#include "stdafx.h"


#include <string>

#include <wcautil.h>
#include <strutil.h>

#include <pathutil.h>
#include <fileutil.h>
#include <dirutil.h>


#include <winhttp.h>
#include <dlutil.h>


#define BUF_LEN 1024
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

		if (!result)
			return FALSE;

		// We succeeded.
		return TRUE;
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

		StringCchPrintf(szCommandLine1, BUF_LEN, L"\"%s\" x -o\"%s\" -y \"%s\"", sz7Zip, szSourceDir, szTarGzFilePath);
		StringCchPrintf(szCommandLine2, BUF_LEN, L"\"%s\" x -o\"%s\" -y \"%s\"", sz7Zip, wzDestPath, szTarFilePath);
		DWORD nRes=0;
		LPTSTR ErrorMessage = NULL;

		ExecuteCommandLine(szCommandLine1, nRes);
		FormatMessage(FORMAT_MESSAGE_ALLOCATE_BUFFER | FORMAT_MESSAGE_FROM_SYSTEM, NULL, HRESULT_FROM_WIN32(nRes), MAKELANGID(LANG_NEUTRAL, SUBLANG_DEFAULT), (LPTSTR)&ErrorMessage, 0, NULL);
		if (NULL != ErrorMessage) WcaLog(LOGMSG_STANDARD, "Archive expanding completed with (%d): %S", nRes, ErrorMessage);

		ExecuteCommandLine(szCommandLine2, nRes);
		FormatMessage(FORMAT_MESSAGE_ALLOCATE_BUFFER | FORMAT_MESSAGE_FROM_SYSTEM, NULL, HRESULT_FROM_WIN32(nRes), MAKELANGID(LANG_NEUTRAL, SUBLANG_DEFAULT), (LPTSTR)&ErrorMessage, 0, NULL);
		if (NULL != ErrorMessage) WcaLog(LOGMSG_STANDARD, "Archive deployment completed with (%d): %S", nRes, ErrorMessage);
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


static DWORD CALLBACK CacheProgressRoutine(
	__in LARGE_INTEGER TotalFileSize,
	__in LARGE_INTEGER TotalBytesTransferred,
	__in LARGE_INTEGER /*StreamSize*/,
	__in LARGE_INTEGER /*StreamBytesTransferred*/,
	__in DWORD /*dwStreamNumber*/,
	__in DWORD /*dwCallbackReason*/,
	__in HANDLE /*hSourceFile*/,
	__in HANDLE /*hDestinationFile*/,
	__in_opt LPVOID lpData
	)
{
	DWORD dwResult = PROGRESS_CONTINUE;
	//BURN_CACHE_ACQUIRE_PROGRESS_CONTEXT* pProgress = static_cast<BURN_CACHE_ACQUIRE_PROGRESS_CONTEXT*>(lpData);
	//LPCWSTR wzPackageOrContainerId = pProgress->pContainer ? pProgress->pContainer->sczId : pProgress->pPackage ? pProgress->pPackage->sczId : NULL;
	//LPCWSTR wzPayloadId = pProgress->pPayload ? pProgress->pPayload->sczKey : NULL;
	//DWORD64 qwCacheProgress = pProgress->qwCacheProgress + TotalBytesTransferred.QuadPart;
	//if (qwCacheProgress > pProgress->qwTotalCacheSize)
	//{
	//	qwCacheProgress = pProgress->qwTotalCacheSize;
	//}
	//DWORD dwOverallPercentage = pProgress->qwTotalCacheSize ? static_cast<DWORD>(qwCacheProgress * 100 / pProgress->qwTotalCacheSize) : 0;

	//int nResult = pProgress->pUX->pUserExperience->OnCacheAcquireProgress(wzPackageOrContainerId, wzPayloadId, TotalBytesTransferred.QuadPart, TotalFileSize.QuadPart, dwOverallPercentage);
	//nResult = UserExperienceCheckExecuteResult(pProgress->pUX, FALSE, MB_OKCANCEL, nResult);


	
	int nResult = PROGRESS_CONTINUE;
	switch (nResult)
	{
	case IDOK: __fallthrough;
	case IDYES: __fallthrough;
	case IDRETRY: __fallthrough;
	case IDIGNORE: __fallthrough;
	case IDTRYAGAIN: __fallthrough;
	case IDCONTINUE:
		dwResult = PROGRESS_CONTINUE;
		break;

	case IDCANCEL: __fallthrough;
	case IDABORT: __fallthrough;
	case IDNO:
		dwResult = PROGRESS_CANCEL;
		//pProgress->fCancel = TRUE;
		break;

	default:
		dwResult = PROGRESS_CANCEL;
		//pProgress->fError = TRUE;
		break;
	}

	return dwResult;
}



HRESULT Download_Package(
	MSIHANDLE hInstall,
	__in LPCWSTR wzFriendlyName,
	__in LPCWSTR wzProperty_DWNURL,
	__in LPCWSTR wzZipFile,
	__in_opt DOWNLOAD_CACHE_CALLBACK* pCache)
{
	HRESULT hr = S_OK;

	WcaLog(LOGMSG_STANDARD, "Download package \"%S\" initialized.", wzFriendlyName);

	wchar_t szSourceDir[BUF_LEN] = L"";	DWORD nSourceDirDirLen = BUF_LEN;
	wchar_t szDwnUrl[BUF_LEN]  = L"";	DWORD nDwnUrlLen  = BUF_LEN;
	wchar_t szDwnUser[BUF_LEN] = L"";	DWORD nDwnUserLen = BUF_LEN;
	wchar_t szDwnPass[BUF_LEN] = L"";	DWORD nDwnPassLen = BUF_LEN;
	wchar_t szZipFile[BUF_LEN] = L"";

	MsiGetProperty(hInstall, L"SourceDir", szSourceDir, &nSourceDirDirLen);
	MsiGetProperty(hInstall, wzProperty_DWNURL, szDwnUrl, &nDwnUrlLen);
	MsiGetProperty(hInstall, L"HTTP_DWN_USER", szDwnUser, &nDwnUserLen);
	MsiGetProperty(hInstall, L"HTTP_DWN_PASS", szDwnPass, &nDwnPassLen);
	StringCchPrintf(szZipFile, BUF_LEN, L"%s%s", szSourceDir, wzZipFile);

	// Checking for Prerequisites\localFile
	wchar_t szBundleSrc[BUF_LEN] = L"";	DWORD nBundleSrcLen = BUF_LEN;
	wchar_t szPrereqDir[BUF_LEN] = L"";	DWORD nPrereqDirLen = BUF_LEN;
	wchar_t szLocalFile[BUF_LEN] = L"";
	wchar_t* szBundlePath;
	MsiGetProperty(hInstall, L"BUNDLE_SOURCE", szBundleSrc, &nBundleSrcLen);
	MsiGetProperty(hInstall, L"PREREQ_FOLDER", szPrereqDir, &nPrereqDirLen);
	PathGetDirectory(szBundleSrc, &szBundlePath);
	StringCchPrintf(szLocalFile, BUF_LEN, L"%s%s\\%s", szBundlePath, szPrereqDir, wzZipFile);

	// If local file exists use it instaead of download.
	DWORD pdwAttr;
	if (FileExistsEx(szLocalFile, &pdwAttr) == TRUE)
	{
		FileEnsureCopy(szLocalFile, szZipFile, TRUE);
		WcaLog(LOGMSG_STANDARD, "Nginx local package found \"%S\", will use that.", szLocalFile);		
	}
	else
	{
		DOWNLOAD_SOURCE downloadSource = {szDwnUrl, szDwnUser, szDwnPass};
		DWORD64 qwDownloadSize = 0;

		hr = DownloadUrl(&downloadSource, qwDownloadSize, szZipFile, pCache, NULL); 
		if (FAILED(hr))
			WcaLog(LOGMSG_STANDARD, "Failed to download %S package from url: %S", wzFriendlyName, szDwnUrl);			
		else
			WcaLog(LOGMSG_STANDARD, "%S package should be here: %S", wzFriendlyName, szZipFile);
	}

	WcaLog(LOGMSG_STANDARD, "Download package \"%S\" completed.", wzFriendlyName);

	return hr;
}



UINT __stdcall Download_MeteorPackage(MSIHANDLE hInstall)
{
	HRESULT hr = S_OK;
	UINT er = ERROR_SUCCESS;
	DOWNLOAD_CACHE_CALLBACK cacheCallback = { };

	cacheCallback.pfnProgress = NULL; //CacheProgressRoutine;
	cacheCallback.pfnCancel = NULL; 
	cacheCallback.pv = NULL; 

	hr = WcaInitialize(hInstall, "Download_MeteorPackage");
	ExitOnFailure(hr, "Failed to initialize Download_MeteorPackage");

	hr = Download_Package(hInstall, L"Meteor", L"METEOR_DWN_URL", L"meteor-bootstrap-os.windows.x86_32.tar.gz", &cacheCallback);
	ExitOnFailure(hr, "Failed to download Meteor package from specified URL."); 

LExit:
	er = SUCCEEDED(hr) ? ERROR_SUCCESS : ERROR_INSTALL_FAILURE;
	return WcaFinalize(er);
}




//UINT __stdcall CustomAction1(MSIHANDLE hInstall)
//{
//	HRESULT hr = S_OK;
//	UINT er = ERROR_SUCCESS;
//
//	hr = WcaInitialize(hInstall, "CustomAction1");
//	ExitOnFailure(hr, "Failed to initialize CustomAction1");
//
//	WcaLog(LOGMSG_STANDARD, "CustomAction1 Initialized.");
//
//	// TODO: Add your custom action code here.
//
//LExit:
//	er = SUCCEEDED(hr) ? ERROR_SUCCESS : ERROR_INSTALL_FAILURE;
//	return WcaFinalize(er);
//}



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
