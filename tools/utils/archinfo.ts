import { max } from 'underscore';
import os from 'os';
const utils = require('./utils');

/* Meteor's current architecture scheme defines the following virtual
 * machine types, which are defined by specifying what is promised by
 * the host environment:
 *
 * browser.w3c
 *   A web browser compliant with modern standards. This is
 *   intentionally a broad definition. In the coming years, as web
 *   standards evolve, we will likely tighten it up.
 *
 * browser.ie[678]
 *   Old versions of Internet Explorer (not sure yet exactly which
 *   versions to distinguish -- maybe 6 and 8?)
 *
 * os.linux.x86_64
 *   Linux on Intel x86 architecture. x86_64 means a system that can
 *   run 64-bit images, furnished with 64-bit builds of shared
 *   libraries (there is no guarantee that 32-bit builds of shared
 *   libraries will be available). x86_32 means a system that can run
 *   32-bit images, furnished with 32-bit builds of shared libraries.
 *   Additionally, if a package contains shared libraries (for use by
 *   other packages), then if the package is built for x86_64, it
 *   should contain a 64-bit version of the library, and likewise for
 *   32-bit.
 *
 *   Operationally speaking, if you worked at it, under this
 *   definition it would be possible to build a Linux system that can
 *   run both x86_64 and x86_32 images (eg, by using a 64-bit kernel
 *   and making sure that both versions of all relevant libraries were
 *   installed). But we require such a host to decide whether it is
 *   x86_64 or x86_32, and stick with it. You can't load a combination
 *   of packages from each and expect them to work together, because
 *   if they contain shared libraries they all need to have the same
 *   architecture.
 *
 *   Basically the punchline is: if you installed the 32-bit version
 *   of Ubuntu, you've got a os.linux.x86_32 system and you will
 *   use exclusively os.linux.x86_32 packages, and likewise
 *   64-bit. They are two parallel universes and which one you're in
 *   is determined by which version of Red Hat or Ubuntu you
 *   installed.
 *
 * os.osx.x86_64
 *   OS X (technically speaking, Darwin) on Intel x86 architecture,
 *   with a kernel capable of loading 64-bit images, and 64-bit builds
 *   of shared libraries available.  If a os.osx.x86_64 package
 *   contains a shared library, it is only required to provide a
 *   64-bit version of the library (it is not required to provide a
 *   fat binary with both 32-bit and 64-bit builds).
 *
 *   Note that in modern Darwin, both the 32 and 64 bit versions of
 *   the kernel can load 64-bit images, and the Apple-supplied shared
 *   libraries are fat binaries that include both 32-bit and 64-bit
 *   builds in a single file. So it is technically fine (but
 *   discouraged) for a os.osx.x86_64 to include a 32-bit
 *   executable, if it only uses the system's shared libraries, but
 *   you'll run into problems if shared libraries from other packages
 *   are used.
 *
 *   There is no os.osx.x86_32. Our experience is that such
 *   hardware is virtually extinct. Meteor has never supported it and
 *   nobody has asked for it.
 *
 * os.windows.x86_64
 *   Once, on the far side of yesterday, there was not a 64-bit
 *   build of Meteor for Windows, due to the belief that Node didn't
 *   take (enough?) advantage of a 64-bit platform.  As time has passed,
 *   and as V8 engine improvements have been bestowed upon it, this is
 *   no longer as clear as it may have once been.  Node.js Foundation
 *   releases 64-bit versions themselves, likely for good reason.
 *   Present-day operation of 64-bit binaries on 64-bit Windows
 *   platforms show clear performance benefits over their 32-bit
 *   siblings (e.g. 7-zip, et.al), so Meteor should also try to offer
 *   that same benefit by building and offering a 64-bit version.
 *   Meteor no longer supports Windows 32-bit.
 *
 * To be (more but far from completely) precise, the ABI for os.*
 * architectures includes a CPU type, a mode in which the code will be
 * run (eg, 64 bit), an executable file format (eg, ELF), a promise to
 * make any shared libraries available in a particular architecture,
 * and promise to set up the shared library search path
 * "appropriately". In the future it will also include some guarantees
 * about the directory layout in the environment, eg, location of a
 * directory where temporary files may be freely written. It does not
 * include any syscalls (beyond those used by code that customarily is
 * statically linked into every executable built on a platform, eg,
 * exit(2)). It does not guarantee the presence of any particular
 * shared libraries or programs (including any particular shell or
 * traditional tools like 'grep' or 'find').
 *
 * To model the shared libraries that are required on a system (and
 * the particular versions that are required), and to model
 * dependencies on command-line programs like 'bash' and 'grep', the
 * idea is to have a package named something like 'posix-base' that
 * rolls up a reasonable base environment (including such modern
 * niceties as libopenssl) and is supplied by the container. This
 * allows it to be versioned, unlike architectures, which we hope to
 * avoid versioning.
 *
 * Q: What does "x86" mean?
 * A: It refers to the traditional Intel architecture, which
 * originally surfaced in CPUs such as the 8086 and the 80386. Those
 * of us who are older should remember that the last time that Intel
 * used this branding was the 80486, introduced in 1989, and that
 * today, parts that use this architecture bear names like "Core",
 * "Atom", and "Phenom", with no "86" it sight. We use it in the
 * architecture name anyway because we don't want to depart too far
 * from Linux's architecture names.
 *
 * Q: Why do we call it "x86_32" instead of the customary "i386" or
 * "i686"?
 * A: We wanted to have one name for 32-bit and one name for 64-bit,
 * rather than several names for each that are virtual synonyms for
 * each (eg, x86_64 vs amd64 vs ia64, i386 vs i686 vs x86). For the
 * moment anyway, we're willing to adopt a "one size fits all"
 * attitude to get there (no ability to have separate builds for 80386
 * CPUs that don't support Pentium Pro extensions, for example --
 * you'll have to do runtime detection if you need that). And as long
 * as we have to pick a name, we wanted to pick one that was super
 * clear (it is not obvious to many people that "i686" means "32-bit
 * Intel", because why should it be?) and didn't imply too close of an
 * equivalence to the precise meanings that other platforms may assign
 * to some of these strings.
 */

