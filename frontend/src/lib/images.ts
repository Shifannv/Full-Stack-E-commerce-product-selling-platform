/** Product rows store only an R2 object key. The public custom domain is configured per environment. */
export function publicImageUrl(
  objectKey: string | null | undefined,
): string | null {
  const base = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL?.trim();
  if (!base || !objectKey) return null;
  const segments = objectKey.split("/");
  if (
    segments.some((segment) => !segment || segment === "." || segment === "..")
  )
    return null;
  try {
    const origin = new URL(base);
    if (
      origin.protocol !== "https:" &&
      !(
        origin.protocol === "http:" &&
        (origin.hostname === "localhost" || origin.hostname === "127.0.0.1")
      )
    )
      return null;
    return new URL(
      segments.map(encodeURIComponent).join("/"),
      `${origin.toString().replace(/\/$/, "")}/`,
    ).toString();
  } catch {
    return null;
  }
}
