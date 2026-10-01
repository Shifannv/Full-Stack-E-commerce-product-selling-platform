import { eq } from "drizzle-orm";
import { categories, products, subcategories } from "../../db/schema/catalog";
import { DomainError } from "../../services/admin/admin.service";
import {
  configureField,
  createCategory,
  createSubcategory,
} from "../../services/admin/catalog.service";
import { auditedMutation } from "../../services/security-audit";
import type { AdminRouter } from "./shared";
import { withDb, superAdmin, body } from "./shared";

export function registerCatalogRoutes(adminRoutes: AdminRouter) {
  adminRoutes.post("/catalog/categories", async (c) => {
    superAdmin(c.get("actor"));
    const v = await body(c);
    return c.json(
      await withDb(c.env.HYPERDRIVE.connectionString, (db) =>
        auditedMutation(
          db,
          c.get("actor").userId,
          "CATEGORY_CREATED",
          "CATEGORY",
          (tx) => createCategory(tx, v),
          (result) => result.id,
        ),
      ),
    );
  });

  adminRoutes.patch("/catalog/categories/:categoryId/status", async (c) => {
    superAdmin(c.get("actor"));
    const v = await body(c);
    if (
      v.status !== "PUBLISHED" &&
      v.status !== "DRAFT" &&
      v.status !== "ARCHIVED"
    )
      throw new DomainError("Invalid status", 422);
    return c.json(
      await withDb(c.env.HYPERDRIVE.connectionString, (db) =>
        auditedMutation(
          db,
          c.get("actor").userId,
          "CATEGORY_STATUS_CHANGED",
          "CATEGORY",
          async (tx) => {
            const [result] = await tx
              .update(categories)
              .set({ status: v.status as string, updatedAt: new Date() })
              .where(eq(categories.id, c.req.param("categoryId")))
              .returning();
            if (!result) throw new DomainError("Category unavailable", 404);
            return result;
          },
          (result) => result.id,
        ),
      ),
    );
  });

  adminRoutes.post("/catalog/subcategories", async (c) => {
    superAdmin(c.get("actor"));
    const v = await body(c);
    return c.json(
      await withDb(c.env.HYPERDRIVE.connectionString, (db) =>
        auditedMutation(
          db,
          c.get("actor").userId,
          "SUBCATEGORY_CREATED",
          "SUBCATEGORY",
          (tx) => createSubcategory(tx, v),
          (result) => result.id,
        ),
      ),
    );
  });

  adminRoutes.patch(
    "/catalog/subcategories/:subcategoryId/status",
    async (c) => {
      superAdmin(c.get("actor"));
      const v = await body(c);
      if (
        v.status !== "PUBLISHED" &&
        v.status !== "DRAFT" &&
        v.status !== "ARCHIVED"
      )
        throw new DomainError("Invalid status", 422);
      return c.json(
        await withDb(c.env.HYPERDRIVE.connectionString, (db) =>
          auditedMutation(
            db,
            c.get("actor").userId,
            "SUBCATEGORY_STATUS_CHANGED",
            "SUBCATEGORY",
            async (tx) => {
              const [result] = await tx
                .update(subcategories)
                .set({ status: v.status as string, updatedAt: new Date() })
                .where(eq(subcategories.id, c.req.param("subcategoryId")))
                .returning();
              if (!result)
                throw new DomainError("Subcategory unavailable", 404);
              return result;
            },
            (result) => result.id,
          ),
        ),
      );
    },
  );

  adminRoutes.patch("/catalog/products/:productId/status", async (c) => {
    superAdmin(c.get("actor"));
    const v = await body(c);
    if (
      v.status !== "PUBLISHED" &&
      v.status !== "DRAFT" &&
      v.status !== "ARCHIVED"
    )
      throw new DomainError("Invalid status", 422);
    return c.json(
      await withDb(c.env.HYPERDRIVE.connectionString, (db) =>
        auditedMutation(
          db,
          c.get("actor").userId,
          "PRODUCT_STATUS_CHANGED",
          "PRODUCT",
          async (tx) => {
            const [result] = await tx
              .update(products)
              .set({ status: v.status as string, updatedAt: new Date() })
              .where(eq(products.id, c.req.param("productId")))
              .returning();
            if (!result) throw new DomainError("Product unavailable", 404);
            return result;
          },
          (result) => result.id,
        ),
      ),
    );
  });

  adminRoutes.patch("/catalog/products/:productId/featured", async (c) => {
    superAdmin(c.get("actor"));
    const v = await body(c);
    if (typeof v.featured !== "boolean")
      throw new DomainError("featured must be a boolean", 422);
    const featured = v.featured as boolean;
    return c.json(
      await withDb(c.env.HYPERDRIVE.connectionString, (db) =>
        auditedMutation(
          db,
          c.get("actor").userId,
          "PRODUCT_FEATURED_CHANGED",
          "PRODUCT",
          async (tx) => {
            const [result] = await tx
              .update(products)
              .set({ featured, updatedAt: new Date() })
              .where(eq(products.id, c.req.param("productId")))
              .returning({ id: products.id, featured: products.featured });
            if (!result) throw new DomainError("Product unavailable", 404);
            return result;
          },
          (result) => result.id,
        ),
      ),
    );
  });

  adminRoutes.put("/catalog/fields", async (c) => {
    superAdmin(c.get("actor"));
    const v = await body(c);
    return c.json(
      await withDb(c.env.HYPERDRIVE.connectionString, (db) =>
        auditedMutation(
          db,
          c.get("actor").userId,
          "CATALOG_FIELD_CONFIGURED",
          "CATEGORY_FIELD",
          (tx) => configureField(tx, v),
          (result) => result.id,
        ),
      ),
    );
  });
}
