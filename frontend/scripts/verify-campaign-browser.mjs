import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { page } from "./verify-phase11b3-browser.mjs";

const output = resolve(process.cwd(), "../../.impeccable/review");
await mkdir(output, { recursive: true });
const checks = [];
for (const [route, name] of [["/", "home"], ["/search", "search"], ["/cart", "cart"], ["/account", "account"]]) {
  for (const [width, height, device] of [[1440, 900, "desktop"], [390, 844, "mobile"]]) {
    const tab = await page(route);
    try {
      await tab.send("Page.bringToFront");
      await tab.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: device === "mobile" });
      // A fresh navigation selects the appropriate campaign source for this viewport.
      await tab.send("Page.reload", { ignoreCache: true });
      await tab.evaluate("new Promise(resolve => setTimeout(resolve, 1800))");
      await tab.evaluate("window.scrollTo({top:0,behavior:'instant'}); new Promise(resolve=>setTimeout(resolve,300))");
      const state = await tab.evaluate(`({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, heading: document.querySelector('h1')?.innerText, video: (() => { const v=document.querySelector('video'); return v ? {src:v.currentSrc, width:v.videoWidth,height:v.videoHeight,ready:v.readyState,playing:!v.paused,time:v.currentTime} : null; })(), images:[...document.images].map(i=>({alt:i.alt,loaded:i.complete&&i.naturalWidth>0})) })`);
      assert.ok(state.scrollWidth <= width, `${route} overflows at ${width}px`);
      assert.ok(state.heading, `${route} missing heading`);
      if (name === "home") {
        assert.ok(state.images[0]?.loaded, "Campaign poster did not load");
        assert.ok(state.video?.playing, "Campaign video did not autoplay");
        assert.ok(state.video.src.includes(device === "mobile" ? "mobile.mp4" : "desktop.mp4"), "Wrong video rendition");
        assert.equal(await tab.evaluate("document.querySelector('.film-control')"), null, "Film control should be removed");
        assert.equal(await tab.evaluate("document.querySelector('video').controls"), false, "Native controls should be hidden");
        assert.ok(await tab.evaluate("document.querySelector('video').duration >= 17"), "Campaign should use a longer sequence");
        await tab.evaluate("document.querySelector('video').currentTime = document.querySelector('video').duration - 0.2; new Promise(resolve=>setTimeout(resolve,700))");
        assert.ok(await tab.evaluate("document.querySelector('video').currentTime < 2 && !document.querySelector('video').paused"), "Campaign should loop continuously");
        if (device === "mobile") {
          await tab.evaluate("document.querySelector('[aria-label=\"Open navigation\"]').click(); new Promise(resolve=>setTimeout(resolve,250))");
          assert.ok(await tab.evaluate("[...document.querySelectorAll('[role=dialog] a')].some(a=>a.getAttribute('href')==='/account')"), "Mobile account navigation missing");
          await tab.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
          await tab.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
          await tab.evaluate("new Promise(resolve=>setTimeout(resolve,250))");
        }
      }
      const screenshot = await tab.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      await writeFile(resolve(output, `${name}-${device}.png`), Buffer.from(screenshot.data, "base64"));
      if (name === "home") {
        await tab.evaluate("document.querySelector('#selected-edit').scrollIntoView(); new Promise(resolve=>setTimeout(resolve,350))");
        const collection = await tab.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
        await writeFile(resolve(output, `${name}-collection-${device}.png`), Buffer.from(collection.data, "base64"));
      }
      checks.push({ route, device, ...state });
    } finally { await tab.close(); }
  }
}
const reduced = await page("/");
try {
  await reduced.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await reduced.send("Page.reload", { ignoreCache: true });
  await reduced.evaluate("new Promise(resolve=>setTimeout(resolve,1000))");
  assert.equal(await reduced.evaluate("document.querySelector('video').getAttribute('src')"), null, "Reduced motion must not fetch the video");
  assert.equal(await reduced.evaluate("document.documentElement.classList.contains('lenis')"), false, "Reduced motion must use native scrolling");
  checks.push({ reducedMotion: "PASS" });
} finally { await reduced.close(); }
await writeFile(resolve(output, "campaign-checks.json"), JSON.stringify(checks, null, 2));
console.log(JSON.stringify({ result: "PASS", viewports: checks.filter(check => check.route).map(({ route, device, width, scrollWidth, video }) => ({ route, device, width, scrollWidth, video: video && { width: video.width, height: video.height, playing: video.playing } })), reducedMotion: "PASS", evidence: output }, null, 2));