// Valid architectures that Meteor officially supports.
export const VALID_ARCHITECTURES: Record<string, boolean> = {
  "os.osx.x86_64": true,
  "os.osx.arm64": true,
  "os.linux.x86_64": true,
  "os.windows.x86_64": true,
  "os.linux.aarch64": true,
};

// Returns the fully qualified arch of this host -- something like
// "os.linux.x86_32" or "os.osx.x86_64".
// Throws an error if it's not a supported architecture.
//
// If you change this, also change scripts/admin/launch-meteor
let _host: string | null = null; // memoize

export function host() {
  if (!_host) {
    const run = function (...args: Array<string | boolean>) {
      const result = utils.execFileSync(args[0], args.slice(1)).stdout;

      if (! result) {
        throw new Error(`Can't get arch with ${args.join(" ")}?`);
      }

      return result.replace(/\s*$/, ''); // remove trailing whitespace
    };

    const platform = os.platform();

    if (platform === "darwin") {
      // Can't just test uname -m = x86_64, because Snow Leopard can
      // return other values.
      const arch = run('uname', '-p');

      if ((arch !== "i386" && arch !== "arm") ||
         run('sysctl', '-n', 'hw.cpu64bit_capable') !== "1") {
        throw new Error("Only 64-bit Intel and M1 processors are supported on OS X");
      }
      if(arch === "arm"){
        _host  = "os.osx.arm64";
      }else{
        _host  = "os.osx.x86_64";
      }
    } else if (platform === "linux") {
      const machine = run('uname', '-m');
      if (["x86_64", "amd64", "ia64"].includes(machine)) {
        _host = "os.linux.x86_64";
      } else if(machine === "aarch64") {
        _host = "os.linux.aarch64";
      } else {
        throw new Error(`Unsupported architecture: ${machine}`);
      }
    } else if (platform === "win32" && process.arch === "x64") {
      _host = "os.windows.x86_64";
    } else {
      throw new Error(`Unsupported operating system: ${platform}`);
    }
  }

  return _host;
}

