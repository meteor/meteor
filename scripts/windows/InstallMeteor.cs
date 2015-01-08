// Executable to launch meteor after bootstrapping the local warehouse
//
// Copyright 2013 - 2014 Stephen Darnell

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using System.Text;
using System.Threading;
using Microsoft.Win32.SafeHandles;

[assembly: AssemblyTitle("Windows Meteor installer")]
[assembly: AssemblyDescription("Downloads the Meteor bootstrap package installs it")]
[assembly: AssemblyCompany("Meteor Development Group")]
[assembly: AssemblyProduct("Meteor")]
[assembly: AssemblyCopyright("Copyright 2014 Meteor Development Group")]
[assembly: AssemblyVersion("0.1.0.0")]
[assembly: AssemblyFileVersion("0.1.0.0")]

namespace LaunchMeteor
{
    class Program
    {
        // private const string BOOTSTRAP_FILE = "meteor-bootstrap-Windows_i686.tar.gz"; // pre-0.9.x
        private const string BOOTSTRAP_FILE = "meteor-bootstrap-os.windows.x86_32-0.0.20.tar.gz";
        private const string BOOTSTRAP_URL = "https://warehouse.meteor.com/windows/bootstrap/" + BOOTSTRAP_FILE;

        private const string METEOR_WAREHOUSE_DIR = "METEOR_WAREHOUSE_DIR";

        private static string bootstrapFile = null;
        private static bool looksLikeNewConsole = false;
        private static int consoleWindowWidth = 80;

        private static void InitialiseConsoleInfo()
        {
            // Try/catch needed when not connected to a console
            try
            {
                looksLikeNewConsole = Console.CursorLeft == 0 && Console.CursorTop == 0;
                consoleWindowWidth = Console.WindowWidth;
            } catch {}
        }

        static void Main(string[] args)
        {
            InitialiseConsoleInfo();

            // Avoid console vanishing without warning if invoked from a non-console app
            AppDomain.CurrentDomain.UnhandledException += (sender, handlerArgs) =>
                {
                    Console.WriteLine("Unexpected exception: {0}", handlerArgs.ExceptionObject);
                    Exit(1);
                };

            if (args.Length == 1 && args[0] == "--downloaded")
            {
                bootstrapFile = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, BOOTSTRAP_FILE);
                args = new string[0];
            }

            var home = Environment.GetEnvironmentVariable("LOCALAPPDATA") ??
                       Environment.GetEnvironmentVariable("APPDATA");
            var warehouse = Path.Combine(home, ".meteor");
            Environment.SetEnvironmentVariable(METEOR_WAREHOUSE_DIR, warehouse);

            // XXX will this overwrite if Meteor is already installed?
            // we would like it to
            BootstrapWarehouse(warehouse);
            Console.WriteLine("To run Meteor, open a new Command Prompt and type 'meteor'");
            Exit(1);
        }

        #region Executing child processes

        private static void Exec(string command, string extra, string[] args)
        {
            if (extra != null)
            {
                var list = new List<string>(args);
                list.Insert(0, extra);
                args = list.ToArray();
            }
            string commandLine = string.Join(" ", Array.ConvertAll<string, string>(args, QuoteArg));
            if (!File.Exists(command))
            {
                Console.WriteLine("Unable to find executable for command:");
                Console.WriteLine("  {0} {1}", command, commandLine);
                Exit(1);
            }
            var child = Process.Start(new ProcessStartInfo(command, commandLine) { UseShellExecute = false });
            child.WaitForExit();
            Exit(child.ExitCode);
        }

        private static string QuoteArg(string unquoted)
        {
            if (unquoted.Length > 0 && unquoted.IndexOfAny(" \t\n\v\"".ToCharArray()) == -1)
                return unquoted;
            var result = new StringBuilder("\"");
            int slashes = 0;
            foreach (var ch in unquoted)
            {
                if (ch == '"') // Double up any slashes and escape the quote
                {
                    while (slashes-- >= 0) result.Append('\\');
                }
                result.Append(ch);
                slashes = (ch == '\\') ? slashes + 1 : 0;
            }
            return result.Append('"').ToString();
        }

        public static void Exit(int exitCode)
        {
            if (looksLikeNewConsole)
            {
                Console.WriteLine("\nPlease press any key to exit.");
                Console.ReadKey(true);
            }
            Environment.Exit(exitCode);
        }

        #endregion

        #region Boostrap the warehouse

