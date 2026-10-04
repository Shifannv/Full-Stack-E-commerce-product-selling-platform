import { api, id, json } from "./client";

export type WorkflowField = { name: string; label: string; kind?: "number" | "decimal" | "text" | "textarea" | "boolean" | "file" | "password" | "list" | "attributes"; optional?: boolean; options?: string[]; min?: number; max?: number; step?: string; accept?: string };
export type OperatorWorkflow = { key: string; group: string; label: string; role: "admin" | "super-admin"; method: "GET" | "POST" | "PUT" | "PATCH"; path: string; fields: WorkflowField[]; description?: string; blocked?: string; download?: boolean };
const field = (name: string, label: string, extra: Partial<WorkflowField> = {}): WorkflowField => ({ name, label, ...extra });
const ref = (name: string, label = name.replace(/Id$/, " reference")): WorkflowField => field(name, label);
const notes = field("notes", "Decision notes", { kind: "textarea" });
const reason = field("reason", "Reason", { kind: "textarea" });
const decision = field("decision", "Decision", { options: ["APPROVED", "REJECTED"] });
const status = field("status", "Publication status", { options: ["DRAFT", "PUBLISHED", "ARCHIVED"] });
const address = [field("contactName", "Contact name"),field("phone", "Phone"),field("businessName", "Business name", {optional:true}),field("line1", "Address line 1"),field("line2", "Address line 2", {optional:true}),field("city", "City"),field("state", "State"),field("postalCode", "Postal code"),field("country", "Country code")];
const addressType = field("type", "Address type", {options:["SHIPPING_ORIGIN","RETURN"]});
const categoryFields = [field("name", "Name"),field("slug", "URL slug"),field("description", "Description", {kind:"textarea",optional:true})];
const attributes = field("attributes", "Product attributes (one key=value per line)", {kind:"attributes",optional:true});
const pagination = [field("limit", "Rows per page", {kind:"number",min:1,max:100,optional:true}),field("offset", "Rows to skip", {kind:"number",min:0,optional:true})];
const shippingGate = "Shipment creation, AWB assignment and pickup are paused until the Shiprocket provider and webhook checks are completed.";
const rows: OperatorWorkflow[] = [];
function add(role: OperatorWorkflow["role"], group: string, key: string, label: string, method: OperatorWorkflow["method"], path: string, fields: WorkflowField[] = [], extra: Partial<OperatorWorkflow> = {}) { rows.push({role,group,key,label,method,path,fields,...extra}); }