// In order to springboard to earlier Meteor releases that did not have
// 64-bit Windows builds, Windows installations must be allowed to
// download 32-bit builds of meteor-tool.
export function acceptableMeteorToolArches(): string[] {
  if (os.platform() === "win32") {
    switch (utils.architecture()) {
    case "x86_32":
      return ["os.windows.x86_32"];
    case "x86_64":
      return [
        "os.windows.x86_64",
        "os.windows.x86_32",
      ];
    }
  }

  return [host()];
}

// 64-bit Windows machines that have been using a 32-bit version of Meteor
// are eligible to switch to 64-bit beginning with Meteor 1.6, which is
// the first version of Meteor that contains this code.
export function canSwitchTo64Bit(): boolean {
  // Automatically switching from 32-bit to 64-bit Windows builds is
  // disabled for the time being, since downloading additional builds of
  // meteor-tool isn't stable enough at the moment (on Windows, at least)
  // to introduce in a release candidate.
  return false &&
    utils.architecture() === "x86_64" &&
    host() === "os.windows.x86_32";
}

// True if `host` (an architecture name such as 'os.linux.x86_64') can run
// programs of architecture `program` (which might be something like 'os',
// 'os.linux', or 'os.linux.x86_64').
//
// `host` and `program` are just mnemonics -- `host` does not
// necessarily have to be a fully qualified architecture name. This
// function just checks to see if `program` describes a set of
// environments that is a (non-strict) superset of `host`.
export function matches(host: string, program: string): boolean {
  return host.substr(0, program.length) === program &&
    (host.length === program.length ||
     host.substr(program.length, 1) === ".");
}

const legacyArches = [
  "web.browser.legacy",
  // It's important to include web.browser.legacy resources in the Cordova
  // bundle, since Cordova bundles are built into the mobile application,
  // rather than being downloaded from a web server at runtime. This means
  // we can't distinguish between clients at runtime, so we have to use
  // code that works for all clients.
  "web.cordova",
];

export function isLegacyArch(arch: string): boolean {
  return legacyArches.some(la => matches(arch, la));
}

export function mapWhereToArches(where: string) {
  const arches: string[] = [];

  // Shorthands for common arch prefixes:
  // "server" => os.*
  // "client" => web.*
  // "legacy" => web.browser.legacy, web.cordova
  if (where === "server") {
    arches.push("os");
  } else if (where === "client") {
    arches.push("web");
  } else if (where === "modern") {
    arches.push("web.browser");
  } else if (where === "legacy") {
    arches.push(...legacyArches);
  } else {
    arches.push(where);
  }

  return arches;
}

// Like `supports`, but instead taken an array of possible
// architectures as its second argument. Returns the most specific
// match, or null if none match. Throws an error if `programs`
// contains exact duplicates.
export function mostSpecificMatch(host: string, programs: string[]): string | null  {
  let best: string | null = null;
  const seen: Record<string, boolean> = {};

  programs.forEach((program: string) => {
    if (seen[program]) {
      throw new Error(`Duplicate architecture: ${program}`);
    }

    seen[program] = true;

    if (matches(host, program) && (!best || program.length > best.length)) {
      best = program;
    }
  });

  return best;
}

// `programs` is a set of architectures (as an array of string, which
// may contain duplicates). Determine if there exists any architecture
// that is compatible with all of the architectures in the set. If so,
// returns the least specific such architecture. Otherwise (the
// architectures are disjoin) raise an exception.
//
// For example, for 'os' and 'os.osx', return 'os.osx'. For 'os' and
// 'os.linux.x86_64', return 'os.linux.x86_64'. For 'os' and 'browser', throw an
// exception.
export function leastSpecificDescription(programs: string[]): string {
  if (programs.length === 0) {
    return '';
  }

  // Find the longest string
  const longest = String(max(programs, (p: string) => p.length));

  // If everything else in the list is compatible with the longest,
  // then it must be the most specific, and if everything is
  // compatible with the most specific then it must be the least
  // specific compatible description.
  programs.forEach((program: string) => {
    if (!matches(longest, program)) {
      throw new Error(`Incompatible architectures: '${program}' and '${longest}'`);
    }
  });

  return longest;
}

export function withoutSpecificOs(arch: string): string {
  if (arch.substr(0, 3) === 'os.') {
    return 'os';
  }

  return arch;
}
