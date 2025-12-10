import puppeteer from "puppeteer";

const width = 400;
const height = 250;

describe("Run browser tests", () => {
  it("Runs browser based integration tests", async () => {
    console.log("STARTING BROWSER TEST");
    const props = {
      headless: true,
      timeout: 15 * 1000,
      defaultViewport: { width, height },
      args: [
        `--window-size=${width},${height}`,
        "–no-sandbox",
        "-disable-setuid-sandbox",
        "--enable-unsafe-swiftshader"
      ]
    };
    if (process.env.CHROME_COMMAND_LOCATION) {
      props.executablePath = process.env.CHROME_COMMAND_LOCATION;
    }
    const browser = await puppeteer.launch(props);
    console.log("LAUNCHED BROWSER");

    const page = await browser.newPage();
    console.log("NEW PAGE");

    page.goto(process.env.ROOT_URL);
    console.log("OPEN PAGE", process.env.ROOT_URL);

    await page.waitForSelector("#react-target");
  });
});
