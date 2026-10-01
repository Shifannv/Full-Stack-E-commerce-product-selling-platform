import { page } from "./verify-phase11b3-browser.mjs";

async function main() {
  const tab = await page("/account");
  try {
    let buttonReady = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      buttonReady = await tab.evaluate(
        "Array.from(document.querySelectorAll('button')).some((button) => button.innerText.includes('Continue with Google'))",
      );
      if (buttonReady) break;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    if (!buttonReady) throw new Error("Google sign-in button did not render");
    await tab.evaluate(
      "Array.from(document.querySelectorAll('button')).find((button) => button.innerText.includes('Continue with Google')).click()",
    );
    let state;
    for (let attempt = 0; attempt < 40; attempt++) {
      state = await tab.evaluate(
        "({ host: location.hostname, path: location.pathname, title: document.title, alert: document.querySelector('[role=alert]')?.innerText ?? '', text: document.body?.innerText.slice(0, 450) ?? '' })",
      );
      if (state.alert || (state.host !== "127.0.0.1" && state.text.length > 10))
        break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    console.log(
      JSON.stringify({
        host: state.host,
        path: state.path,
        redirectUriMismatch: /redirect_uri_mismatch/i.test(
          `${state.alert} ${state.text}`,
        ),
        accessBlocked: /access blocked/i.test(`${state.alert} ${state.text}`),
      }),
    );
  } finally {
    await tab.close();
  }
}

main().catch((error) => {
  console.error("Google browser start check failed", error.message);
  process.exitCode = 1;
});