        private static MemoryStream DownloadBoostrapFile()
        {
            Console.WriteLine("Downloading initial Meteor files...");
            DownloadDataCompletedEventArgs download = null;
            var complete = new AutoResetEvent(false);
            var barWidth = consoleWindowWidth - 5;
            using (var client = new WebClient())
            {
                if (client.Proxy != null)
                {
                    client.Proxy.Credentials = CredentialCache.DefaultCredentials;
                }
                client.UseDefaultCredentials = true;
                client.DownloadProgressChanged += (sender, e) =>
                    {
                        var sb = new StringBuilder();
                        sb.AppendFormat("\r{0:00} ", e.ProgressPercentage);
                        int blobs = (barWidth * e.ProgressPercentage) / 100;
                        for (int i = 0; i < barWidth; i++) sb.Append(i < blobs ? '#' : '-');
                        Console.Write(sb.ToString());
                    };
                client.DownloadDataCompleted += (sender, e) =>
                    {
                        download = e;
                        complete.Set();
                    };
                client.DownloadDataAsync(new Uri(BOOTSTRAP_URL));
            }
            complete.WaitOne();
            if (download.Error != null)
                throw download.Error;

            if (download.Result.Length < 10 * 1024 * 1024 ||
                (download.Result[0] != 0x1f || download.Result[1] != 0x8b))
            {
                throw new InvalidDataException("Unexpected data returned from: " + BOOTSTRAP_URL);
            }

            Console.WriteLine("   \rDownload complete ({0:#.#} MB)", download.Result.Length / (1024.0 * 1024.0));

            var stream = new MemoryStream(download.Result);
            download = null;
            return stream;
        }

        private static void BootstrapWarehouse(string warehouse)
        {
            MemoryStream stream;
            if (bootstrapFile != null)
            {
                var data = File.ReadAllBytes(bootstrapFile);
                stream = new MemoryStream(data);
                data = null;
            }
            else
            {
                try
                {
                    stream = DownloadBoostrapFile();
                }
                catch (Exception)
                {
                    Console.WriteLine("\nERROR: A problem occurred while downloading the bootstrap package.");
                    Console.WriteLine("\nIf this persists, you can download it manually from:");
                    Console.WriteLine("  " + BOOTSTRAP_URL);
                    Console.WriteLine("and put it in the same directory as LaunchMeteor.exe and run:");
                    Console.WriteLine("  LaunchMeteor.exe -downloaded");
                    Console.WriteLine("\nHere are some details of the error:");
                    throw;
                }
            }

            Console.WriteLine("Extracting files to {0}", warehouse);

            var tempDir = warehouse + "~";
            if (File.Exists(tempDir))
                File.Delete(tempDir);
            DirectoryDelete(tempDir);

            try
            {
                var regex = new Regex(@"^\.meteor\\");
                ExtractTgz(stream, tempDir, p => regex.Replace(p, ""));
                DirectoryDelete(warehouse);
                Directory.Move(tempDir, warehouse);
            }
            catch
            {
                DirectoryDelete(tempDir);
                throw;
            }
            Console.WriteLine("Files extracted successfully\n");

            var path = Environment.GetEnvironmentVariable("PATH", EnvironmentVariableTarget.User) ?? string.Empty;
            var paths = path.Split(';');
            if (!Array.Exists(paths, p => p.Equals(warehouse, StringComparison.OrdinalIgnoreCase)))
            {
                Console.WriteLine("Updating PATH to include {0}", warehouse);
                path += ((path.Length > 0) ? ";" : "") + warehouse;
                Environment.SetEnvironmentVariable("PATH", path, EnvironmentVariableTarget.User);
            }
        }

        private static void DirectoryDelete(string path)
        {
            for (int attempt = 1; Directory.Exists(path) && attempt <= 5; attempt++)
            {
                //if (attempt == 1)
                //    Console.WriteLine("Deleting directory: {0}", path);
                //else
                //    Console.WriteLine("Deleting directory: {0} attempt {1}", path, attempt);
                try { RecursiveDeleteDirectory(path); } catch {}
                if (Directory.Exists(path))
                    Thread.Sleep(1000);
            }

            // Throw the exception
            if (Directory.Exists(path))
                RecursiveDeleteDirectory(path);
        }

        #endregion

        #region Tar file extraction

        public static void ExtractTgz(string archive, string targetDirectory)
        {
            using (var fileStream = File.OpenRead(archive))
            {
                ExtractTgz(fileStream, targetDirectory, p => p);
            }
        }

