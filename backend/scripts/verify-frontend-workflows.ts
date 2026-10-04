// Read-only contract audit: registered routes and request serialization, no DB/provider calls.
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { app } from "../src/index";
import { operatorWorkflows, buildWorkflowRequest } from "../../frontend/src/lib/api/operator-workflows";
const normalize=(path:string)=>path.split("?")[0].replace(/:[^/]+/g,":id");
const routes=new Map(app.routes.filter(route=>route.method!=="ALL").map(route=>[`${route.method} ${normalize(route.path)}`,{method:route.method,path:route.path}]));
const workflowKeys=new Set<string>();
for(const workflow of operatorWorkflows) {
  const key=`${workflow.role}:${workflow.key}`;
  assert.ok(!workflowKeys.has(key),`Duplicate workflow ${key}`); workflowKeys.add(key);
  assert.ok(routes.has(`${workflow.method} ${normalize(workflow.path)}`),`Unregistered workflow ${key}: ${workflow.path}`);
  const form=new FormData();
  for(const field of workflow.fields) {
    if(field.optional) continue;
    form.set(field.name,field.kind==='file'?new File(['fixture'],'fixture.png',{type:'image/png'}):field.options?.[0]??(field.kind==='number'||field.kind==='decimal'?'1':field.kind==='boolean'?'false':field.kind==='attributes'?'color=cream':'fixture-reference'));
  }
  const request=buildWorkflowRequest(workflow,form);
  assert.ok(!/:[a-z]/i.test(request.path),`Unresolved path ${key}`);
  if(workflow.method==='GET') assert.equal(request.init.body,undefined);
}
function payload(key:string,entries:Record<string,string>) {
  const workflow=operatorWorkflows.find(workflow=>workflow.key===key)!;
  const form=new FormData(); Object.entries(entries).forEach(([name,value])=>form.set(name,value));
  return JSON.parse(buildWorkflowRequest(workflow,form).init.body as string);
}
assert.deepEqual(payload('inventory',{productId:'one',quantity:'5',expectedVersion:'2'}),{quantity:5,expectedVersion:2});
assert.deepEqual(payload('return-decision',{returnId:'one',approve:'false',notes:'declined'}),{approve:false,notes:'declined'});
assert.equal(payload('create-product',{categoryId:'c',subcategoryId:'s',name:'Dress',slug:'dress',price:'100.00',returnEnabled:'false',weightKg:'1.250'}).weightKg,'1.250');
assert.deepEqual(payload('create-product',{categoryId:'c',subcategoryId:'s',name:'Dress',slug:'dress',price:'100.00',returnEnabled:'false'}).attributes,{});
assert.deepEqual(payload('edit-product',{productId:'p',attributes:'size="42"\nweight=1.5\nactive=false'}).attributes,{size:'42',weight:1.5,active:false});
const customerRoutes=[['GET','/api/categories'],['GET','/api/products'],['GET','/api/products/:slug'],['GET','/api/products/:id/reviews'],['GET','/api/customer/cart'],['PUT','/api/customer/cart/items/:id'],['DELETE','/api/customer/cart/items/:id'],['GET','/api/customer/wishlist'],['PUT','/api/customer/wishlist/:id'],['GET','/api/customer/addresses'],['POST','/api/customer/addresses'],['PUT','/api/customer/addresses/:id'],['DELETE','/api/customer/addresses/:id'],['GET','/api/customer/checkout/quote'],['GET','/api/orders'],['GET','/api/orders/:id'],['GET','/api/orders/:id/tracking'],['POST','/api/orders/:id/cancel'],['POST','/api/reviews'],['POST','/api/returns'],['GET','/api/returns/:id'],['GET','/api/me'],['POST','/api/admin/activate']];
const connected=new Set([...operatorWorkflows.filter(workflow=>!workflow.blocked).map(workflow=>`${workflow.method} ${normalize(workflow.path)}`),...customerRoutes.map(([method,path])=>`${method} ${normalize(path)}`),'GET /api/admin/summary','GET /api/super-admin/summary']);
const gated=new Set([...operatorWorkflows.filter(workflow=>workflow.blocked).map(workflow=>`${workflow.method} ${normalize(workflow.path)}`),'POST /api/checkout','POST /api/orders/:id/payment-session']);
const inventory=[...routes.values()].map(route=>({...route,status:connected.has(`${route.method} ${normalize(route.path)}`)?'UI_CONNECTED':gated.has(`${route.method} ${normalize(route.path)}`)?'GATED':route.path==='/api/admin/review/provision'?'RETIRED':route.path.startsWith('/webhooks/')?'SERVER_TO_SERVER':route.path.startsWith('/health')?'DIAGNOSTIC':route.path.startsWith('/api/images/')?'MEDIA':'NO_ACTIVE_UI'}));
const result={date:'2026-10-04',checks:'PASS',operatorForms:operatorWorkflows.length,activeOperatorForms:operatorWorkflows.filter(workflow=>!workflow.blocked).length,gatedOperatorForms:operatorWorkflows.filter(workflow=>workflow.blocked).length,routeCoverage:inventory,limits:'Read-only source/serialization audit. Does not prove authenticated backend mutations or provider readiness.'};
void writeFile('../docs/verification/FRONTEND_CONNECTION_AUDIT.json',JSON.stringify(result,null,2)).then(()=>console.log(JSON.stringify({...result,routeCoverage:inventory.filter(route=>route.status==='NO_ACTIVE_UI')},null,2))).catch(error=>{console.error(error.message);process.exitCode=1;});
