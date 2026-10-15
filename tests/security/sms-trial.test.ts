import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHmac } from 'node:crypto';
import { advanceStatus, assertSmsActor, nextBusinessDay, normalizePhone, smsConfig, verifyTwilioSignature, type SmsConfig } from '../../src/lib/sms-trial/domain';
import { sendTrialSample } from '../../src/lib/sms-trial/provider';
import type { CrmActor } from '../../src/lib/security/access-policy';
import { canUseCrmApi } from '../../src/lib/security/access-policy';
const config: SmsConfig = { orgId:'org', employeeId:'tech', recipient:'+14175550100', accountSid:`AC${'a'.repeat(32)}`, authToken:'test-secret', callbackOrigin:'https://example.test', enabled:true };
const actor: CrmActor = { orgId:'org', employeeId:'tech', clerkUserId:'clerk', email:'tech@example.test', name:'Tech', role:'technician' };
test('trial permissions deny other tenants, unrelated employees and office roles', () => {
  assert.doesNotThrow(() => assertSmsActor(actor,config));
  assert.doesNotThrow(() => assertSmsActor({...actor,role:'owner'},config,true));
  for(const other of [{...actor,orgId:'other'}, {...actor,employeeId:'other'}, {...actor,role:'dispatcher' as const}, {...actor,role:'read_only' as const}]) assert.throws(() => assertSmsActor(other,config));
  assert.throws(() => assertSmsActor(actor,config,true));
  assert.equal(canUseCrmApi(actor,'/api/sms-trial','POST'),false);
  assert.equal(canUseCrmApi(actor,'/api/sms-trial/send','POST'),true);
  assert.equal(canUseCrmApi({...actor,role:'dispatcher'},'/api/sms-trial/send','POST'),false);
});
test('configuration fails closed, phone normalization and Chicago dates respect weekends', () => {
  assert.equal(smsConfig({}),null);
  assert.equal(normalizePhone('(417) 555-0100'),'+14175550100');
  assert.equal(normalizePhone('555-0100'),'');
  assert.equal(nextBusinessDay(new Date('2026-10-15T19:00:00Z')),'2026-10-16');
  assert.equal(nextBusinessDay(new Date('2026-10-17T01:00:00Z')),'2026-10-19');
});
test('signed callbacks reject tampered payloads and URLs', () => {
  const params=new URLSearchParams({AccountSid:config.accountSid,MessageStatus:'delivered'});
  const url='https://example.test/api/sms-trial/status?messageId=one';
  const signature=createHmac('sha1',config.authToken).update(url+'AccountSid'+config.accountSid+'MessageStatusdelivered').digest('base64');
  assert.equal(verifyTwilioSignature(config.authToken,url,params,signature),true);
  assert.equal(verifyTwilioSignature(config.authToken,url+'x',params,signature),false);
  params.set('MessageStatus','sent');
  assert.equal(verifyTwilioSignature(config.authToken,url,params,signature),false);
  assert.equal(verifyTwilioSignature(config.authToken,url,params,''),false);
});
test('delivered callbacks cannot regress when responses arrive out of order', () => {
  assert.equal(advanceStatus('delivered','accepted'),'delivered');
  assert.equal(advanceStatus('failed','queued'),'failed');
  assert.equal(advanceStatus('unknown','delivered'),'delivered');
  assert.equal(advanceStatus('sent','bogus'),'sent');
});
test('provider sends only configured recipient and sample; queued is not delivered', async () => {
  const calls: RequestInit[]=[];
  const fetcher=async (_url: string | URL | Request, init?: RequestInit) => {
    calls.push(init!);
    return Response.json(calls.length===1?{type:'Trial',status:'active'}:{sid:`SM${'b'.repeat(32)}`,account_sid:config.accountSid,to:config.recipient,status:'queued'});
  };
  const result=await sendTrialSample(config,{id:'one',template:'sms_appointment_reminders'},fetcher);
  assert.equal(result.status,'accepted');
  const form=calls[1].body as URLSearchParams;
  assert.equal(form.get('To'),config.recipient);
  assert.equal(form.get('Body'),'sms_appointment_reminders');
  assert.equal(form.has('From'),false);
  assert.equal(form.has('MediaUrl'),false);
});
test('trial-only guard, provider rejection and uncertain sends never leak credentials', async () => {
  let calls=0;
  const paid=await sendTrialSample(config,{id:'one',template:'sms_delivery_updates'},async()=>{calls++;return Response.json({type:'Full',status:'active'});});
  assert.equal(calls,1);assert.equal(paid.status,'failed');
  calls=0;
  const rejected=await sendTrialSample(config,{id:'one',template:'sms_delivery_updates'},async()=> ++calls===1?Response.json({type:'Trial',status:'active'}):Response.json({code:21608,message:'private details'},{status:400}));
  assert.equal(rejected.errorCode,'21608');assert.equal(rejected.status,'failed');
  const timeout=await sendTrialSample(config,{id:'one',template:'sms_delivery_updates'},async()=>{throw new Error(config.authToken);});
  assert.equal(timeout.status,'unknown');assert.ok(!JSON.stringify(timeout).includes(config.authToken));
});