        public static void ExtractTgz(Stream stream, string directory, Func<string, string> transform)
        {
            int totalFiles = 0, totalData = 0;
            var buffer = new byte[512];
            using (var decompressed = new GZipStream(stream, CompressionMode.Decompress))
            {
                string longName = null;
                for (int n; (n = decompressed.Read(buffer, 0, buffer.Length)) > 0; )
                {
                    if (n != buffer.Length)
                        throw new InvalidDataException("Unexpected end of TAR file");

                    if (TarField(buffer, 257, 5) != "ustar") continue;

                    var type = (TarType)buffer[156];
                    var length = Convert.ToInt32(TarField(buffer, 124, 12).Trim(), 8);
                    var link = TarField(buffer, 157, 100);
                    var path = longName ?? Path.Combine(TarField(buffer, 345, 155), TarField(buffer, 0, 100));
                    longName = null;
                    if (type == TarType.LongName)
                    {
                        var data = new MemoryStream(length);
                        for (; length > 0; length -= buffer.Length)
                        {
                            if (decompressed.Read(buffer, 0, buffer.Length) != buffer.Length)
                                throw new InvalidDataException("Unexpected end of TAR file");
                            data.Write(buffer, 0, Math.Min(length, buffer.Length));
                        }
                        longName = TarField(data.ToArray(), 0, (int)data.Length);
                        continue;
                    }

                    //Console.WriteLine("{0} {1} {2}", type, length.ToString().PadLeft(9), path);
                    if (type == TarType.AltReg || type == TarType.Reg || type == TarType.Contig ||
                        type == TarType.Sym || type == TarType.Lnk)
                    {
                        if (((++totalFiles) & 0xF) == 0) Console.Write(".");

                        path = path.Replace('/', '\\');
                        if (("\\" + path + "\\").Contains("\\..\\"))
                            throw new InvalidDataException("Filenames containing '..' are not allowed");

                        path = Path.Combine(directory, transform(path));
                        try
                        {
                            CreateDirectory(GetDirectoryName(path));
                            using (var fstream = CreateWritableFile(path))
                            {
                                if (type == TarType.Lnk || type == TarType.Sym)
                                {
                                    var data = Encoding.UTF8.GetBytes(link);
                                    fstream.Write(data, 0, data.Length);
                                    length = 0;
                                }

                                totalData += length;
                                for (; length > 0; length -= buffer.Length)
                                {
                                    if (decompressed.Read(buffer, 0, buffer.Length) != buffer.Length)
                                        throw new InvalidDataException("Unexpected end of TAR file");
                                    fstream.Write(buffer, 0, Math.Min(length, buffer.Length));
                                }
                            }
                        }
                        catch
                        {
                            Console.WriteLine();
                            Console.WriteLine("Error processing path: {0}", path);
                            throw;
                        }
                    }
                }
                Console.WriteLine("\nExtracted {0} files ({1:#.#} MB)", totalFiles, totalData / (1024.0 * 1024.0));
            }
        }

        private enum TarType : int { AltReg = 0, Reg = '0', Lnk = '1', Sym = '2', Chr = '3', Blk = '4', Dir = '5', Fifo = '6', Contig = '7', LongName = 'L' }

        private static string TarField(byte[] buffer, int start, int len)
        {
            var str = Encoding.UTF8.GetString(buffer, start, len);
            int pos = str.IndexOf('\0');
            return pos < 0 ? str : str.Substring(0, pos);
        }

        #endregion

        // Get directory name (supporting long file names)
        private static string GetDirectoryName(string path)
        {
            path = path.Replace('/', '\\');
            int pos = path.LastIndexOf('\\');
            return (pos >= 0) ? path.Substring(0, pos) : null;
        }

        // Create a file, supporting long file names
        private static FileStream CreateWritableFile(string path)
        {
            SafeFileHandle handle = NativeMethods.CreateFile(@"\\?\" + path,
                EFileAccess.GenericWrite, EFileShare.None, IntPtr.Zero,
                ECreationDisposition.CreateAlways, 0, IntPtr.Zero);

            int error = Marshal.GetLastWin32Error();
            if (handle.IsInvalid)
                throw new System.ComponentModel.Win32Exception(error);

            // Pass the file handle to FileStream. FileStream will close it.
            return new FileStream(handle, FileAccess.Write);
        }