add("admin","Catalog","products","Browse products","GET","/api/admin/products",[...pagination,{...status,optional:true}]);
add("admin","Catalog","categories","Assigned categories & fields","GET","/api/admin/categories");
add("admin","Catalog","create-product","Create a product","POST","/api/admin/products",[ref("categoryId","Category reference"),ref("subcategoryId","Subcategory reference"),...categoryFields,field("sku","SKU",{optional:true}),field("price","Price in INR"),attributes,field("returnEnabled","Enable Dress returns",{kind:"boolean"}),...['weightKg','lengthCm','breadthCm','heightCm'].map(name=>field(name,name,{kind:"decimal",step:"any",min:0.001,optional:true}))],{description:"Use assigned category and subcategory references. Products start as drafts; Super Admin controls publication. Required category attributes appear in Assigned categories & fields. For attributes, use quoted text for numeric-looking text values, and unquoted numbers or true/false for typed values."});
add("admin","Catalog","edit-product","Edit a product","PATCH","/api/admin/products/:productId",[ref("productId","Product reference"),...categoryFields.map(f=>({...f,optional:true})),field("sku","SKU",{optional:true}),field("price","Price in INR",{optional:true}),attributes,field("returnEnabled","Dress returns",{kind:"boolean",optional:true}),...['weightKg','lengthCm','breadthCm','heightCm'].map(name=>field(name,name,{kind:"decimal",step:"any",min:0.001,optional:true}))]);
add("admin","Catalog","subcategory","Create a subcategory","POST","/api/admin/subcategories",[ref("categoryId","Category reference"),...categoryFields]);
add("admin","Catalog","variant","Add a product variant","POST","/api/admin/products/:productId/variants",[ref("productId","Product reference"),field("title","Variant title"),field("sku","Variant SKU"),field("price","Price in INR"),attributes]);
add("admin","Catalog","inventory-read","Read inventory & current versions","GET","/api/admin/products/:productId/inventory",[ref("productId","Product reference")]);
add("admin","Catalog","inventory","Set available inventory","PUT","/api/admin/products/:productId/inventory",[ref("productId","Product reference"),{...ref("variantId","Variant reference"),optional:true},field("quantity","Stock quantity",{kind:"number",min:0,max:10000000}),field("expectedVersion","Current inventory version",{kind:"number",min:0})],{description:"Read the current version before updating inventory. Use version 0 only to create an inventory row that does not yet exist."});
add("admin","Catalog","image-upload","Upload a product image","POST","/api/admin/products/:productId/images/upload",[ref("productId","Product reference"),field("file","Product image, up to 5 MB",{kind:"file",accept:"image/jpeg,image/png,image/webp"}),field("altText","Image description",{optional:true}),field("sortOrder","Display position",{kind:"number",min:0,optional:true}),{...ref("variantId","Variant reference"),optional:true}]);
add("admin","Catalog","image-metadata","Attach an existing uploaded image","POST","/api/admin/products/:productId/images",[ref("productId","Product reference"),field("objectKey","Existing product image storage key"),field("altText","Image description",{optional:true}),field("sortOrder","Display position",{kind:"number",min:0,optional:true}),{...ref("variantId","Variant reference"),optional:true}]);
add("admin","Seller profile","onboarding","Seller application","GET","/api/admin/onboarding");
add("admin","Seller profile","kyc","Save seller details","PUT","/api/admin/onboarding/kyc",[field("legalName","Legal name"),field("businessType","Business type"),field("contactPhone","Contact phone")]);
add("admin","Seller profile","kyc-document","Upload verification document","POST","/api/admin/onboarding/kyc/documents",[field("documentType","Document type"),field("file","PDF, JPEG or PNG, up to 5 MB",{kind:"file",accept:"application/pdf,image/jpeg,image/png"})]);
add("admin","Seller profile","address","Save operational address","PUT","/api/admin/onboarding/addresses/:type",[addressType,...address]);
add("admin","Seller profile","request-category","Request a category assignment","POST","/api/admin/onboarding/categories/:categoryId",[ref("categoryId","Category reference")]);
add("admin","Seller profile","submit-application","Submit application for review","POST","/api/admin/onboarding/submit");
add("admin","Orders & returns","orders","Your orders","GET","/api/admin/orders");
add("admin","Orders & returns","order","Inspect an order","GET","/api/admin/orders/:orderId",[ref("orderId","Order reference")]);
add("admin","Orders & returns","tracking","Shipment tracking","GET","/api/admin/orders/:orderId/tracking",[ref("orderId","Order reference")]);
add("admin","Orders & returns","return","Inspect a return","GET","/api/admin/returns/:returnId",[ref("returnId","Return reference")]);
add("admin","Orders & returns","return-decision","Approve or decline a return","POST","/api/admin/returns/:returnId/decision",[ref("returnId","Return reference"),field("approve","Approve this request",{kind:"boolean"}),notes]);
add("admin","Orders & returns","return-received","Record a returned item received","POST","/api/admin/returns/:returnId/received",[ref("returnId","Return reference")]);
add("admin","Orders & returns","return-inspect","Record quality inspection","POST","/api/admin/returns/:returnId/inspection",[ref("returnId","Return reference"),decision,field("conditionStatus","Item condition"),notes]);
add("admin","Finance","finance","Balance, settlements & payouts","GET","/api/admin/finance");
add("admin","Finance","payout","Request available payout","POST","/api/admin/payouts",[],{description:"Requests the eligible balance calculated by the backend. This does not transfer money."});
for(const [key,label,suffix] of [["shipment","Create shipment","shipments"],["awb","Assign courier tracking number","awb"],["pickup","Request courier pickup","pickup"]]) add("admin","Shipping",key,label,"POST",key==='shipment'?"/api/admin/orders/:orderId/shipments":`/api/admin/shipments/:shipmentId/${suffix}`,key==='shipment'?[ref("orderId","Order reference"),...['weightKg','lengthCm','breadthCm','heightCm'].map(name=>field(name,name,{kind:"number",min:0.001,step:"any"}))]:[ref("shipmentId","Shipment reference")],{blocked:shippingGate});
add("super-admin","Shipping","provider-pickups","Provider pickup locations","GET","/api/admin/shipping/provider-pickups");
add("super-admin","Shipping","serviceability","Check courier serviceability","GET","/api/admin/shipping/serviceability",[field("pickupPostcode","Pickup postal code"),field("deliveryPostcode","Delivery postal code"),field("weightKg","Weight in kilograms",{kind:"number",min:0.001,step:"any"})]);
add("admin","Account lifecycle","lifecycle","Account lifecycle","GET","/api/admin/account/lifecycle");
add("admin","Account lifecycle","delete-request","Request account deletion","POST","/api/admin/account/deletion-requests",[reason],{description:"Begins a reviewed deletion request; it does not immediately delete your account."});
add("admin","Account lifecycle","delete-verify","Verify deletion request","POST","/api/admin/account/deletion-requests/:requestId/verify",[ref("requestId","Deletion request reference"),field("password","Your password",{kind:"password"})]);
add("admin","Account lifecycle","recover","Request account recovery","POST","/api/admin/account/recovery-requests",[reason,field("password","Your password",{kind:"password"})]);

