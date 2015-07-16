var global = this;

if (global.Date !== Date) {
  global.Date = Date;
}

if (global.parseInt !== parseInt) {
  global.parseInt = parseInt;
}
