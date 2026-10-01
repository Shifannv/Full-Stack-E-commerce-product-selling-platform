import { Hono } from "hono";
import { createDb } from "../../db";
import { requireAuth, type AuthorizedEnv } from "../../middleware/authorization";
import { DomainError } from "../../services/admin/admin.service";
import { deleteCustomerAddress, getCart, getPublicProduct, getWishlist, listCatalog, listCustomerAddresses, listPublicCategories, removeCartItem, saveCustomerAddress, setCartItem, setWishlist, type CatalogSort } from "../../services/customer/customer.service";
import { quoteCart } from "../../services/customer/order.service";

export const publicCatalogRoutes = new Hono<AuthorizedEnv>();
export const customerRoutes = new Hono<AuthorizedEnv>();
async function withDb<T>(connectionString: string, action: (db: ReturnType<typeof createDb>["db"]) => Promise<T>) { const { client, db } = createDb(connectionString); try { return await action(db); } finally { await client.end({ timeout: 1 }); } }
async function body(c: { req: { json: () => Promise<unknown> } }): Promise<Record<string, unknown>> { const value = await c.req.json().catch(() => null); if (!value || typeof value !== "object" || Array.isArray(value)) throw new DomainError("Invalid JSON body", 422); return value as Record<string, unknown>; }
const onError = (error: Error, c: Parameters<Parameters<typeof customerRoutes.onError>[0]>[1]) => error instanceof DomainError ? c.json({ error: error.message }, error.status) : (console.error("Customer API failed", { name: error.name, code: (error as { code?: string }).code }), c.json({ error: "Customer operation unavailable" }, 503));
publicCatalogRoutes.onError(onError); customerRoutes.onError(onError);

publicCatalogRoutes.get("/categories", async (c) => c.json({ categories: await withDb(c.env.HYPERDRIVE.connectionString, listPublicCategories) }));
publicCatalogRoutes.get("/products", async (c) => { const number = (name: string) => { const raw = c.req.query(name); if (raw === undefined) return undefined; const value = Number(raw); if (!Number.isFinite(value) || value < 0) throw new DomainError(`Invalid ${name}`, 422); return value; }; const limit = Math.min(50, Math.max(1, Math.floor(number("limit") ?? 20))), offset = Math.floor(number("offset") ?? 0); const q = c.req.query("q")?.trim().slice(0, 100); const featured = c.req.query("featured") === "true" ? true : undefined; const sort = c.req.query("sort") ?? "newest"; if (!["newest", "price-asc", "price-desc"].includes(sort)) throw new DomainError("Invalid sort", 422); const available = c.req.query("available"); const inStock = c.req.query("inStock"); if (available !== undefined && available !== "true" && available !== "false") throw new DomainError("Invalid available", 422); if (inStock !== undefined && inStock !== "true" && inStock !== "false") throw new DomainError("Invalid inStock", 422); if (available !== undefined && inStock !== undefined && available !== inStock) throw new DomainError("Conflicting availability filters", 422); return c.json({ products: await withDb(c.env.HYPERDRIVE.connectionString, (db) => listCatalog(db, { q, category: c.req.query("category"), subcategory: c.req.query("subcategory"), minPrice: number("minPrice"), maxPrice: number("maxPrice"), featured, available: (inStock ?? available) === "true", sort: sort as CatalogSort, limit, offset })) }); });
publicCatalogRoutes.get("/products/:slug", async (c) => c.json(await withDb(c.env.HYPERDRIVE.connectionString, (db) => getPublicProduct(db, c.req.param("slug")))));

customerRoutes.use("*", requireAuth);
customerRoutes.use("*", async (c, next) => { if (!c.get("actor").roles.includes("CUSTOMER")) throw new DomainError("Forbidden", 403); await next(); });
customerRoutes.get("/addresses", async (c) => c.json({ addresses: await withDb(c.env.HYPERDRIVE.connectionString, (db) => listCustomerAddresses(db, c.get("actor").userId)) }));
customerRoutes.post("/addresses", async (c) => { const v = await body(c); return c.json(await withDb(c.env.HYPERDRIVE.connectionString, (db) => saveCustomerAddress(db, c.get("actor").userId, v)), 201); });
customerRoutes.put("/addresses/:addressId", async (c) => { const v = await body(c); return c.json(await withDb(c.env.HYPERDRIVE.connectionString, (db) => saveCustomerAddress(db, c.get("actor").userId, v, c.req.param("addressId")))); });
customerRoutes.delete("/addresses/:addressId", async (c) => c.json(await withDb(c.env.HYPERDRIVE.connectionString, (db) => deleteCustomerAddress(db, c.get("actor").userId, c.req.param("addressId")))));
customerRoutes.get("/cart", async (c) => c.json(await withDb(c.env.HYPERDRIVE.connectionString, (db) => getCart(db, c.get("actor").userId))));
customerRoutes.get("/checkout/quote", async (c) => c.json(await withDb(c.env.HYPERDRIVE.connectionString, (db) => quoteCart(db, c.get("actor").userId, c.req.query("addressId")))));
customerRoutes.put("/cart/items/:productId", async (c) => { const v = await body(c); return c.json(await withDb(c.env.HYPERDRIVE.connectionString, (db) => setCartItem(db, c.get("actor").userId, c.req.param("productId"), Number(v.quantity), typeof v.variantId === "string" ? v.variantId : undefined))); });
customerRoutes.delete("/cart/items/:itemId", async (c) => c.json(await withDb(c.env.HYPERDRIVE.connectionString, (db) => removeCartItem(db, c.get("actor").userId, c.req.param("itemId")))));
customerRoutes.get("/wishlist", async (c) => c.json({ products: await withDb(c.env.HYPERDRIVE.connectionString, (db) => getWishlist(db, c.get("actor").userId)) }));
customerRoutes.put("/wishlist/:productId", async (c) => { const v = await body(c); if (typeof v.enabled !== "boolean") throw new DomainError("enabled must be a boolean", 422); return c.json(await withDb(c.env.HYPERDRIVE.connectionString, (db) => setWishlist(db, c.get("actor").userId, c.req.param("productId"), v.enabled as boolean))); });
