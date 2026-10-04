import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { page } from "./verify-phase11b3-browser.mjs";

const output = resolve(process.cwd(), "../../.tmp-redesign");
await mkdir(output, { recursive: true });

for (const [path, name] of [["/", "home"], ["/products/tees", "product"], ["/admin", "admin"], ["/super-admin", "super-admin"]]) {
  const tab = await page(path);
  try {
    for (const [width, height, device] of [[1440, 900, "desktop"], [1280, 800, "1280"], [1024, 768, "1024"], [768, 1024, "768"], [390, 844, "mobile"], [375, 812, "375"]]) {
      await tab.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: device === "mobile" });
      await new Promise((resolve) => setTimeout(resolve, 350));
      const state = await tab.evaluate(`({title:document.title,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,heading:document.querySelector('h1')?.innerText ?? '',images:[...document.images].map(x=>({alt:x.alt,loaded:x.complete&&x.naturalWidth>0})).slice(0,6),text:document.body.innerText.slice(0,450)})`);
      assert.equal(state.scrollWidth <= state.width, true, `${name} ${device} has horizontal overflow: ${JSON.stringify(state)}`);
      if (device === "desktop" || device === "mobile") {
        const capture = await tab.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
        await writeFile(resolve(output, `${name}-${device}.png`), Buffer.from(capture.data, "base64"));
      }
      console.log(JSON.stringify({ page: name, device, ...state }));
    }
  } finally {
    await tab.close();
  }
}
