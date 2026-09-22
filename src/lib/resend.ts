import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;

if (!apiKey) {
  throw new Error("Missing RESEND_API_KEY. Add it to your local .env file.");
}

const resend = new Resend(apiKey);

/**
 * Sends the initial Resend test email. Call this from a server-only route,
 * server action, or backend workflow; do not import it from client components.
 */
export async function sendHelloWorldEmail() {
  return resend.emails.send({
    from: "onboarding@resend.dev",
    to: "ownlinedropshipping@gmail.com",
    subject: "Hello World",
    html: "<p>Congrats on sending your <strong>first email</strong>!</p>",
  });
}

export { resend };
