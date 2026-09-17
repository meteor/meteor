import { waitForMeteorOutput } from "./helpers";

describe("waitForMeteorOutput", () => {
  it("matches text split by ANSI formatting sequences", async () => {
    const formattedRule = [
      "\u001b[32m/\u001b[39m",
      "\u001b[33m\\.\u001b[39m",
      "\u001b[32m(\u001b[39mjs\u001b[32m|\u001b[39mjsx\u001b[32m)\u001b[39m",
      "\u001b[32m$\u001b[39m",
      "\u001b[32m/i\u001b[39m",
    ].join("");

    await expect(
      waitForMeteorOutput([formattedRule], "/\\.(js|jsx)$/i", { timeout: 20, checkInterval: 1 }),
    ).resolves.toBe(formattedRule);
  });
});