        // Create a directory, supporting long file names
        private static void CreateDirectory(string path)
        {
            bool result = NativeMethods.CreateDirectory(@"\\?\" + path, IntPtr.Zero);
            int error = Marshal.GetLastWin32Error();
            if (result || error == NativeMethods.ERROR_ALREADY_EXISTS)
                return;

            if (error != NativeMethods.ERROR_PATH_NOT_FOUND)
                throw new System.ComponentModel.Win32Exception(error);

            // Try to create parent first, before trying again
            CreateDirectory(GetDirectoryName(path));
            CreateDirectory(path);
        }

        private static void RecursiveDeleteDirectory(string path)
        {
            path = path.TrimEnd('\\');
            IntPtr INVALID_HANDLE_VALUE = new IntPtr(-1);
            WIN32_FIND_DATA findData;
            IntPtr handle = NativeMethods.FindFirstFile(@"\\?\" + path + @"\*", out findData);
            if (handle != INVALID_HANDLE_VALUE)
            {
                for (bool more = true; more; more = NativeMethods.FindNextFile(handle, out findData))
                {
                    string name = findData.cFileName;
                    if (((int)findData.dwFileAttributes & NativeMethods.FILE_ATTRIBUTE_DIRECTORY) != 0)
                    {
                        if (name != "." && name != "..")
                            RecursiveDeleteDirectory(Path.Combine(path, name));
                    }
                    else
                    {
                        var filePath = @"\\?\" + Path.Combine(path, name);
                        // Make sure we can still delete if the file is read-only
                        NativeMethods.SetFileAttributes(filePath, ((int)findData.dwFileAttributes) & ~NativeMethods.FILE_ATTRIBUTE_READONLY);
                        if (!NativeMethods.DeleteFile(filePath))
                        {
                            int error = Marshal.GetLastWin32Error();
                            throw new System.ComponentModel.Win32Exception(error);
                        }
                    }
                }
            }
            NativeMethods.FindClose(handle);

            if (!NativeMethods.RemoveDirectory(@"\\?\" + path))
            {
                int error = Marshal.GetLastWin32Error();
                throw new System.ComponentModel.Win32Exception(error);
            }
        }
    }

    // PInvoke support for long file names

    internal static class NativeMethods
    {
        public const int FILE_ATTRIBUTE_DIRECTORY = 0x00000010;
        public const int FILE_ATTRIBUTE_READONLY = 0x1;
        public const int ERROR_PATH_NOT_FOUND = 3;
        public const int ERROR_ALREADY_EXISTS = 183;

        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        internal static extern SafeFileHandle CreateFile(
            string lpFileName,
            EFileAccess dwDesiredAccess,
            EFileShare dwShareMode,
            IntPtr lpSecurityAttributes,
            ECreationDisposition dwCreationDisposition,
            EFileAttributes dwFlagsAndAttributes,
            IntPtr hTemplateFile);

        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool DeleteFile(string lpFileName);

        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool CreateDirectory(string lpPathName, IntPtr lpSecurityAttributes);

        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool RemoveDirectory(string lpPathName);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
        internal static extern IntPtr FindFirstFile(string lpFileName, out WIN32_FIND_DATA lpFindFileData);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
        internal static extern bool FindNextFile(IntPtr hFindFile, out WIN32_FIND_DATA lpFindFileData);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool FindClose(IntPtr hFindFile);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
        internal static extern int GetFileAttributes(string lpFileName);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
        internal static extern bool SetFileAttributes(string lpFileName, int dwFileAttributes);
    }

    [StructLayout(LayoutKind.Sequential)]
    internal struct FILETIME
    {
        internal uint dwLowDateTime;
        internal uint dwHighDateTime;
    };

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    internal struct WIN32_FIND_DATA
    {
        internal EFileAttributes dwFileAttributes;
        internal FILETIME ftCreationTime;
        internal FILETIME ftLastAccessTime;
        internal FILETIME ftLastWriteTime;
        internal int nFileSizeHigh;
        internal int nFileSizeLow;
        internal int dwReserved0;
        internal int dwReserved1;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)]
        internal string cFileName;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 14)]
        internal string cAlternate;
    }

    [Flags]
    public enum EFileAccess : uint
    {
        GenericRead = 0x80000000,
        GenericWrite = 0x40000000,
        GenericExecute = 0x20000000,
        GenericAll = 0x10000000,
    }

    [Flags]
    public enum EFileShare : uint
    {
        None = 0x00000000,
        Read = 0x00000001,
        Write = 0x00000002,
        Delete = 0x00000004,
    }

    public enum ECreationDisposition : uint
    {
        New = 1,
        CreateAlways = 2,
        OpenExisting = 3,
        OpenAlways = 4,
        TruncateExisting = 5,
    }

    [Flags]
    public enum EFileAttributes : uint
    {
        Readonly = 0x00000001,
        Hidden = 0x00000002,
        System = 0x00000004,
        Directory = 0x00000010,
        Archive = 0x00000020,
        Device = 0x00000040,
        Normal = 0x00000080,
        Temporary = 0x00000100,
        SparseFile = 0x00000200,
        ReparsePoint = 0x00000400,
        Compressed = 0x00000800,
        Offline = 0x00001000,
        NotContentIndexed = 0x00002000,
        Encrypted = 0x00004000,
        Write_Through = 0x80000000,
        Overlapped = 0x40000000,
        NoBuffering = 0x20000000,
        RandomAccess = 0x10000000,
        SequentialScan = 0x08000000,
        DeleteOnClose = 0x04000000,
        BackupSemantics = 0x02000000,
        PosixSemantics = 0x01000000,
        OpenReparsePoint = 0x00200000,
        OpenNoRecall = 0x00100000,
        FirstPipeInstance = 0x00080000
    }
}