add("super-admin","Sellers","admins","Browse seller accounts","GET","/api/super-admin/admins",pagination);
add("super-admin","Sellers","review-admin","Inspect seller application","GET","/api/admin/review/:adminId",[ref("adminId","Seller reference")]);
add("super-admin","Sellers","decide-admin","Decide seller application","POST","/api/admin/review/:adminId/decision",[ref("adminId","Seller reference"),{...decision,options:["APPROVED","CHANGES_REQUIRED","REJECTED"]},notes]);
add("super-admin","Sellers","invite","Invite a seller","POST","/api/admin/review/invite",[field("name","Seller name"),field("email","Seller email")],{blocked:"Seller invitation delivery is paused until the sender domain and production setup URL are verified."});
add("super-admin","Sellers","reinvite","Resend seller invitation","POST","/api/admin/review/reinvite",[field("email","Seller email")],{blocked:"Invitation delivery requires verified email configuration."});
add("super-admin","Sellers","review-document","Download verification document","GET","/api/admin/review/:adminId/documents/:documentId",[ref("adminId","Seller reference"),ref("documentId","Document reference")],{download:true});
add("super-admin","Sellers","correct-kyc","Correct seller details","PATCH","/api/admin/review/:adminId/kyc",[ref("adminId","Seller reference"),field("legalName","Legal name",{optional:true}),field("businessType","Business type",{optional:true}),field("contactPhone","Contact phone",{optional:true}),reason]);
add("super-admin","Sellers","correct-address","Correct seller address","PUT","/api/admin/review/:adminId/addresses/:type",[ref("adminId","Seller reference"),addressType,...address]);
add("super-admin","Sellers","seller-status","Suspend or recover a seller","POST","/api/admin/review/:adminId/status",[ref("adminId","Seller reference"),field("action","Status action",{options:["SUSPEND","RECOVER"]}),reason]);
add("super-admin","Sellers","assign-category","Change category assignment","PUT","/api/admin/review/:adminId/categories/:categoryId",[ref("adminId","Seller reference"),ref("categoryId","Category reference"),field("active","Active assignment",{kind:"boolean"}),reason]);
add("super-admin","Catalog","public-categories","Published categories","GET","/api/categories");
add("super-admin","Catalog","create-category","Create a category","POST","/api/admin/catalog/categories",categoryFields);
add("super-admin","Catalog","create-subcategory","Create a subcategory","POST","/api/admin/catalog/subcategories",[ref("categoryId","Category reference"),...categoryFields]);
for(const [entity,param] of [["categories","categoryId"],["subcategories","subcategoryId"],["products","productId"]]) add("super-admin","Catalog",`publish-${entity}`,`Change ${entity} publication`,"PATCH",`/api/admin/catalog/${entity}/:${param}/status`,[ref(param),status]);
add("super-admin","Catalog","featured","Change product featuring","PATCH","/api/admin/catalog/products/:productId/featured",[ref("productId","Product reference"),field("featured","Feature this product",{kind:"boolean"})]);
add("super-admin","Catalog","fields","Configure category product field","PUT","/api/admin/catalog/fields",[ref("categoryId","Category reference"),field("key","Attribute key"),field("label","Field label"),field("inputType","Input type",{options:["TEXT","NUMBER","SELECT","BOOLEAN"]}),field("required","Required field",{kind:"boolean"}),field("options","Select choices (one per line)",{kind:"list",optional:true})]);
add("super-admin","Reviews & refunds","pending-reviews","Reviews awaiting moderation","GET","/api/super-admin/reviews/pending");
add("super-admin","Reviews & refunds","moderate","Moderate a review","POST","/api/super-admin/reviews/:reviewId/moderate",[ref("reviewId","Review reference"),field("decision","Decision",{options:["PUBLISHED","REJECTED"]}),notes]);
add("super-admin","Reviews & refunds","inspect-return","Inspect a return","GET","/api/admin/returns/:returnId",[ref("returnId","Return reference")]);
add("super-admin","Reviews & refunds","authorize-refund","Authorize inspected refund","POST","/api/super-admin/returns/:returnId/refund/authorize",[ref("returnId","Return reference")],{description:"Authorizes an eligible refund after approved quality inspection. This does not submit a provider transfer."});
add("super-admin","Reviews & refunds","submit-refund","Submit refund to payment provider","POST","/api/super-admin/returns/:returnId/refund/submit",[ref("returnId","Return reference")],{blocked:"Cashfree sandbox authentication and refund verification must pass before provider refunds are enabled."});
add("super-admin","Finance","settings","Commission & gateway fee settings","GET","/api/super-admin/finance-settings");
for(const [key,label] of [["commission","Commission"],["payment-gateway-fee","Payment gateway fee"]]) add("super-admin","Finance",key,`Set ${label.toLowerCase()}`,"PUT",`/api/super-admin/finance-settings/${key}`,[field("basisPoints",`${label} in basis points (100 = 1%)`,{kind:"number",min:0,max:10000})]);
add("super-admin","Finance","settlement","Create eligible settlement","POST","/api/super-admin/settlements",[ref("orderItemId","Order item reference"),field("refundAdjustment","Refund adjustment in INR",{optional:true})]);
add("super-admin","Finance","payout-decision","Approve or decline payout","POST","/api/super-admin/payouts/:payoutId/decision",[ref("payoutId","Payout reference"),decision,notes]);
add("super-admin","Finance","payout-paid","Record completed external payout","POST","/api/super-admin/payouts/:payoutId/paid",[ref("payoutId","Payout reference"),field("paymentReference","External payment reference")],{description:"Record only a transfer that has already completed outside Ownline. This control does not transfer money."});
add("super-admin","Reconciliation","reconciliation","Unresolved reconciliation items","GET","/api/super-admin/reconciliation",[field("domain","Domain",{options:["PAYMENT","REFUND","FINANCE"],optional:true}),field("after_id","Continue after reference",{optional:true}),field("limit","Rows per page",{kind:"number",min:1,max:100,optional:true})]);
add("super-admin","Reconciliation","reconciliation-detail","Inspect reconciliation item","GET","/api/super-admin/reconciliation/:id",[ref("id","Reconciliation reference")]);
for(const action of ["resolve","escalate"]) add("super-admin","Reconciliation",action,`${action === "resolve" ? "Resolve" : "Escalate"} reconciliation item`,"POST",`/api/super-admin/reconciliation/:id/${action}`,[ref("id","Reconciliation reference"),field("note","Evidence and notes",{kind:"textarea"})]);
add("super-admin","Shipping","shipping-provider","Enable or disable Shiprocket","PUT","/api/admin/shipping/providers/shiprocket",[field("enabled","Provider enabled",{kind:"boolean"})],{blocked:"Provider activation requires verified Shiprocket credentials and webhook setup."});
add("super-admin","Shipping","pickup-location","Map seller pickup location","PUT","/api/admin/shipping/pickup-locations",[ref("adminId","Seller reference"),ref("adminAddressId","Shipping-origin address reference"),field("providerLocationRef","Provider location reference"),field("locationName","Location name")]);
add("super-admin","Shipping","shipping-operations","Inspect shipping operations","GET","/api/super-admin/shipping/operations",[field("after","Continue after reference",{optional:true})]);
add("super-admin","Shipping","shipping-reconcile","Reconcile shipping records","POST","/api/super-admin/shipping/reconcile");
add("super-admin","Shipping","shipping-retry","Retry shipping reconciliation","POST","/api/super-admin/shipping/operations/:id/retry",[ref("id","Shipping operation reference")]);
add("super-admin","Shipping","shipping-evidence","Record verified shipping evidence","POST","/api/super-admin/shipping/operations/:id/evidence",[ref("id","Shipping operation reference"),field("providerReference","Verified provider reference"),field("evidence","Evidence (one key=value per line)",{kind:"attributes"})]);
add("super-admin","Account lifecycle","seller-lifecycle","Inspect seller lifecycle","GET","/api/admin/review/:adminId/lifecycle",[ref("adminId","Seller reference")]);
add("super-admin","Account lifecycle","deletion-decision","Decide deletion request","POST","/api/admin/review/:adminId/deletion-requests/:requestId/decision",[ref("adminId","Seller reference"),ref("requestId","Request reference"),decision,reason]);
add("super-admin","Account lifecycle","recovery-decision","Decide recovery request","POST","/api/admin/review/:adminId/recovery-requests/:requestId/decision",[ref("adminId","Seller reference"),ref("requestId","Request reference"),decision,reason,field("kycSubmissionId","Reviewed KYC submission reference",{optional:true}),field("kycRevision","Reviewed KYC revision",{optional:true}),field("categoryIds","Approved category references (one per line)",{kind:"list",optional:true})],{description:"Approval requires the reviewed KYC submission, revision and approved categories. The backend validates all recovery prerequisites."});

