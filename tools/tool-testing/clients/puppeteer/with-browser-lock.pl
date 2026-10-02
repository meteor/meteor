use strict;
use warnings;
use Fcntl qw(:flock F_SETFD);

my $lock_path = shift @ARGV or die "Missing Puppeteer lock path\n";
@ARGV or die "Missing Puppeteer installer command\n";

# Keep this inode for every invocation. Unlinking a lock file would let a
# waiter lock a different inode while an installer still holds the old one.
open my $lock, '>>', $lock_path or die "Cannot open $lock_path: $!\n";
my $fd = fileno($lock);
fcntl($lock, F_SETFD, 0) or die "Cannot inherit Puppeteer lock: $!\n";
$ENV{PUPPETEER_INSTALL_LOCK_FD} = $fd;

$SIG{ALRM} = sub {
  print STDERR "Timed out waiting for another Puppeteer installation\n";
  exit 124;
};
alarm 600;
flock($lock, LOCK_EX) or die "Cannot lock $lock_path: $!\n";
alarm 0;

exec @ARGV or die "Cannot start Puppeteer installer: $!\n";
