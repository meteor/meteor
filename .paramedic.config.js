module.exports = {
  platform: "ios",
  plugins: ".",
  action: "run",
  verbose: true,
  skipAppiumTests: true,
  ci: true,
  target: "iPhone-X\\,",
  args: "--buildFlag=\" -UseModernBuildSystem=0\""
};
