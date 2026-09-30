import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { publicImageUrl } from "../src/lib/images.ts";

// Read-only browser verification. Requires Node with TypeScript stripping (Node 22.18+).
try { process.loadEnvFile(fileURLToPath(new URL("../.env.local", import.meta.url))); }
catch (error) { if (error.code !== "ENOENT") throw error; }

const browser = process.env.BROWSER_DEBUG_URL ?? "http://127.0.0.1:9222";
const storefront = process.env.STOREFRONT_URL ?? "http://127.0.0.1:3000";
const api = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8787";
const categorySlug = "phase11b2-accessories-730d72e64790";
const productSlug = "phase11b2-cotton-tote-730d72e64790";

export async function page(path) {
  const created = await fetch(`${browser}/json/new?${encodeURIComponent(`${storefront}${path}`)}`, { method: "PUT" });
  assert.equal(created.status, 200);
  const target = await created.json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject, timer } = pending.get(message.id);
    clearTimeout(timer);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  });
  function send(method, params = {}) {
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Browser command timed out: ${method}`)); }, 20000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  }
  await send("Page.enable");
  await send("Runtime.enable");
  for (let attempt = 0; attempt < 40; attempt++) {
    const state = await evaluate("({ href: location.href, ready: document.readyState, length: document.body?.innerText.length ?? 0 })");
    if (state.href.startsWith(storefront) && state.ready === "complete" && state.length > 0) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  await new Promise((resolve) => setTimeout(resolve, 400));
  return { evaluate, send, close: async () => { socket.close(); await fetch(`${browser}/json/close/${target.id}`).catch(() => undefined); } };
}

async function main() {
  const productResponse = await fetch(`${api}/api/products/${productSlug}`, { signal: AbortSignal.timeout(15000) });
  assert.equal(productResponse.status, 200);
  const product = await productResponse.json();
  const imageUrl = publicImageUrl(product.images[0]?.objectKey);
  assert.ok(imageUrl, "Fixture needs a real image and NEXT_PUBLIC_R2_PUBLIC_BASE_URL");
  assert.equal(new URL(imageUrl).protocol, "https:");
  const imageResponse = await fetch(imageUrl, { signal: AbortSignal.timeout(15000) });
  assert.equal(imageResponse.status, 200);
  assert.equal(new URL(imageResponse.url).protocol, "https:");
  assert.match(imageResponse.headers.get("content-type") ?? "", /^image\/(png|jpeg|webp)/);
  await imageResponse.arrayBuffer();
  const cases = [
    ["/", "TEST Ownline Everyday Cotton Tote"],
    ["/search", "Search the collection"],
    [`/categories/${categorySlug}`, "TEST Ownline Everyday Accessories"],
    [`/products/${productSlug}`, "TEST Ownline Everyday Cotton Tote"],
    ["/wishlist", "Wishlist"],
    ["/cart", "Cart"],
    ["/account", "Account"],
    ["/account/addresses", "Address"],
    ["/orders", "Orders"],
    ["/checkout", "Checkout"],
  ];
  for (const [path, expected] of cases) {
    const tab = await page(path);
    try {
      const state = await tab.evaluate("({ title: document.title, text: document.body.innerText, fallback: document.body.innerText.includes('Image coming soon') })");
      assert.ok(state.text.toLowerCase().includes(expected.toLowerCase()), `${path} missing ${expected}; title=${state.title}; body=${state.text.slice(0, 220)}`);
      if (path === "/" || path === `/products/${productSlug}`) {
        const loaded = await tab.evaluate(`(async () => { const img = [...document.images].find(image => image.src === ${JSON.stringify(imageUrl)}); if (!img) return false; img.scrollIntoView(); try { await img.decode(); } catch { return false; } return img.complete && img.naturalWidth > 0; })()`);
        assert.equal(loaded, true, `${path}: environment-resolved fixture image must load`);
        if (path === `/products/${productSlug}`) assert.equal(state.fallback, false);
        console.log(`${path}: centralized image URL, HTTPS retrieval and browser image decode PASS`);
      }
      console.log(`${path}: browser render PASS`);
      if (path === "/") {
        const browserApi = await tab.evaluate(`(async () => { const paths = ['/api/categories', '/api/me', '/api/customer/cart']; const values = []; for (const path of paths) { const response = await fetch(${JSON.stringify(api)} + path, { credentials: 'include' }); values.push(response.status); } return values; })()`);
        assert.deepEqual(browserApi, [200, 401, 401]);
        console.log("Browser cross-origin public read and logged-out customer protection: PASS");
      }
    } finally { await tab.close(); }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error("Storefront browser verification failed", error.message); process.exitCode = 1; });
}
