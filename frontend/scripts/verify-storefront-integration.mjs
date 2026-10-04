// Isolated UI/transport verification. API fixtures never reach a database or provider.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
const require=createRequire(import.meta.url);
const {chromium}=require(join(process.env.LOCALAPPDATA,'ms-playwright-go/1.57.0/package/index.js'));
const origin=process.env.STOREFRONT_URL ?? 'http://127.0.0.1:3002';
const output=resolve('../../.impeccable/review/integration');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const evidence=[];
const orderId='00000000-0000-4000-8000-000000000001';
const returnId='00000000-0000-4000-8000-000000000003';
const item={id:'item-fixture',productId:'fixture-0',productNameSnapshot:'Fixture shirt',variantTitleSnapshot:null,quantity:2,unitPrice:'500.00',totalAmount:'1000.00'};
const address={contactName:'Fixture shopper',line1:'Fixture address',line2:null,city:'Fixture city',state:'Fixture state',postalCode:'600001',country:'IN',phone:'9000000000'};
const order={id:orderId,orderNumber:'TEST-ORDER',status:'DELIVERED',paymentStatus:'PAID',createdAt:'2026-10-04T00:00:00Z',deliveredAt:'2026-10-04T00:00:00Z',currency:'INR',subtotal:'1000.00',shippingAmount:'0.00',discountAmount:'0.00',totalAmount:'1000.00',shippingAddressSnapshot:address,items:[item]};
async function mockContext(role,width,height) {
  const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});
  const calls=[];
  let approved=false;
  await context.route('**/api/**',async route=>{
    const request=route.request(); const url=new URL(request.url());const path=url.pathname;
    const isMutation=request.method()!=='GET';
    if(isMutation) calls.push({path,method:request.method(),body:request.postDataJSON()});
    const json=(value,status=200)=>route.fulfill({status,contentType:'application/json',headers:{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Credentials':'true'},body:JSON.stringify(value)});
    if(path==='/api/auth/get-session') return json({session:{id:'fixture-session',userId:'fixture-user',expiresAt:'2099-01-01T00:00:00Z'},user:{id:'fixture-user',name:'Fixture shopper',email:'fixture@example.invalid',emailVerified:true}});
    if(path==='/api/me') return json({userId:'fixture-user',roles:[role],permissions:[],adminApproved:true});
    if(path.endsWith('/summary')) return json(path.includes('super-admin')?{admins:{active:1,pending:0,total:1},catalog:{publishedProducts:1},orders:{total:1},finance:{grossSettledSales:'1000.00',pendingPayoutRequests:0},onboarding:{pendingKycApplications:0}}:{products:{total:1},orders:{total:1,confirmedPaid:1},finance:{availableBalance:'1000.00',grossSettledSales:'1000.00',pendingPayoutRequests:0}});
    if(path==='/api/admin/products') return json({products:[],limit:5,offset:0});
    if(path==='/api/super-admin/admins') return json({admins:[],limit:5,offset:0});
    if(path==='/api/orders') return json({orders:[order,{...order,id:'00000000-0000-4000-8000-000000000002',orderNumber:'TEST-UNPAID',status:'CREATED',paymentStatus:'PENDING'}]});
    if(path.endsWith('/cancel')) return json({orderId:path.split('/')[3],status:'CANCELLED',paymentStatus:'PENDING'});
    if(path==='/api/reviews') return json({status:'PENDING'},201);
    if(path==='/api/returns') return json({id:returnId,status:'REQUESTED'},201);
    if(path.startsWith('/api/returns/')) return json({id:returnId,orderId,status:approved?'APPROVED':'REQUESTED',returnAddress:approved?{line1:'Approved return address'}:null,grossRefundAmount:null,deductionAmount:null,netRefundAmount:null,refund:null});
    if(path==='/api/customer/cart') return json({items:[],subtotal:'0.00'});
    if(path==='/api/customer/wishlist') return json({products:[]});
    if(path==='/api/customer/addresses') return json({addresses:[]});
    if(isMutation) return json({status:'COMPLETED',version:2});
    return route.continue();
  });
  return {context,calls,approve:()=>{approved=true;}};
}
try {
  for(const [width,height,device] of [[1440,900,'desktop'],[390,844,'mobile'],[768,1024,'tablet']]) {
    const {context}=await mockContext('CUSTOMER',width,height);
    const page=await context.newPage();const runtimeErrors=[];page.on('pageerror',error=>runtimeErrors.push(error.message));
    for(const route of ['/','/search','/clothing','/categories/dress','/products/fixture-0','/wishlist','/cart','/checkout','/account','/account/addresses','/orders','/returns']) {
      await page.goto(origin+route,{waitUntil:'networkidle'});
      assert.ok(await page.locator('h1').count(),`${route} missing heading: ${(await page.locator('body').innerText()).slice(0,500)}`);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${route} overflow at ${width}`);
      assert.equal(await page.locator('footer nav a').count(),9);
      if(device!=='tablet'&&['/search','/account','/orders'].includes(route)) await page.screenshot({path:join(output,`${route.slice(1)}-${device}.png`)});
      if(route==='/') { await page.locator('footer').scrollIntoViewIfNeeded(); if(device!=='tablet') await page.screenshot({path:join(output,`footer-${device}.png`)}); }
      evidence.push({route,device,result:'PASS'});
    }
    assert.deepEqual(runtimeErrors,[],'Customer runtime errors');
    await context.close();
  }
  const customer=await mockContext('CUSTOMER',1440,900);const page=await customer.context.newPage();
  await page.goto(origin+'/orders',{waitUntil:'networkidle'});
  await page.getByText('Order details',{exact:true}).first().click();
  await page.getByRole('button',{name:'Write a review',exact:true}).click();
  await page.locator('input[name=title]').fill('A considered piece');await page.locator('textarea[name=body]').fill('Fixture review, not business data.');
  await page.getByRole('button',{name:'Submit review',exact:true}).click();
  await page.getByText('Thank you. Your review has been submitted for moderation.').waitFor();
  await page.getByRole('button',{name:'Request a return',exact:true}).click();await page.locator('textarea[name=reason]').fill('Fixture wrong-item reason');await page.getByRole('button',{name:'Submit return request',exact:true}).click();
  await page.getByRole('link',{name:`View return ${returnId}`,exact:true}).waitFor();
  await page.getByRole('button',{name:'Cancel unpaid order',exact:true}).click();
  assert.equal(customer.calls.filter(call=>call.path.endsWith('/cancel')).length,0,'Cancellation waits for confirmation');
  await page.getByRole('button',{name:'Confirm cancellation',exact:true}).click();
  await page.getByRole('button',{name:'Cancel unpaid order',exact:true}).waitFor({state:'hidden'});
  await page.getByRole('link',{name:`View return ${returnId}`,exact:true}).click();
  await page.getByRole('button',{name:'Check return status',exact:true}).click();await page.getByText('The return address appears after approval.').waitFor();
  assert.equal(await page.getByText('Approved return address',{exact:true}).count(),0);
  customer.approve();await page.getByRole('button',{name:'Check return status',exact:true}).click();await page.getByRole('heading',{name:'Approved return address'}).waitFor();
  assert.deepEqual(customer.calls.find(call=>call.path==='/api/reviews').body,{orderItemId:'item-fixture',rating:5,title:'A considered piece',body:'Fixture review, not business data.'});
  assert.equal(customer.calls.find(call=>call.path==='/api/returns').body.quantity,1);
  assert.ok(!customer.calls.some(call=>call.path==='/api/checkout'||call.path.includes('payment-session')));
  evidence.push({customerMutations:'PASS',returnAddressDisclosure:'PASS'});await customer.context.close();
  for(const [role,path] of [['ADMIN','/admin'],['SUPER_ADMIN','/super-admin']]) {
    for(const [width,height,device] of [[1440,900,'desktop'],[390,844,'mobile']]) {
      const operator=await mockContext(role,width,height);const page=await operator.context.newPage();
      await page.goto(origin+path,{waitUntil:'networkidle'});await page.getByRole('group',{name:'Workspace sections'}).waitFor();
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.locator('#operations').scrollIntoViewIfNeeded();await page.screenshot({path:join(output,`${path.slice(1)}-${device}.png`)});
      const group=role==='ADMIN'?'Catalog':'Reviews & refunds';const task=role==='ADMIN'?'Set available inventory':'Moderate a review';
      await page.getByRole('group',{name:'Workspace sections'}).getByRole('button',{name:group,exact:true}).click();
      await page.getByRole('navigation',{name:`${group} tasks`}).getByRole('button',{name:task,exact:true}).click();
      if(role==='ADMIN') {await page.locator('input[name=productId]').fill('fixture-product');await page.locator('input[name=quantity]').fill('5');await page.locator('input[name=expectedVersion]').fill('1');}
      else {await page.locator('input[name=reviewId]').fill('fixture-review');await page.locator('select[name=decision]').selectOption('PUBLISHED');await page.locator('textarea[name=notes]').fill('Reviewed fixture');}
      await page.getByRole('button',{name:'Review changes',exact:true}).click();assert.equal(operator.calls.length,0,'Operator writes require review');
      await page.getByRole('button',{name:'Confirm changes',exact:true}).click();await page.getByRole('heading',{name:'Operation completed',exact:true}).waitFor();
      assert.equal(operator.calls.length,1);
      if(role==='ADMIN') assert.deepEqual(operator.calls[0].body,{quantity:5,expectedVersion:1});
      await page.getByRole('group',{name:'Workspace sections'}).getByRole('button',{name:role==='ADMIN'?'Shipping':'Reviews & refunds',exact:true}).click();
      await page.getByRole('navigation',{name:role==='ADMIN'?'Shipping tasks':'Reviews & refunds tasks'}).getByRole('button',{name:role==='ADMIN'?'Create shipment':'Submit refund to payment provider',exact:true}).click();
      assert.equal(await page.getByRole('button',{name:'Review changes',exact:true}).count(),0,'Provider gate has no submitting control');
      evidence.push({role,device,transport:'PASS',reviewStep:'PASS',providerGate:'PASS'});await operator.context.close();
    }
  }
  const forbidden=await mockContext('CUSTOMER',390,844);const forbiddenPage=await forbidden.context.newPage();await forbiddenPage.goto(origin+'/super-admin',{waitUntil:'networkidle'});assert.equal(await forbiddenPage.getByRole('group',{name:'Workspace sections'}).count(),0);await forbidden.context.close();
  await writeFile(join(output,'checks.json'),JSON.stringify({result:'PASS',evidence,limits:'Mock API transport and UI checks; no live authenticated mutations or provider calls.'},null,2));
  console.log(JSON.stringify({result:'PASS',checks:evidence.length,evidence:output},null,2));
} finally {await browser.close();}