export const operatorWorkflows = rows;

export function buildWorkflowRequest(workflow: OperatorWorkflow, form: FormData) {
  let path = workflow.path;
  const payload: Record<string, unknown> = {};
  const multipart = new FormData();
  const query = new URLSearchParams();
  const isMultipart = workflow.fields.some(f => f.kind === "file");
  for (const field of workflow.fields) {
    const raw = form.get(field.name);
    const text = typeof raw === "string" ? raw.trim() : "";
    if (field.optional && !text) continue;
    if (path.includes(`:${field.name}`)) { path = path.replace(`:${field.name}`, id(text)); continue; }
    if (workflow.method === "GET") { if(text) query.set(field.name,text); continue; }
    if (isMultipart) { if(raw !== null) multipart.set(field.name,raw); continue; }
    let value: unknown = text;
    if (field.kind === "number") { value = Number(text); if(!Number.isFinite(value)) throw new Error(`${field.label} must be a number`); }
    if (field.kind === "boolean") value = text === "true";
    if (field.kind === "list") value = text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
    if (field.kind === "attributes") {
      const pairs = text.split(/\r?\n/).filter(s=>s.trim()).map(line=>{
        const separator = line.indexOf("=");
        if(separator < 1) throw new Error(`${field.label}: use key=value on each line`);
        const key=line.slice(0,separator).trim(); const value=line.slice(separator+1).trim();
        if (["__proto__","constructor","prototype"].includes(key)) throw new Error("Invalid attribute name");
        let parsed: unknown = value;
        try { parsed = JSON.parse(value); } catch { /* Unquoted words are text values. */ }
        if(parsed === null || typeof parsed === "object") throw new Error("Attribute values must be text, numbers or true/false");
        return [key, parsed];
      });
      value = Object.fromEntries(pairs);
    }
    payload[field.name] = value;
  }
  if (query.size) path += `?${query}`;
  if(workflow.key === "create-product" && payload.attributes === undefined) payload.attributes = {};
  return {path, init: {method:workflow.method, ...(workflow.method === "GET" ? {} : {body:isMultipart ? multipart : json(payload)})}};
}

export async function runOperatorWorkflow(workflow: OperatorWorkflow, form: FormData) {
  if (workflow.blocked) throw new Error(workflow.blocked);
  const {path,init} = buildWorkflowRequest(workflow,form);
  if (workflow.download) {
    const origin=process.env.NEXT_PUBLIC_API_URL;
    if(!origin) throw new Error("Document download is unavailable");
    const response=await fetch(new URL(path,origin),{credentials:"include",cache:"no-store"});
    if(!response.ok) throw new Error("Document unavailable or access denied");
    const url=URL.createObjectURL(await response.blob());
    const link=document.createElement("a"); link.href=url; link.download="seller-verification-document"; link.click();
    window.setTimeout(()=>URL.revokeObjectURL(url),1000);
    return {status:"Document downloaded"};
  }
  return api<unknown>(path,init);
}
