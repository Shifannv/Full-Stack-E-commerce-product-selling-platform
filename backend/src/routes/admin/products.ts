import { categories, products, subcategories } from "../../db/schema/catalog";
import {
  DomainError,
  getAdminId,
  requiredText,
} from "../../services/admin/admin.service";
import {
  assertProductAdmin,
  createProduct,
  createSubcategory,
  createVariant,
  getAdminCategoryConfig,
  listAdminProducts,
  saveProductImageMetadata,
  setProductInventory,
  updateProduct,
} from "../../services/admin/catalog.service";
import {
  MAX_PRODUCT_IMAGE_BYTES,
  productImageExtension,
  productImageObjectKey,
  readProductImageForm,
} from "../../services/admin/product-image-upload";
import { getAdminSummary } from "../../services/admin/summary.service";
import type { AdminRouter } from "./shared";
import { withDb, ownAdmin, body } from "./shared";

export function registerProductRoutes(adminRoutes: AdminRouter) {
  adminRoutes.get("/categories", async (c) => {
    ownAdmin(c.get("actor"));
    return c.json({
      categories: await withDb(c.env.HYPERDRIVE.connectionString, async (db) =>
        getAdminCategoryConfig(db, await getAdminId(db, c.get("actor").userId)),
      ),
    });
  });

  adminRoutes.get("/summary", async (c) => {
    const actor = c.get("actor");
    if (
      !actor.roles.includes("ADMIN") ||
      !actor.adminApproved ||
      !actor.permissions.includes("analytics.view") ||
      !actor.permissions.includes("earnings.view")
    )
      throw new DomainError("Forbidden", 403);
    return c.json(
      await withDb(c.env.HYPERDRIVE.connectionString, async (db) =>
        getAdminSummary(db, await getAdminId(db, actor.userId)),
      ),
    );
  });

  adminRoutes.get("/products", async (c) => {
    const actor = c.get("actor");
    if (
      !actor.roles.includes("ADMIN") ||
      !actor.adminApproved ||
      !actor.permissions.includes("products.view")
    )
      throw new DomainError("Forbidden", 403);
    const number = (key: string, fallback: number) => {
      const value = c.req.query(key);
      if (value === undefined) return fallback;
      const parsed = Number(value);
      if (!Number.isSafeInteger(parsed) || parsed < (key === "limit" ? 1 : 0))
        throw new DomainError(`Invalid ${key}`, 422);
      return parsed;
    };
    const status = c.req.query("status");
    if (status && !["DRAFT", "PUBLISHED", "ARCHIVED"].includes(status))
      throw new DomainError("Invalid status", 422);
    const limit = Math.min(50, number("limit", 20));
    const offset = number("offset", 0);
    return c.json({
      products: await withDb(c.env.HYPERDRIVE.connectionString, async (db) =>
        listAdminProducts(db, await getAdminId(db, actor.userId), {
          status,
          limit,
          offset,
        }),
      ),
      limit,
      offset,
    });
  });

  adminRoutes.post("/subcategories", async (c) => {
    const actor = c.get("actor");
    if (
      !actor.roles.includes("ADMIN") ||
      !actor.adminApproved ||
      !actor.permissions.includes("products.create")
    )
      throw new DomainError("Forbidden", 403);
    const v = await body(c);
    return c.json(
      await withDb(c.env.HYPERDRIVE.connectionString, async (db) =>
        createSubcategory(db, v, await getAdminId(db, actor.userId)),
      ),
    );
  });

  adminRoutes.post("/products", async (c) => {
    const actor = c.get("actor");
    if (
      !actor.roles.includes("ADMIN") ||
      !actor.adminApproved ||
      !actor.permissions.includes("products.create")
    )
      throw new DomainError("Forbidden", 403);
    const v = await body(c);
    return c.json(
      await withDb(c.env.HYPERDRIVE.connectionString, async (db) =>
        createProduct(db, await getAdminId(db, actor.userId), v),
      ),
    );
  });

  adminRoutes.patch("/products/:productId", async (c) => {
    const actor = c.get("actor");
    if (
      !actor.roles.includes("ADMIN") ||
      !actor.adminApproved ||
      !actor.permissions.includes("products.update")
    )
      throw new DomainError("Forbidden", 403);
    const v = await body(c);
    return c.json(
      await withDb(c.env.HYPERDRIVE.connectionString, async (db) =>
        updateProduct(
          db,
          await getAdminId(db, actor.userId),
          c.req.param("productId"),
          v,
        ),
      ),
    );
  });

  adminRoutes.post("/products/:productId/variants", async (c) => {
    const actor = c.get("actor");
    if (
      !actor.roles.includes("ADMIN") ||
      !actor.adminApproved ||
      !actor.permissions.includes("products.update")
    )
      throw new DomainError("Forbidden", 403);
    const v = await body(c);
    return c.json(
      await withDb(c.env.HYPERDRIVE.connectionString, async (db) =>
        createVariant(
          db,
          await getAdminId(db, actor.userId),
          c.req.param("productId"),
          v,
        ),
      ),
      201,
    );
  });

  adminRoutes.post("/products/:productId/images", async (c) => {
    const actor = c.get("actor");
    if (
      !actor.roles.includes("ADMIN") ||
      !actor.adminApproved ||
      !actor.permissions.includes("products.update")
    )
      throw new DomainError("Forbidden", 403);
    if (!c.env.PRODUCT_IMAGES_BUCKET)
      throw new DomainError("Product image storage unavailable", 409);
    const v = await body(c);
    const key = requiredText(v.objectKey, "objectKey", 500);
    if (!key.startsWith(`products/${c.req.param("productId")}/`))
      throw new DomainError("Invalid product image object key", 422);
    return c.json(
      await withDb(c.env.HYPERDRIVE.connectionString, async (db) => {
        const adminId = await getAdminId(db, actor.userId);
        await assertProductAdmin(db, adminId, c.req.param("productId"));
        if (!(await c.env.PRODUCT_IMAGES_BUCKET!.head(key)))
          throw new DomainError("Product image object unavailable", 404);
        return saveProductImageMetadata(
          db,
          adminId,
          c.req.param("productId"),
          v,
        );
      }),
      201,
    );
  });

  adminRoutes.post("/products/:productId/images/upload", async (c) => {
    const actor = c.get("actor");
    if (
      !actor.roles.includes("ADMIN") ||
      !actor.adminApproved ||
      !actor.permissions.includes("products.update")
    )
      throw new DomainError("Forbidden", 403);
    if (!c.env.PRODUCT_IMAGES_BUCKET)
      throw new DomainError("Product image storage unavailable", 409);
    const form = await readProductImageForm(c.req.raw);
    const file = form.get("file");
    if (
      !(file instanceof File) ||
      file.size === 0 ||
      file.size > MAX_PRODUCT_IMAGE_BYTES
    )
      throw new DomainError("Image must be at most 5 MB", 422);
    const data = await file.arrayBuffer();
    const extension = productImageExtension(file.type, new Uint8Array(data));
    const productId = c.req.param("productId");
    const objectKey = productImageObjectKey(productId, extension);
    const metadata = {
      objectKey,
      altText: form.get("altText"),
      sortOrder: form.get("sortOrder") ?? 0,
      variantId: form.get("variantId"),
    };
    return c.json(
      await withDb(c.env.HYPERDRIVE.connectionString, async (db) => {
        const adminId = await getAdminId(db, actor.userId);
        await assertProductAdmin(db, adminId, productId);
        await c.env.PRODUCT_IMAGES_BUCKET!.put(objectKey, data, {
          httpMetadata: { contentType: file.type },
        });
        try {
          return await saveProductImageMetadata(
            db,
            adminId,
            productId,
            metadata,
          );
        } catch (error) {
          await c.env
            .PRODUCT_IMAGES_BUCKET!.delete(objectKey)
            .catch(() => undefined);
          throw error;
        }
      }),
      201,
    );
  });

  adminRoutes.put("/products/:productId/inventory", async (c) => {
    const actor = c.get("actor");
    if (
      !actor.roles.includes("ADMIN") ||
      !actor.adminApproved ||
      !actor.permissions.includes("inventory.update")
    )
      throw new DomainError("Forbidden", 403);
    const v = await body(c);
    return c.json(
      await withDb(c.env.HYPERDRIVE.connectionString, async (db) =>
        setProductInventory(
          db,
          await getAdminId(db, actor.userId),
          c.req.param("productId"),
          Number(v.quantity),
          typeof v.variantId === "string" ? v.variantId : undefined,
          Number(v.expectedVersion),
        ),
      ),
    );
  });
}
