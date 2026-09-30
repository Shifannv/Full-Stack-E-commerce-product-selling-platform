import { DomainError } from "../../services/admin/admin.service";

/** Limit wire bytes before decoding or parsing, including chunked requests. */
export async function readBoundedBody(request: Request, limit: number): Promise<Uint8Array<ArrayBuffer>> {
  const declared = request.headers.get("content-length");
  if (declared && /^\d+$/.test(declared) && Number(declared) > limit) {
    await request.body?.cancel().catch(() => undefined);
    throw new DomainError("Payload too large", 413);
  }
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel().catch(() => undefined);
        throw new DomainError("Payload too large", 413);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

export async function readBoundedMultipart(request: Request, limit: number): Promise<FormData> {
  const type = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data\s*;/i.test(type)) throw new DomainError("Invalid multipart upload", 422);
  const bytes = await readBoundedBody(request, limit);
  return new Response(bytes, { headers: { "Content-Type": type } }).formData()
    .catch(() => { throw new DomainError("Invalid multipart upload", 422); });
}
