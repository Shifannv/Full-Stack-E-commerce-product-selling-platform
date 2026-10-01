/** HTTP is allowed only for the verified loopback development storefront. */
export function invitationSetupUrl(value: string): URL {
  const url = new URL(value);
  const local = url.origin === "http://127.0.0.1:3000";
  if (
    (url.protocol !== "https:" && !local) ||
    url.username ||
    url.password ||
    url.hash ||
    url.search
  ) {
    throw new Error(
      "Admin setup URL must use HTTPS or the local development origin and contain no credentials, query, or fragment",
    );
  }
  return url;
}

export function invitationLink(setupPageUrl: string, rawToken: string): string {
  const url = invitationSetupUrl(setupPageUrl);
  url.searchParams.set("token", rawToken);
  return url.toString();
}
