import { DomainError } from "./admin.service";

export const MAX_PRODUCT_IMAGE_BYTES = 5_000_000;
export const MAX_PRODUCT_IMAGE_REQUEST_BYTES =
  MAX_PRODUCT_IMAGE_BYTES + 500_000;

/** Bound actual bytes before multipart parsing, even for chunked/misdeclared bodies. */
export async function readProductImageForm(
  request: Request,
): Promise<FormData> {
  const declared = request.headers.get("content-length");
  if (
    declared &&
    /^\d+$/.test(declared) &&
    Number(declared) > MAX_PRODUCT_IMAGE_REQUEST_BYTES
  ) {
    throw new DomainError("Image request is too large", 413);
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data\s*;/i.test(contentType) || !request.body)
    throw new DomainError("Invalid multipart image upload", 422);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_PRODUCT_IMAGE_REQUEST_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new DomainError("Image request is too large", 413);
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError("Invalid multipart image upload", 422);
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Response(bytes, { headers: { "Content-Type": contentType } })
    .formData()
    .catch(() => {
      throw new DomainError("Invalid multipart image upload", 422);
    });
}

export function productImageExtension(
  contentType: string,
  bytes: Uint8Array,
): "png" | "jpg" | "webp" {
  if (
    contentType === "image/png" &&
    bytes.length >= 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every(
      (value, index) => bytes[index] === value,
    )
  )
    return "png";
  if (
    contentType === "image/jpeg" &&
    bytes.length >= 3 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255
  )
    return "jpg";
  if (
    contentType === "image/webp" &&
    bytes.length >= 12 &&
    [82, 73, 70, 70].every((value, index) => bytes[index] === value) &&
    [87, 69, 66, 80].every((value, index) => bytes[index + 8] === value)
  )
    return "webp";
  throw new DomainError("A PNG, JPEG, or WebP image is required", 422);
}

export function productImageObjectKey(
  productId: string,
  extension: "png" | "jpg" | "webp",
  id = crypto.randomUUID(),
): string {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      productId,
    )
  )
    throw new DomainError("Invalid product ID", 422);
  return `products/${productId}/${id}.${extension}`;
}
