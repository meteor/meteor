#define _GNU_SOURCE
#include <execinfo.h>
#include <signal.h>
#include <unistd.h>

static void trace_native_signal(int signo) {
  static const char marker[] = "\nNATIVE_PREPARATION_SIGNAL_BACKTRACE\n";
  void *frames[64];
  ssize_t written = write(STDERR_FILENO, marker, sizeof(marker) - 1);
  (void)written;
  int count = backtrace(frames, 64);
  backtrace_symbols_fd(frames, count, STDERR_FILENO);
  // SA_RESETHAND restores the default disposition. Re-raise the same signal
  // so the diagnostic preserves the original failure status and core policy.
  raise(signo);
}

__attribute__((constructor)) static void install_native_trace(void) {
  // Load the unwinder before a failure can interrupt the allocator.
  void *frames[1];
  backtrace(frames, 1);
  struct sigaction action = {0};
  action.sa_handler = trace_native_signal;
  action.sa_flags = SA_RESETHAND;
  sigemptyset(&action.sa_mask);
  sigaction(SIGABRT, &action, 0);
  sigaction(SIGSEGV, &action, 0);
}
