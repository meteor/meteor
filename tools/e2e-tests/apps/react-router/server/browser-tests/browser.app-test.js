import puppeteer from "puppeteer";

const width = 200;
const height = 150;

describe("Run browser tests", () => {
  it("Runs browser based integration tests", async function () {
    // Browser startup and navigation have their own 15-second budgets.
    // Mocha's default two seconds can expire before either one completes.
    this.timeout(60_000);
    console.log("STARTING BROWSER TEST");

    const props = {
      headless: true,
      timeout: 15_000,
      defaultViewport: { width, height },
      args: [
        `--window-size=${width},${height}`,
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--single-process",
        "--no-zygote",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-background-networking",
        "--disable-background-timer-throttling",
        "--disable-breakpad",
        "--disable-component-update",
        "--disable-sync",
        "--metrics-recording-only",
        "--mute-audio",
        "--enable-unsafe-swiftshader",
      ],
    };

    if (process.env.CHROME_COMMAND_LOCATION) {
      props.executablePath = process.env.CHROME_COMMAND_LOCATION;
    }

    const browser = await puppeteer.launch(props);
    try {
      console.log("LAUNCHED BROWSER");
      const page = await browser.newPage();
      console.log("NEW PAGE");
      await page.goto(process.env.ROOT_URL, { timeout: 15_000 });
      console.log("OPEN PAGE", process.env.ROOT_URL);
      await page.waitForSelector("#react-target", { timeout: 15_000 });
    } finally {
      await browser.close();
    }
  });
});
