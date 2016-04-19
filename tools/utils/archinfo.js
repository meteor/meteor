var _ = require('underscore');
var os = require('os');

var utils = require('./utils.js');

/* Meteor's current architecture scheme defines the following virtual
 * machine types, which are defined by specifying what is promised by
 * the host enviroment:
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
 * os.linux.x86_32
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
 * os.windows.x86_32
 *   This is 32 and 64 bit Windows. It seems like there is not much of
 *   a benefit to using 64 bit Node on Windows, and 32 bit works properly
 *   even on 64 bit systems.
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


// Returns the fully qualified arch of this host -- something like
// "os.linux.x86_32" or "os.osx.x86_64". Must be called inside
// a fiber. Throws an error if it's not a supported architecture.
//
// If you change this, also change scripts/admin/launch-meteor
var _host = null; // memoize
var host = function () {
  if (! _host) {
    var run = function (...args) {
      var result = utils.execFileSync(args[0], args.slice(1)).stdout;
      if (! result) {
        throw new Error("can't get arch with " + args.join(" ") + "?");
      }
      return result.replace(/\s*$/, ''); // trailing whitespace
    };

    var platform = os.platform();

    if (platform === "darwin") {
      // Can't just test uname -m = x86_64, because Snow Leopard can
      // return other values.
      if (run('uname', '-p') !== "i386" ||
          run('sysctl', '-n', 'hw.cpu64bit_capable') !== "1") {
        throw new Error("Only 64-bit Intel processors are supported on OS X");
      }
      _host  = "os.osx.x86_64";
    }

    else if (platform === "linux") {
      var machine = run('uname', '-m');
      if (_.contains(["i386", "i686", "x86"], machine)) {
        _host = "os.linux.x86_32";
      } else if (_.contains(["x86_64", "amd64", "ia64"], machine)) {
        _host = "os.linux.x86_64";
      } else {
        throw new Error("Unsupported architecture: " + machine);
      }
    }

    else if (platform === "win32") {
      // We also use 32 bit builds on 64 bit Windows architectures.
      _host = "os.windows.x86_32";
    } else {
      throw new Error("Unsupported operating system: " + platform);
    }
  }

  return _host;
};

// True if `host` (an architecture name such as 'os.linux.x86_64') can run
// programs of architecture `program` (which might be something like 'os',
// 'os.linux', or 'os.linux.x86_64').
//
// `host` and `program` are just mnemonics -- `host` does not
// necessariy have to be a fully qualified architecture name. This
// function just checks to see if `program` describes a set of
// enviroments that is a (non-strict) superset of `host`.
var matches = function (host, program) {
  return host.substr(0, program.length) === program &&
    (host.length === program.length ||
     host.substr(program.length, 1) === ".");
};

// Like `supports`, but instead taken an array of possible
// architectures as its second argument. Returns the most specific
// match, or null if none match. Throws an error if `programs`
// contains exact duplicates.
var mostSpecificMatch = function (host, programs) {
  var seen = {};
  var best = null;

  _.each(programs, function (p) {
    if (seen[p]) {
      throw new Error("Duplicate architecture: " + p);
    }
    seen[p] = true;
    if (archinfo.matches(host, p) &&
        (! best || p.length > best.length)) {
      best = p;
    }
  });

  return best;
};

// `programs` is a set of architectures (as an array of string, which
// may contain duplicates). Determine if there exists any architecture
// that is compatible with all of the architectures in the set. If so,
// returns the least specific such architecture. Otherwise (the
// architectures are disjoin) raise an exception.
//
// For example, for 'os' and 'os.osx', return 'os.osx'. For 'os' and
// 'os.linux.x86_64', return 'os.linux.x86_64'. For 'os' and 'browser', throw an
// exception.
var leastSpecificDescription = function (programs) {
  if (programs.length === 0) {
    return '';
  }

  // Find the longest string
  var longest = _.max(programs, function (p) { return p.length; });

  // If everything else in the list is compatible with the longest,
  // then it must be the most specific, and if everything is
  // compatible with the most specific then it must be the least
  // specific compatible description.
  _.each(programs, function (p) {
    if (! archinfo.matches(longest, p)) {
      throw new Error("Incompatible architectures: '" + p + "' and '" +
                      longest + "'");
    }
  });

  return longest;
};

var withoutSpecificOs = function (arch) {
  if (arch.substr(0, 3) === 'os.') {
    return 'os';
  }
  return arch;
};

var archinfo = exports;
_.extend(archinfo, {
  host: host,
  matches: matches,
  mostSpecificMatch: mostSpecificMatch,
  leastSpecificDescription: leastSpecificDescription,
  withoutSpecificOs: withoutSpecificOs
});
