// MongoDB exit codes.  This replicates information in
// https://github.com/mongodb/docs/blob/master/source/reference/exit-codes.txt
// but in a javascript dictionary instead of just a text file.

// Explanations have been rewritten, not copied, for license reasons.


var path = require("path");
var _ = require('underscore');

exports.Codes = {
  0 : { code: 0,
        symbol: "EXIT_CLEAN",
        longText: "MongoDB exited cleanly"
      },
  2 : { code: 2,
        symbol: "EXIT_BADOPTIONS",
        longText: "MongoDB was started with erroneous or incompatible command line options"
      },
  3 : { code: 3,
        symbol: "EXIT_REPLICATION_ERROR",
        longText: "There was an inconsistency between hostnames specified\n" +
        "on the command line compared with hostnames stored in local.sources"
      },
  4 : { code: 4,
        symbol: "EXIT_NEED_UPGRADE",
        longText: "MongoDB needs to upgrade to use this database"
      },
  5 : { code: 5,
        symbol: "EXIT_SHARDING_ERROR",
        longText: "A moveChunk operation failed"
      },
  12 : { code: 12,
         symbol: "EXIT_KILL",
         longText: "The MongoDB process was killed, on Windows"
       },
  14 : { code: 14,
         symbol: "EXIT_ABRUPT",
         longText: "Unspecified unrecoverable error. Exit was not clean"
       },
  20 : { code: 20,
         symbol: "EXIT_NTSERVICE_ERROR",
         longText: "Error managing NT Service on Windows"
       },
  45 : { code: 45,
         symbol: "EXIT_FS",
         longText: "MongoDB cannot open or obtain a lock on a file"
       },
  47 : { code: 47,
         symbol: "EXIT_CLOCK_SKEW",
         longText: "MongoDB exited due to excess clock skew"
       },
  48 : { code: 48,
         symbol: "EXIT_NET_ERROR",
         longText: "MongoDB exited because its port was closed, or was already\n" +
         "taken by a previous instance of MongoDB"
       },
  100 : { code: 100,
          symbol: "EXIT_UNCAUGHT",
          longText: "MongoDB had an unspecified uncaught exception.\n" +
          "This can be caused by MongoDB being unable to write to a local database.\n" +
          "Check that you have permissions to write to .meteor/local. MongoDB does\n" +
          "not support filesystems like NFS that do not allow file locking."
        }
};

_.each(exports.Codes, function (value) {
  exports[value.symbol] = value;
});
