#define _GNU_SOURCE
#include <node_api.h>
#include <signal.h>
#include <unistd.h>

static unsigned int append_number(char *output, unsigned int value) {
  char digits[16];
  unsigned int size = 0;
  do {
    digits[size++] = '0' + value % 10;
    value /= 10;
  } while (value);
  for (unsigned int i = 0; i < size / 2; i++) {
    char temp = digits[i];
    digits[i] = digits[size - i - 1];
    digits[size - i - 1] = temp;
  }
  for (unsigned int i = 0; i < size; i++) output[i] = digits[i];
  return size;
}

static void trace_native_signal(int signo) {
  static const char marker[] = "\nNATIVE_PREPARATION_SIGNAL ";
  char message[96];
  unsigned int size = sizeof(marker) - 1;
  for (unsigned int i = 0; i < size; i++) message[i] = marker[i];
  size += append_number(message + size, (unsigned int)getpid());
  message[size++] = ' ';
  size += append_number(message + size, (unsigned int)signo);
  message[size++] = '\n';
  ssize_t written = write(STDERR_FILENO, message, size);
  (void)written;
  // Freeze every thread before the main thread can finish process exit.
  // The diagnostic parent attaches GDB only after the native failure occurs.
  kill(getpid(), SIGSTOP);
  _exit(128 + signo);
}

NAPI_MODULE_INIT() {
  (void)env;
  struct sigaction action = {0};
  action.sa_handler = trace_native_signal;
  sigemptyset(&action.sa_mask);
  sigaction(SIGABRT, &action, 0);
  sigaction(SIGSEGV, &action, 0);
  return exports;
}
