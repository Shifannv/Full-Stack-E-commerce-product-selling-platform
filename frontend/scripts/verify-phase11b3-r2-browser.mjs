import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { page } from "./verify-phase11b3-browser.mjs";

const productSlug = "phase11b2-cotton-tote-730d72e64790";
const api = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8787";

async function main() {
  const env = await readFile(".env.local", "utf8");
  const publicBase = env
    .match(/^NEXT_PUBLIC_R2_PUBLIC_BASE_URL=(.+)$/m)?.[1]
    ?.trim();
  assert.ok(publicBase, "NEXT_PUBLIC_R2_PUBLIC_BASE_URL is not configured");
  const publicHost = new URL(publicBase).hostname;
  const tab = await page(`/products/${productSlug}`);
  try {
    let image;
    for (let attempt = 0; attempt < 30; attempt++) {
      image = await tab.evaluate(
        `(() => { const value = Array.from(document.images).find((item) => item.src.includes(${JSON.stringify(publicHost)})); return value ? { src: value.src, complete: value.complete, width: value.naturalWidth, height: value.naturalHeight } : null; })()`,
      );
      if (image?.complete && image.width > 0 && image.height > 0) break;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    assert.ok(
      image?.src.startsWith(`https://${publicHost}/products/`),
      "Product image source does not use the configured public R2 base URL",
    );
    assert.ok(
      image.complete && image.width > 0 && image.height > 0,
      "Product detail image did not load in the browser",
    );

    const browser = process.env.BROWSER_DEBUG_URL ?? "http://127.0.0.1:9222";
    const opened = await fetch(
      `${browser}/json/new?${encodeURIComponent(image.src)}`,
      { method: "PUT" },
    );
    assert.equal(
      opened.status,
      200,
      "Browser did not open the public R2 image URL",
    );
    const imageTarget = await opened.json();
    assert.equal(
      imageTarget.url,
      image.src,
      "Browser image tab did not use the public R2 URL",
    );
    await fetch(`${browser}/json/close/${imageTarget.id}`);

    const security = await tab.evaluate(`(async () => {
      const product = await (await fetch(${JSON.stringify(`${api}/api/products/${productSlug}`)}, { credentials: "include" })).json();
      const productText = JSON.stringify(product).toLowerCase();
      const resourceUrls = performance.getEntriesByType("resource").map((entry) => entry.name);
      const imageUrl = resourceUrls.find((url) => url.includes(${JSON.stringify(publicHost)}));
      return {
        productHasSensitiveTerms: /(r2.*(secret|token|credential)|access[_-]?key|secret[_-]?key)/.test(productText),
        imageUrl,
        imageUrlHasCredentials: imageUrl ? /[?&](token|signature|credential|access[_-]?key|secret)=|@/i.test(imageUrl) : true,
      };
    })()`);
    assert.equal(
      security.productHasSensitiveTerms,
      false,
      "Public product JSON exposes an R2 credential-like field",
    );
    assert.ok(
      security.imageUrl,
      "Browser network log is missing the R2 image request",
    );
    assert.equal(
      security.imageUrlHasCredentials,
      false,
      "R2 image request URL contains credentials",
    );

    const card = await page("/");
    try {
      const cardImage = await card.evaluate(
        `Array.from(document.images).map((item) => ({ src: item.src, complete: item.complete, width: item.naturalWidth })).find((item) => item.src === ${JSON.stringify(image.src)}) ?? null`,
      );
      assert.ok(
        cardImage?.complete && cardImage.width > 0,
        "Product card image did not load in the browser",
      );
    } finally {
      await card.close();
    }
    console.log(
      JSON.stringify({
        productImage: image.src,
        browserImageLoaded: true,
        browserImageTabOpened: true,
        productCardImageLoaded: true,
        publicProductResponseHasR2Credentials: false,
        imageRequestHasCredentials: false,
      }),
    );
  } finally {
    await tab.close();
  }
}

main().catch((error) => {
  console.error("R2 browser verification failed", error.message);
  process.exitCode = 1;
});
