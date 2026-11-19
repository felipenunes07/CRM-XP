import express from "express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
vi.mock('../whatsapp/evolutionService.js',()=>({sendWhatsappInstanceTextMessage:vi.fn().mockResolvedValue({key:{id:'provider-test-message'}})}));
vi.mock('../whatsapp/uazapiService.js',()=>({sendUazapiTextMessage:vi.fn().mockResolvedValue({messageid:'uazapi-test-message'})}));

vi.mock("../../db/client.js", async () => {
  const { Pool } = await import("pg");
  const connectionString = process.env.RETURN_WORKFLOW_TEST_DATABASE_URL;
  if (connectionString) {
    const url = new URL(connectionString);
    if (!["localhost","127.0.0.1"].includes(url.hostname) || url.pathname !== "/crm_returns_test") throw Error("Use only the isolated local crm_returns_test database");
  }
  return { pool: new Pool({ connectionString: connectionString ?? "postgres://unused@127.0.0.1:1/unused", options: "-c search_path=returns_workflow_test" }) };
});

import { pool } from "../../db/client.js";
import { returnWorkflowMigration } from "../../db/returnWorkflowMigration.js";
import { returnExecutionMigration } from "../../db/returnExecutionMigration.js";
import {returnFactoryMigration} from '../../db/returnFactoryMigration.js';
import {returnNativeMigration} from '../../db/returnNativeMigration.js';
import {sendWhatsappInstanceTextMessage} from '../whatsapp/evolutionService.js';
import { HttpError } from "../../lib/httpError.js";
import { returnRoutes } from "./returnRoutes.js";

const operatorId = "10000000-0000-4000-8000-000000000001";
const customerId = "20000000-0000-4000-8000-000000000001";
let grants = ["returns.view","returns.manage"];
const app = express();
app.use(express.json({ limit: "8mb" }));
app.use((req,_res,next) => {
  if (req.headers.authorization === "Bearer operator") req.user = { id: operatorId,name: "Isis",email: "isis@test.invalid",role: "MANAGER",appRole: "operacional",permissions: grants };
  if(req.headers.authorization==='Bearer technician')req.user={id:'10000000-0000-4000-8000-000000000002',name:'Técnico de teste',email:'tech@test.invalid',role:'SELLER',appRole:'viewer',permissions:['returns.view','returns.manage']};
  next();
});
app.use("/api/returns",returnRoutes);
app.use((error: unknown,_req: express.Request,res: express.Response,_next: express.NextFunction) => {
  res.status(error instanceof HttpError ? error.statusCode : error instanceof z.ZodError ? 400 : 500).json({ message: String(error) });
});
const post = (path: string,body: object) => request(app).post(`/api/returns${path}`).set("Authorization","Bearer operator").send(body);
const get = (path: string) => request(app).get(`/api/returns${path}`).set("Authorization","Bearer operator");
const receipt = (quantity = 5) => ({ requestId: crypto.randomUUID(),customerId,receivedAt:"2026-11-16T09:00:00-03:00",declaredQuantity:quantity,receivedQuantity:quantity,volumes:1,location:"Recebimento, caixa 12",notes:"" });
const item = (version: number,quantity = 5) => ({ version,model:"IP-11 LCD",sku:"CX156-1",quantity,frame:"S/A",color:"Preto",manufacturer:"XP",outcome:"approved",reason:"",testNotes:"Inspeção e teste de imagem realizados" });
async function start(quantity = 5) {
  const created = (await post("",receipt(quantity))).body;
  const assigned = (await request(app).patch(`/api/returns/${created.id}`).set("Authorization","Bearer operator").send({ version:created.version,assigneeId:operatorId,dueAt:"2026-11-17T15:00:00-03:00",nextAction:"Identificar e testar",location:"Bancada de triagem",receivedQuantity:quantity,correctionReason:"" })).body;
  const result = await post(`/${created.id}/actions`,{ version:assigned.version,action:"start_triage" });
  expect(result.status).toBe(200);
  return result.body;
}
async function finished(quantity=3,outcome='external_analysis'){
 let d=await start(quantity);d=(await post(`/${d.id}/items`,{...item(d.version,quantity),outcome,manufacturer:outcome==='external_analysis'?'VV':'XP',reason:'Conferência técnica'})).body;
 const result=await post(`/${d.id}/actions`,{version:d.version,action:'complete_triage'});expect(result.status).toBe(200);return result.body;
}
const execution=(d:any,operation:string,input:object={})=>post(`/${d.id}/execution/${operation}`,{requestId:crypto.randomUUID(),version:d.version,...input});
async function operate(d:any,operation:string,input:object={}){const r=await execution(d,operation,input);expect(r.status,r.body.message).toBe(200);return r.body;}
async function repair(d:any,grade='new',seal=''){
 const run=async(op:string,input:object)=>{const r=await post(`/${d.id}/native/${op}`,{requestId:crypto.randomUUID(),version:d.version,...input});expect(r.status,r.body.message).toBe(200);d=r.body;};
 await run('repair_assign',{dispositionId:d.execution.dispositions[0].id,assigneeId:operatorId,dueAt:'2026-12-10T12:00:00Z',notes:'Recuperação e teste técnico solicitados'});
 const job=(await get('/'+d.id+'/native')).body.repairs[0];await run('repair_complete',{jobId:job.id,jobVersion:job.version,grade,seal,testNotes:'Imagem e touch conferidos após recuperação'});return d;
}
const occurredAt='2026-11-17T12:00:00Z';
const batchInput=(cases:any[])=>({requestId:crypto.randomUUID(),manufacturer:'VV',lotReference:'VV-LOTE-'+crypto.randomUUID(),sentAt:occurredAt,dueAt:'2026-12-10T12:00:00Z',reference:'MAN-'+crypto.randomUUID(),carrier:'Transportadora / comprovante 123',fromLocation:'Recebimento XP',lines:cases.map(d=>({caseId:d.id,itemId:d.items[0].id,version:d.version,quantity:d.items[0].quantity}))});
async function dispatch(d:any){const r=await post('/factory-batches',batchInput([d]));expect(r.status,r.body.message).toBe(201);return (await get('/'+d.id)).body;}
const resultInput=(d:any,quantity:number,decision='approved',compensation='replacement')=>({lineId:d.execution.factoryLines.find((l:any)=>!l.voidedAt).id,quantity,decision,compensation,reason:'Laudo conferido',originalReport:'原始报告',translation:'Parecer traduzido e conferido',reference:crypto.randomUUID(),occurredAt,approvalReference:compensation==='none'&&decision==='approved'?'GESTAO-123':''});
const noticeInput={channel:'phone',recipient:'Cliente identificado',summary:'Resumo do resultado informado ao cliente',reference:'Atendimento confirmado',occurredAt};

describe.runIf(Boolean(process.env.RETURN_WORKFLOW_TEST_DATABASE_URL))("return workflow with real PostgreSQL",() => {
  beforeAll(async () => {
    await pool.query("CREATE SCHEMA IF NOT EXISTS returns_workflow_test");
    await pool.query(`CREATE TABLE profiles(id uuid PRIMARY KEY,email text,full_name text,role text,is_active boolean);
      CREATE TABLE customers(id uuid PRIMARY KEY,customer_code text,display_name text);
      CREATE TABLE user_permissions(user_id uuid,permission_key text,allowed boolean);
      CREATE TABLE permissions(key text PRIMARY KEY,name text,description text);
      CREATE TABLE role_permissions(role text,permission_key text,PRIMARY KEY(role,permission_key));
      CREATE TABLE whatsapp_instances(id uuid PRIMARY KEY,display_label text,phone_number text,status text,is_default boolean,assigned_user_id uuid,provider text,instance_name text,evolution_base_url text,evolution_api_key text,uazapi_base_url text,uazapi_token text);
      CREATE TABLE customer_credit_snapshots(id uuid PRIMARY KEY,is_active boolean);
      CREATE TABLE customer_credit_payment_entries(snapshot_id uuid,customer_id uuid,payment_key text,amount numeric,payment_number text,payment_type text);
      INSERT INTO profiles VALUES('${operatorId}','isis@test.invalid','Isis','operacional',true);
      INSERT INTO profiles VALUES('10000000-0000-4000-8000-000000000002','tech@test.invalid','Técnico de teste','viewer',true);
      INSERT INTO customers VALUES('${customerId}','CL-TESTE','Cliente de teste');`);
    await pool.query(returnWorkflowMigration);
    await pool.query(returnExecutionMigration);
    await pool.query(returnFactoryMigration);
    await pool.query(returnNativeMigration);
  });
  beforeEach(async () => {
    grants=["returns.view","returns.manage"];
    await pool.query("TRUNCATE return_attachments,return_events,return_items,return_cases,return_commands RESTART IDENTITY CASCADE");
    await pool.query("DELETE FROM user_permissions");
    await pool.query("INSERT INTO user_permissions VALUES('10000000-0000-4000-8000-000000000002','returns.view',true),('10000000-0000-4000-8000-000000000002','returns.manage',true)");
    await pool.query('TRUNCATE return_legacy_revisions,return_legacy_exclusions,return_legacy_links,customer_credit_payment_entries,customer_credit_snapshots,whatsapp_instances CASCADE');
    await pool.query("UPDATE return_transition_settings SET authority='parallel',last_error='',last_success_at=NULL,version=1");
    vi.mocked(sendWhatsappInstanceTextMessage).mockReset().mockResolvedValue({key:{id:'provider-test-message'}});
  });
  afterAll(async () => { await pool.query("DROP SCHEMA returns_workflow_test CASCADE");await pool.end(); });

  it("requires access for reads, writes and private attachments", async () => {
    expect((await request(app).get("/api/returns")).status).toBe(401);
    grants=[];expect((await get("")).status).toBe(403);
    grants=["returns.view"];expect((await post("",receipt())).status).toBe(403);
    grants=["returns.manage"];expect((await get(`/${crypto.randomUUID()}/attachments/${crypto.randomUUID()}`)).status).toBe(403);
  });
  it("creates unique protocols, preserves distinct shipments and safely retries one receipt",async () => {
    const payload=receipt();
    const [a,b]=await Promise.all([post("",payload),post("",payload)]);
    expect(a.status).toBe(201);expect(b.status).toBe(201);expect(a.body.id).toBe(b.body.id);
    const c=await post("",receipt());expect(c.body.protocol).not.toBe(a.body.protocol);
    expect((await get("?stage=all")).body.total).toBe(2);
    expect((await post("",{...payload,receivedQuantity:4})).status).toBe(409);
    expect(a.body.events).toHaveLength(1);
  });
  it("rejects invalid customer/date/count and client-controlled authorship",async () => {
    for(const invalid of [{receivedQuantity:0},{receivedQuantity:1.5},{customerId:crypto.randomUUID()},{receivedAt:"2099-01-01T00:00:00Z"},{receiverName:"Someone else"}]) {
      expect((await post("",{...receipt(),...invalid})).status).toBe(400);
    }
    expect((await get("")).body.total).toBe(0);
  });
  it("requires assignment and deadline, respects individual permission denial",async () => {
    const d=(await post("",receipt())).body;
    expect((await post(`/${d.id}/actions`,{version:d.version,action:"start_triage"})).status).toBe(400);
    await pool.query("INSERT INTO user_permissions VALUES($1,'returns.manage',false),($1,'returns.logistics',false),($1,'returns.finance',false)",[operatorId]);
    expect((await get("/lookups")).body.people.some((p:{id:string})=>p.id===operatorId)).toBe(false);
    const res=await request(app).patch(`/api/returns/${d.id}`).set("Authorization","Bearer operator").send({version:d.version,assigneeId:operatorId,dueAt:null,nextAction:"Testar",location:"Bancada",receivedQuantity:5,correctionReason:""});
    expect(res.status).toBe(400);
  });
  it("keeps quantities and pending reviews visible, completes only the triage phase",async () => {
    let d=await start();
    expect((await post(`/${d.id}/items`,item(d.version,6))).status).toBe(400);
    expect((await post(`/${d.id}/items`,{...item(d.version),outcome:"refused",reason:""})).status).toBe(400);
    expect((await post(`/${d.id}/items`,{...item(d.version),outcome:"external_analysis",manufacturer:""})).status).toBe(400);
    d=(await post(`/${d.id}/items`,{...item(d.version,3),outcome:"external_analysis"})).body;
    expect(d.pendingQuantity).toBe(2);
    expect((await post(`/${d.id}/actions`,{version:d.version,action:"complete_triage"})).status).toBe(400);
    d=(await post(`/${d.id}/items`,{...item(d.version,2),outcome:"review"})).body;
    expect(d.pendingQuantity).toBe(2);
    expect((await post(`/${d.id}/actions`,{version:d.version,action:"complete_triage"})).status).toBe(400);
    const review=d.items.find((i: any)=>i.outcome==="review");
    d=(await request(app).put(`/api/returns/${d.id}/items/${review.id}`).set("Authorization","Bearer operator").send({...item(d.version,2),outcome:"refused",reason:"Flex rasgado"})).body;
    d=(await post(`/${d.id}/actions`,{version:d.version,action:"complete_triage"})).body;
    expect(d.stage).toBe("triage_completed");expect(d.pendingQuantity).toBe(0);expect(d.items).toHaveLength(2);
    expect(d.nextAction).toContain("Isis");
    expect((await get("")).body.total).toBe(1);
    expect((await get("?stage=triage_completed")).body.total).toBe(1);
    expect((await post(`/${d.id}/items`,item(d.version))).status).toBe(409);
    expect((await post(`/${d.id}/actions`,{version:d.version,action:"reopen_triage"})).status).toBe(400);
    d=(await post(`/${d.id}/actions`,{version:d.version,action:"reopen_triage",reason:"Cliente enviou novo vídeo"})).body;
    expect(d.stage).toBe("triage");expect(d.events[0].data.reason).toBe("Cliente enviou novo vídeo");
  });
  it("rejects stale edits and serializes simultaneous item additions",async () => {
    const d=await start();
    const results=await Promise.all([post(`/${d.id}/items`,item(d.version,3)),post(`/${d.id}/items`,item(d.version,3))]);
    expect(results.map(r=>r.status).sort()).toEqual([200,409]);
    const current=(await get(`/${d.id}`)).body;
    expect(current.itemQuantity).toBe(3);expect(current.events.filter((e: any)=>e.action==="item_added")).toHaveLength(1);
  });
  it("audits corrected counts and never reduces a receipt below its registered items",async () => {
    let d=await start();d=(await post(`/${d.id}/items`,item(d.version,3))).body;
    const update={version:d.version,assigneeId:operatorId,dueAt:d.dueAt,nextAction:"Testar",location:"Bancada",receivedQuantity:4,correctionReason:""};
    expect((await request(app).patch(`/api/returns/${d.id}`).set("Authorization","Bearer operator").send(update)).status).toBe(400);
    const result=await request(app).patch(`/api/returns/${d.id}`).set("Authorization","Bearer operator").send({...update,correctionReason:"Recontagem conferida"});
    expect(result.status).toBe(200);expect(result.body.declaredQuantity).toBe(5);expect(result.body.receivedQuantity).toBe(4);
    expect(result.body.events[0].data.before.receivedQuantity).toBe(5);
    expect((await request(app).patch(`/api/returns/${d.id}`).set("Authorization","Bearer operator").send({...update,version:result.body.version,receivedQuantity:2,correctionReason:"Recontagem"})).status).toBe(400);
  });
  it("persists private evidence, rejects spoofed files and checks case ownership",async () => {
    let d=await start();
    expect((await post(`/${d.id}/attachments`,{version:d.version,name:"foto.jpg",contentType:"image/jpeg",contentBase64:Buffer.from("fake").toString("base64")})).status).toBe(400);
    const contentBase64=Buffer.from("%PDF-1.4\nTest evidence").toString("base64");
    d=(await post(`/${d.id}/attachments`,{version:d.version,name:"recebimento.pdf",contentType:"application/pdf",contentBase64})).body;
    expect(d.attachments).toHaveLength(1);expect(d.attachments[0].authorName).toBe("Isis");
    expect(JSON.stringify(d)).not.toContain(contentBase64);
    expect((await get(`/${d.id}/attachments/${d.attachments[0].id}`)).body.contentBase64).toBe(contentBase64);
    expect((await get(`/${crypto.randomUUID()}/attachments/${d.attachments[0].id}`)).status).toBe(404);
  });
  it("filters overdue and responsible cases, and removes items with audit history",async () => {
    let d=await start();d=(await post(`/${d.id}/items`,item(d.version,2))).body;
    expect((await get("?stage=overdue&mine=true")).body.total).toBe(1);
    expect((await get("?search=not-a-customer")).body.total).toBe(0);
    expect((await get(`?search=${d.protocol}`)).body.total).toBe(1);
    const res=await request(app).delete(`/api/returns/${d.id}/items/${d.items[0].id}`).set("Authorization","Bearer operator").send({version:d.version});
    expect(res.status).toBe(200);expect(res.body.pendingQuantity).toBe(5);expect(res.body.events[0].data.before.quantity).toBe(2);
  });

  it('dispatches a mixed two-customer manifest atomically, with retry and quantity protection',async()=>{
   grants.push('returns.logistics');let a=await finished(3),b=await finished(2);
   const otherCustomer='20000000-0000-4000-8000-000000000002';
   await pool.query("INSERT INTO customers VALUES($1,'CL-OUTRO','Outro cliente') ON CONFLICT(id) DO NOTHING",[otherCustomer]);
   await pool.query('UPDATE return_cases SET customer_id=$2 WHERE id=$1',[b.id,otherCustomer]);b=(await get('/'+b.id)).body;
   const input=batchInput([a,b]);
   const [one,two]=await Promise.all([post('/factory-batches',input),post('/factory-batches',input)]);
   expect(one.status).toBe(201);expect(two.body.id).toBe(one.body.id);expect(one.body.lines.map((l:any)=>l.customerCode).sort()).toEqual(['CL-OUTRO','CL-TESTE']);
   expect((await post('/factory-batches',{...input,reference:'Changed'})).status).toBe(409);
   expect((await post('/factory-batches',batchInput([a]))).status).toBe(409);
   a=(await get('/'+a.id)).body;
   expect((await post('/factory-batches',batchInput([a]))).status).toBe(400);
   expect((await get('/factory-available')).body).toEqual([]);
   expect(a.execution.progress.factoryPendingQuantity).toBe(3);expect(a.execution.receipts).toEqual([]);
   expect((await post(`/${a.id}/actions`,{version:a.version,action:'reopen_triage',reason:'Correção'})).status).toBe(409);
  });
  it('keeps partial decisions, original custody and compensation independent',async()=>{
   grants.push('returns.logistics');let d=await dispatch(await finished(3));
   d=await operate(d,'factory_result',resultInput(d,1,'approved','credit'));
   expect(d.execution.progress.factoryPendingQuantity).toBe(2);expect(d.execution.progress.supplierPendingQuantity).toBe(1);
   expect(d.execution.receipts).toEqual([]);expect(d.execution.credits).toEqual([]);
   expect((await execution(d,'factory_result',resultInput(d,3))).status).toBe(400);
   const line=d.execution.factoryLines[0],result=d.execution.results[0];
   const receipt={itemId:d.items[0].id,lineId:line.id,resultId:result.id,kind:'supplier_replacement',quantity:1,location:'XP',receivedBy:'Isis',reference:'REC-123',reason:'Conferido',approvalReference:'',occurredAt};
   expect((await execution(d,'physical_receipt',receipt)).status).toBe(400);
   d=await operate(d,'physical_receipt',{...receipt,resultId:null,kind:'original_returned'});
   expect(d.execution.progress.factoryPendingQuantity).toBe(2);expect(d.execution.progress.internalPendingQuantity).toBe(3);
   expect((await execution(d,'physical_receipt',{...receipt,resultId:null,kind:'factory_retained',quantity:3,approvalReference:'GESTAO'})).status).toBe(400);
  });
  it('separates finance authority, customer credit, supplier credit and exact official postings',async()=>{
   grants.push('returns.logistics');let d=await dispatch(await finished(2));
   d=await operate(d,'factory_result',resultInput(d,2,'approved','credit'));
   d=await operate(d,'resolution',{itemId:d.items[0].id,resultId:d.execution.results[0].id,quantity:2,kind:'credit',reason:'Acordo autorizado',approvalReference:''});
   const sourceId=d.execution.resolutions[0].id;
   const input={party:'customer',sourceId,amountCents:12345,currency:'BRL',priceBasis:'Nota original, valor unitário conferido',approvalReference:'GESTAO-456'};
   expect((await execution(d,'credit_authorize',input)).status).toBe(403);
   grants=['returns.view','returns.finance'];
   expect((await execution(d,'credit_authorize',{...input,amountCents:123.45})).status).toBe(400);
   d=await operate(d,'credit_authorize',input);expect(d.execution.credits[0].amountCents).toBe(12345);
   const creditId=d.execution.credits[0].id;
   d=await operate(d,'credit_post',{creditId,officialSystem:'ERP',officialReference:'CR-123',occurredAt});
   expect(d.execution.progress.customerPendingQuantity).toBe(0);expect(d.execution.progress.supplierPendingQuantity).toBe(2);expect(d.execution.progress.financePendingCount).toBe(1);
   expect((await execution(d,'credit_post',{creditId,officialSystem:'ERP',officialReference:'CR-123',occurredAt})).status).toBe(400);
   d=await operate(d,'credit_authorize',{...input,party:'supplier',sourceId:d.execution.results[0].id});
   const supplier=d.execution.credits.find((c:any)=>c.party==='supplier');
   expect((await execution(d,'credit_post',{creditId:supplier.id,officialSystem:'erp',officialReference:'cr-123',occurredAt})).status).toBe(409);
   expect((await execution(d,'credit_reverse',{creditId,reason:'Correção',officialSystem:'',officialReference:'',occurredAt})).status).toBe(400);
   d=await operate(d,'credit_reverse',{creditId,reason:'Valor incorreto, estorno oficial conferido',officialSystem:'ERP',officialReference:'EST-123',occurredAt});
   expect(d.execution.progress.customerPendingQuantity).toBe(2);expect(d.execution.credits.find((c:any)=>c.id===creditId).officialReference).toBe('CR-123');
  });
  it('finishes partial factory return, partial delivery, custody, communication and close independently',async()=>{
   grants.push('returns.logistics');let d=await dispatch(await finished(3));
   d=await operate(d,'factory_result',resultInput(d,2));
   d=await operate(d,'factory_result',resultInput(d,1,'refused','none'));
   const approved=d.execution.results.find((r:any)=>r.decision==='approved'),refused=d.execution.results.find((r:any)=>r.decision==='refused');
   const receipt={itemId:d.items[0].id,lineId:d.execution.factoryLines[0].id,resultId:null,kind:'original_returned',quantity:1,location:'XP',receivedBy:'Isis',reference:'RET-001',reason:'Conferido fisicamente',approvalReference:'',occurredAt};
   d=await operate(d,'physical_receipt',receipt);
   d=await operate(d,'physical_receipt',{...receipt,kind:'factory_retained',quantity:2,reference:'RETENCAO-001',approvalReference:'Acordo fábrica confirmado'});
   d=await operate(d,'physical_receipt',{...receipt,kind:'supplier_replacement',quantity:2,resultId:approved.id,reference:'SUB-001'});
   const source=d.execution.receipts.find((r:any)=>r.kind==='supplier_replacement');
   d=await operate(d,'resolution',{itemId:d.items[0].id,resultId:approved.id,quantity:2,kind:'replacement',reason:'Substituição aceita',approvalReference:''});
   d=await operate(d,'resolution',{itemId:d.items[0].id,resultId:refused.id,quantity:1,kind:'return_original',reason:'Devolver recusa',approvalReference:''});
   const replacement=d.execution.resolutions.find((s:any)=>s.kind==='replacement'),original=d.execution.resolutions.find((s:any)=>s.kind==='return_original');
   const delivery={resolutionId:replacement.id,receiptId:source.id,quantity:1,method:'pickup',recipient:'Juari, documento conferido',tracking:'',reference:'RETIRADA-1',sentAt:occurredAt,deliveryProof:'Comprovante assinado'};
   d=await operate(d,'delivery',delivery);
   d=await operate(d,'delivery',{...delivery,method:'dispatch',reference:'DESP-1',tracking:'TRANS-123',deliveryProof:''});
   expect(d.execution.progress.deliveryPendingQuantity).toBe(2);
   expect((await execution(d,'close',{reason:'Conferido'})).status).toBe(400);
   expect((await execution(d,'delivery',delivery)).status).toBe(400);
   d=await operate(d,'delivery',{...delivery,resolutionId:original.id,receiptId:null,reference:'RETIRADA-2'});
   d=await operate(d,'notice',noticeInput);
   expect(d.execution.progress.customerComplete).toBe(false);
   const inTransit=d.execution.deliveries.find((e:any)=>e.method==='dispatch');
   d=await operate(d,'delivery_confirm',{deliveryId:inTransit.id,occurredAt,recipient:'Cliente confirmado',proof:'Canhoto de entrega TRANS-123'});
   expect(d.execution.progress.customerComplete).toBe(true);expect(d.execution.progress.internalComplete).toBe(true);expect(d.execution.progress.canClose).toBe(true);
   d=await operate(d,'close',{reason:'Conferência de todos os saldos e comprovantes'});expect(d.stage).toBe('closed');expect(d.closedAt).toBeTruthy();
   expect((await get('')).body.total).toBe(0);expect((await get('?stage=closed')).body.total).toBe(1);
   expect((await execution(d,'notice',noticeInput)).status).toBe(409);
   d=await operate(d,'reopen',{reason:'Cliente contestou a entrega'});expect(d.execution.progress.reviewCount).toBe(1);
   expect((await execution(d,'close',{reason:'Conferido'})).status).toBe(400);
   d=await operate(d,'review_resolve',{reviewId:d.execution.reviews[0].id,resolution:'Canhoto reconferido com o cliente; entrega confirmada'});
   expect(d.execution.progress.canClose).toBe(true);
  });
  it('keeps retained XP originals pending after customer credit, until internal work is confirmed',async()=>{
   grants.push('returns.logistics','returns.finance');let d=await finished(1,'approved');
   d=await operate(d,'resolution',{itemId:d.items[0].id,resultId:null,quantity:1,kind:'credit',reason:'Crédito autorizado',approvalReference:''});
   d=await operate(d,'credit_authorize',{party:'customer',sourceId:d.execution.resolutions[0].id,amountCents:9900,currency:'BRL',priceBasis:'Nota original',approvalReference:'FIN-1'});
   d=await operate(d,'credit_post',{creditId:d.execution.credits[0].id,officialSystem:'ERP',officialReference:'CRED-1',occurredAt});
   d=await operate(d,'notice',noticeInput);expect(d.execution.progress.customerComplete).toBe(true);expect(d.execution.progress.internalComplete).toBe(false);
   d=await operate(d,'disposition',{itemId:d.items[0].id,receiptId:null,asset:'original',quantity:1,destination:'reconditioning',fromLocation:'Triagem',toLocation:'Bancada de reparo',custodian:'Técnico identificado',reference:'OS-1',reason:'Peça aceita em troca',testNotes:'Teste técnico registrado',occurredAt});
   expect((await execution(d,'close',{reason:'Conferido'})).status).toBe(400);
   d=await repair(d,'grade_1');d=await operate(d,'disposition_confirm',{dispositionId:d.execution.dispositions[0].id,occurredAt,receivedBy:'Responsável pelo estoque',proof:'OS-1 concluída, entrada de outlet OUT-1'});
   expect(d.execution.progress.canClose).toBe(true);
   const count=d.execution.credits.length;await get('/'+d.id);await get('/'+d.id);expect((await get('/'+d.id)).body.execution.credits).toHaveLength(count);
  });
  it('caps XP stock sources, guards evidence ownership, replays safely and preserves void history',async()=>{
   grants.push('returns.logistics');let d=await finished(2,'approved');
   d=await operate(d,'resolution',{itemId:d.items[0].id,resultId:null,quantity:2,kind:'replacement',reason:'Reposição do estoque',approvalReference:''});
   const input={requestId:crypto.randomUUID(),itemId:d.items[0].id,lineId:null,resultId:null,kind:'stock_replacement',quantity:1,location:'Expedição',receivedBy:'Isis',reference:'ESTOQUE-SAIDA-1-LINHA-1',reason:'Separação física conferida',approvalReference:'',occurredAt};
   const response=await execution(d,'physical_receipt',input);expect(response.status).toBe(200);
   expect((await execution(d,'physical_receipt',input)).status).toBe(200);d=response.body;
   expect((await execution(d,'physical_receipt',{...input,requestId:crypto.randomUUID(),reference:'ESTOQUE-SAIDA-2',quantity:2})).status).toBe(400);
   expect((await execution(d,'notice',{...noticeInput,evidenceId:crypto.randomUUID()})).status).toBe(400);
   const source=d.execution.receipts[0];
   d=await operate(d,'delivery',{resolutionId:d.execution.resolutions[0].id,receiptId:source.id,quantity:1,method:'dispatch',recipient:'Cliente',tracking:'RAST-1',reference:'SAIDA-1',sentAt:occurredAt,deliveryProof:''});
   expect((await execution(d,'void_record',{recordType:'receipt',recordId:source.id,reason:'Corrigir'})).status).toBe(400);
   d=await operate(d,'void_record',{recordType:'delivery',recordId:d.execution.deliveries[0].id,reason:'Despacho registrado por engano; peça ainda na XP'});
   expect(d.execution.deliveries[0].voidedAt).toBeTruthy();expect(d.events[0].action).toBe('void_record');
   d=await operate(d,'void_record',{recordType:'receipt',recordId:source.id,reason:'Corrigir documento de separação'});
   expect(d.execution.receipts[0].voidedAt).toBeTruthy();
  });
  it('lets finance assume post-triage responsibility but never technical work',async()=>{
   const financeId='10000000-0000-4000-8000-000000000009';
   await pool.query("INSERT INTO profiles VALUES($1,'finance@test.invalid','Financeiro','financeiro',true)",[financeId]);
   try{
    let d=await start(1);
    const assignment={version:d.version,assigneeId:financeId,dueAt:'2026-12-10T12:00:00Z',nextAction:'Conferir financeiro',location:'XP',receivedQuantity:1,correctionReason:''};
    expect((await request(app).patch('/api/returns/'+d.id).set('Authorization','Bearer operator').send(assignment)).status).toBe(400);
    d=(await post(`/${d.id}/items`,item(d.version,1))).body;
    d=(await post(`/${d.id}/actions`,{version:d.version,action:'complete_triage'})).body;
    const assigned=await request(app).patch('/api/returns/'+d.id).set('Authorization','Bearer operator').send({...assignment,version:d.version});
    expect(assigned.status).toBe(200);expect(assigned.body.assignee.id).toBe(financeId);
    expect((await post(`/${d.id}/actions`,{version:assigned.body.version,action:'reopen_triage',reason:'Revisão técnica'})).status).toBe(400);
   }finally{await pool.query('UPDATE return_cases SET assignee_id=NULL WHERE assignee_id=$1',[financeId]);await pool.query('DELETE FROM profiles WHERE id=$1',[financeId]);}
  });
  it('protects logistics from technician access and cancels only unconsumed mistaken manifests',async()=>{
   let d=await finished(1);const input=batchInput([d]);
   expect((await post('/factory-batches',input)).status).toBe(403);
   expect((await execution(d,'resolution',{itemId:d.items[0].id,resultId:null,quantity:1,kind:'not_applicable',reason:'No',approvalReference:'No'})).status).toBe(403);
   grants.push('returns.logistics');let batch=(await post('/factory-batches',input)).body;d=(await get('/'+d.id)).body;
   const payload={requestId:crypto.randomUUID(),reason:'Saída registrada por engano; peças conferidas ainda na XP',cases:[{id:d.id,version:d.version}]};
   batch=(await post(`/factory-batches/${batch.id}/cancel`,payload)).body;expect(batch.voidedAt).toBeTruthy();
   expect((await get('/factory-available')).body.some((i:any)=>i.caseId===d.id)).toBe(true);
   d=await dispatch((await get('/'+d.id)).body);d=await operate(d,'factory_result',resultInput(d,1));
   const id=d.execution.factoryLines.find((l:any)=>!l.voidedAt).batchId;
   expect((await post(`/factory-batches/${id}/cancel`,{...payload,requestId:crypto.randomUUID(),cases:[{id:d.id,version:d.version}]})).status).toBe(400);
  });
  const native=(d:any,op:string,input:object={})=>post(`/${d.id}/native/${op}`,{requestId:crypto.randomUUID(),version:d.version,...input});
  const nativeOk=async(d:any,op:string,input:object={})=>{const r=await native(d,op,input);expect(r.status,r.body.message).toBe(200);return r.body;};
  const nativeDetail=async(d:any)=>(await get('/'+d.id+'/native')).body;
  it('routes factory aliases and analysis seals without allowing technician overrides',async()=>{
   let d=await start(2);
   let r=await post(`/${d.id}/items`,{...item(d.version,1),manufacturer:'D.E.',seal:'J'});expect(r.status,r.body.message).toBe(200);d=r.body;
   expect(d.items[0]).toMatchObject({factoryCode:'DE',outcome:'external_analysis',factoryWorkflow:'external_individual'});
   expect((await post(`/${d.id}/items`,{...item(d.version,1),manufacturer:'VV',routingOverride:'Sem laudo da fábrica'})).status).toBe(403);
   r=await post(`/${d.id}/items`,{...item(d.version,1),manufacturer:'',seal:'Y'});expect(r.status).toBe(200);d=r.body;
   expect(d.items.find((i:any)=>i.seal==='Y').factoryCode).toBe('UNKNOWN');
   expect((await post(`/${d.id}/actions`,{version:d.version,action:'complete_triage'})).status).toBe(400);
   expect((await get('?stage=all&factory=DE')).body.total).toBe(1);
  });
  it('reserves a VV lot, edits its membership, sends once and then freezes its manifest',async()=>{
   grants.push('returns.logistics');let a=await finished(2),b=await finished(1);
   const input={...batchInput([a]),state:'assembling'};
   expect((await post('/factory-batches',{...input,lotReference:''})).status).toBe(400);
   let batch=(await post('/factory-batches',input)).body;expect(batch.state).toBe('assembling');expect(batch.sentAt).toBeNull();
   a=(await get('/'+a.id)).body;
   expect((await execution(a,'factory_result',resultInput(a,1))).status).toBe(400);
   expect((await get('/factory-available')).body.some((l:any)=>l.caseId===a.id)).toBe(false);
   const edit={requestId:crypto.randomUUID(),version:batch.version,cases:[{id:a.id,version:a.version},{id:b.id,version:b.version}],lines:[...batchInput([a,b]).lines]};
   let response=await request(app).put(`/api/returns/factory-batches/${batch.id}/lines`).set('Authorization','Bearer operator').send(edit);expect(response.status,response.body.message).toBe(200);batch=response.body;expect(batch.lines).toHaveLength(2);
   const send={requestId:crypto.randomUUID(),version:batch.version,cases:batch.lines.map((l:any)=>({id:l.caseId,version:l.version})),sentAt:occurredAt,dueAt:input.dueAt,reference:'SAIDA-VV-TESTE',carrier:'Responsável da fábrica',fromLocation:'XP'};
   const sent=await post(`/factory-batches/${batch.id}/send`,send);expect(sent.status,sent.body.message).toBe(200);expect(sent.body.state).toBe('sent');
   expect((await post(`/factory-batches/${batch.id}/send`,send)).status).toBe(200);
   a=(await get('/'+a.id)).body;b=(await get('/'+b.id)).body;
   response=await request(app).put(`/api/returns/factory-batches/${batch.id}/lines`).set('Authorization','Bearer operator').send({...edit,requestId:crypto.randomUUID(),version:sent.body.version,cases:[{id:a.id,version:a.version},{id:b.id,version:b.version}]});expect(response.status).toBe(409);
   a=await operate(a,'factory_result',resultInput(a,1));expect(a.execution.results).toHaveLength(1);
  });
  it('keeps non-VV factories individual and never aliases STC to TC-OMG',async()=>{
   grants.push('returns.logistics');
   const make=async(manufacturer:string)=>{let d=await start(1);d=(await post(`/${d.id}/items`,{...item(d.version,1),manufacturer})).body;return (await post(`/${d.id}/actions`,{version:d.version,action:'complete_triage'})).body;};
   const de=await make('D.E.'),other=await make('DE'),stc=await make('STC');
   expect((await post('/factory-batches',{...batchInput([de,other]),manufacturer:'DE'})).status).toBe(400);
   expect((await post('/factory-batches',{...batchInput([de,other]),manufacturer:'DE',mode:'batch'})).status).toBe(400);
   const response=await post('/factory-batches',{...batchInput([de]),manufacturer:'D.E.'});expect(response.status,response.body.message).toBe(201);expect(response.body.mode).toBe('individual');
   expect((await post('/factory-batches',{...batchInput([stc]),manufacturer:'TC-OMG'})).status).toBe(400);
  });
  it('posts native credits, caps concurrent uses, audits reversals and holds mirrored legacy balances',async()=>{
   grants.push('returns.logistics','returns.finance');let d=await finished(1,'approved');
   d=await operate(d,'resolution',{itemId:d.items[0].id,resultId:null,quantity:1,kind:'credit',reason:'Crédito confirmado',approvalReference:''});
   d=await operate(d,'credit_authorize',{party:'customer',sourceId:d.execution.resolutions[0].id,amountCents:12550,currency:'BRL',priceBasis:'Venda conferida',approvalReference:'FIN-123'});const creditId=d.execution.credits[0].id;
   expect((await native(d,'wallet_post',{creditId,exclusiveConfirmed:false,reason:'Conferido'})).status).toBe(400);
   const postInput={requestId:crypto.randomUUID(),version:d.version,creditId,exclusiveConfirmed:true,reason:'Crédito novo exclusivo do CRM, conferido sem duplicidade'};
   let response=await post(`/${d.id}/native/wallet_post`,postInput);expect(response.status,response.body.message).toBe(200);d=response.body;
   expect((await post(`/${d.id}/native/wallet_post`,postInput)).status).toBe(200);
   expect((await nativeDetail(d)).wallet).toHaveLength(1);expect(d.execution.credits[0].status).toBe('posted');
   const uses=await Promise.all([native(d,'wallet_apply',{creditId,amountCents:10000,reference:'PED-1',reason:'Abatimento no pedido 1'}),native(d,'wallet_apply',{creditId,amountCents:10000,reference:'PED-2',reason:'Abatimento no pedido 2'})]);expect(uses.map(r=>r.status).sort()).toEqual([200,409]);d=(await get('/'+d.id)).body;
   expect((await execution(d,'credit_reverse',{creditId,reason:'Revisão financeira',officialSystem:'',officialReference:'',occurredAt})).status).toBe(409);
   let n=await nativeDetail(d);const use=n.wallet.find((r:any)=>r.kind==='application');d=await nativeOk(d,'wallet_undo',{entryId:use.id,reference:'EST-USO-1',reason:'Pedido cancelado, uso desfeito'});
   const g=(await nativeDetail(d)).wallet.find((r:any)=>r.kind==='grant');
   const snapshot=crypto.randomUUID();await pool.query('INSERT INTO customer_credit_snapshots VALUES($1,true)',[snapshot]);await pool.query('INSERT INTO customer_credit_payment_entries VALUES($1,$2,$3,$4,$5,$6)',[snapshot,customerId,'PAG-EXATO',125.50,g.reference,'TROCA']);
   expect((await native(d,'wallet_apply',{creditId,amountCents:1,reference:'PED-3',reason:'Não pode duplicar saldo'})).status).toBe(409);
   expect((await native(d,'wallet_transfer',{creditId,paymentReference:'SEM-MATCH',reason:'Conferência do legado'})).status).toBe(409);
   d=await nativeOk(d,'wallet_transfer',{creditId,paymentReference:g.reference,reason:'Mesmo crédito conferido no legado; saldo nativo baixado'});
   n=await nativeDetail(d);expect(n.wallet.find((r:any)=>r.kind==='grant').balanceCents).toBe(0);
   expect((await pool.query('SELECT count(*)::int AS n FROM customer_credit_payment_entries')).rows[0].n).toBe(1);
  });
  it('qualifies recovered pieces, prevents overselling, restores unused separation and checks cancellation value',async()=>{
   grants.push('returns.logistics','returns.finance');let source=await finished(2,'resale');
   expect((await native(source,'cancellation',{itemId:source.items[0].id,resultId:null,quantity:1,saleReference:'VENDA-10',saleLine:'1',originalQuantity:2,unitCents:7500,inspection:'Venda e estado novo conferidos',approvalReference:'GESTAO-1'})).status).toBe(409);
   expect((await native(source,'cancellation',{itemId:source.items[0].id,resultId:null,quantity:2,saleReference:'VENDA-LIMITE',saleLine:'1',originalQuantity:2,unitCents:1e12,inspection:'Conferência de limite monetário',approvalReference:'GESTAO-1'})).status).toBe(409);
   source=await operate(source,'disposition',{itemId:source.items[0].id,receiptId:null,asset:'original',quantity:2,destination:'reconditioning',fromLocation:'Triagem',toLocation:'Kevin',custodian:'Kevin',reference:'RECOND-1',reason:'Recuperar para venda',testNotes:'Teste inicial documentado',occurredAt});
   expect((await execution(source,'disposition_confirm',{dispositionId:source.execution.dispositions[0].id,occurredAt,receivedBy:'Kevin',proof:'Não pode concluir antes do técnico'})).status).toBe(400);
   source=await repair(source,'new','Sem selo de análise');source=await operate(source,'disposition_confirm',{dispositionId:source.execution.dispositions[0].id,occurredAt,receivedBy:'Kevin',proof:'Recuperação concluída e testes de imagem/touch'});
   source=await nativeOk(source,'stock_receive',{dispositionId:source.execution.dispositions[0].id,sku:'CX156-1',grade:'new',seal:'Sem selo de análise',inspection:'Peças recuperadas e conferidas como novas',location:'Estoque recuperado A1',reference:'ENT-REC-1'});
   const lot=(await nativeDetail(source)).stock[0];expect(lot.availableQuantity).toBe(2);
   source=await nativeOk(source,'cancellation',{itemId:source.items[0].id,resultId:null,quantity:2,saleReference:'VENDA-10',saleLine:'1',originalQuantity:2,unitCents:7500,inspection:'Venda original e condição nova conferidas',approvalReference:'GESTAO-1'});
   const resolution=source.execution.resolutions[0];expect(resolution.kind).toBe('sale_cancellation');expect(source.progress.financePendingCount).toBe(1);
   const credit={party:'customer',sourceId:resolution.id,amountCents:14999,currency:'BRL',priceBasis:'Cancelamento de venda',approvalReference:'FIN-CAN-1'};
   expect((await execution(source,'credit_authorize',credit)).status).toBe(400);source=await operate(source,'credit_authorize',{...credit,amountCents:15000});
   let dest=await finished(2,'approved');dest=await operate(dest,'resolution',{itemId:dest.items[0].id,resultId:null,quantity:2,kind:'replacement',reason:'Reposição autorizada',approvalReference:''});
   const issue={lotId:lot.id,itemId:dest.items[0].id,quantity:2,reference:'SEP-REC-1',reason:'Substituição conferida',location:'Bancada entrega',receivedBy:'Isis'};
   dest=await nativeOk(dest,'stock_issue',issue);expect(dest.execution.receipts[0].kind).toBe('stock_replacement');expect((await get('/stock')).body).toHaveLength(0);
   expect((await execution(dest,'void_record',{recordType:'receipt',recordId:dest.execution.receipts[0].id,reason:'Correção indevida'})).status).toBe(400);
   const move=(await nativeDetail(dest)).movements.find((m:any)=>m.kind==='issue');dest=await nativeOk(dest,'stock_return',{movementId:move.id,reference:'DEV-SEP-1',reason:'Separação não usada, devolvida fisicamente'});
   expect((await get('/stock')).body[0].availableQuantity).toBe(2);
   source=(await get('/'+source.id)).body;source=await nativeOk(source,'stock_transfer',{lotId:lot.id,location:'Estoque recuperado B2',custodian:'Isis',reference:'TRANSF-REC-1',reason:'Mudança de prateleira conferida'});
   source=await nativeOk(source,'stock_adjust',{lotId:lot.id,quantity:1,reference:'BAIXA-REC-1',reason:'Dano no manuseio documentado'});expect((await get('/stock')).body[0].availableQuantity).toBe(1);
   expect((await native(dest,'stock_issue',{...issue,reference:'SEP-REC-2'})).status).toBe(409);
  });
  it('only confirms notices with a provider id and never retries an uncertain send',async()=>{
   grants.push('returns.logistics','returns.communicate');let d=await finished(1,'approved');const instance=crypto.randomUUID();
   await pool.query("INSERT INTO whatsapp_instances(id,display_label,status,is_default,provider,instance_name,evolution_base_url,evolution_api_key) VALUES($1,'Remetente de teste','ACTIVE',true,'EVOLUTION','TEST','https://provider.test','test')",[instance]);
   const prepare=()=>post(`/${d.id}/notices`,{requestId:crypto.randomUUID(),version:d.version,instanceId:instance,destination:'5511999999999',message:'Protocolo de teste, não enviar a destinatário real'});
   let response=await prepare();expect(response.status,response.body.message).toBe(200);let id=response.body.id;d=(await get('/'+d.id)).body;
   expect((await post(`/${d.id}/notices/${id}/send`,{})).status).toBe(200);expect((await post(`/${d.id}/notices/${id}/send`,{})).status).toBe(200);expect(sendWhatsappInstanceTextMessage).toHaveBeenCalledTimes(1);
   d=(await get('/'+d.id)).body;expect(d.execution.notices).toHaveLength(1);
   vi.mocked(sendWhatsappInstanceTextMessage).mockResolvedValueOnce({});response=await prepare();id=response.body.id;d=(await get('/'+d.id)).body;
   expect((await post(`/${d.id}/notices/${id}/send`,{})).status).toBe(409);expect((await post(`/${d.id}/notices/${id}/send`,{})).status).toBe(409);expect(sendWhatsappInstanceTextMessage).toHaveBeenCalledTimes(2);
   expect((await nativeDetail(d)).messages.find((m:any)=>m.id===id).status).toBe('uncertain');expect((await get('/'+d.id)).body.execution.notices).toHaveLength(1);
   grants=grants.filter(p=>p!=='returns.communicate');expect((await post(`/${d.id}/notices/${id}/send`,{})).status).toBe(403);
  });
  it('links reviewed source rows once, detects changed revisions and blocks premature cutover',async()=>{
   grants.push('returns.logistics','returns.configure');let d=await finished(1,'approved');
   const rev=crypto.randomUUID(),row=crypto.randomUUID();await pool.query("INSERT INTO return_legacy_revisions(id,source_path,source_file_id,source_revision,source_hash,source_modified_at,row_count,active) VALUES($1,'/source.xlsx','file-test','rev-one','hash',NOW(),1,true)",[rev]);
   await pool.query("INSERT INTO return_legacy_rows(id,revision_id,sheet,row_number,fingerprint,anchor,occurrence,document,customer_code,customer_name,occurred_on,sku,description,signed_quantity,amount_cents,raw_status,raw_payload) VALUES($1,$2,'DEFEITOS',2,'fingerprint-one','anchor-one',1,'DEF-TESTE','CL-TESTE','Cliente de teste','2026-11-17','CX156-1','Tela',-1,-5000,'EM ANALISE','{}')",[row,rev]);
   expect((await get('/transition')).body.unresolved).toBe(1);
   const settings={version:1,sourcePath:'/DEFEITOS - XP/坏品表 PLANILHA DEFEITOS 2026.xlsx',sourceEnabled:true,authority:'crm',reason:'Conferência para corte'};
   expect((await request(app).put('/api/returns/transition/settings').set('Authorization','Bearer operator').send(settings)).status).toBe(409);
   const link={requestId:crypto.randomUUID(),rowId:row,revision:'rev-one',caseId:d.id,version:d.version,reason:'Recebimento conferido; mesma peça e cliente, sem repetir crédito'};
   expect((await post('/transition/review',link)).status).toBe(200);expect((await post('/transition/review',link)).status).toBe(200);expect((await get('/transition')).body.items[0].linkedCaseId).toBe(d.id);
   d=(await get('/'+d.id)).body;await pool.query("UPDATE return_legacy_revisions SET active=false WHERE id=$1",[rev]);
   await pool.query("INSERT INTO return_legacy_revisions(source_path,source_file_id,source_revision,source_hash,source_modified_at,row_count,active) VALUES('/source.xlsx','file-test','rev-two','hash-two',NOW(),0,true)");
   const changed=(await get('/transition')).body;expect(changed.conflicts).toHaveLength(1);d=(await get('/'+d.id)).body;expect(d.progress.blockers).toContain('Conferir vínculo cuja linha mudou ou saiu da planilha');
   expect((await post('/transition/resolve',{requestId:crypto.randomUUID(),linkId:changed.conflicts[0].id,caseVersion:d.version,reason:'Linha corrigida na origem; vínculo anterior encerrado para nova conferência'})).status).toBe(200);expect((await get('/transition')).body.conflicts).toHaveLength(0);
   expect((await pool.query('SELECT count(*)::int AS n FROM return_cases')).rows[0].n).toBe(1);expect((await pool.query('SELECT count(*)::int AS n FROM return_credits')).rows[0].n).toBe(0);
  });
  it('lets the assigned technician finish recovery without logistics or financial access',async()=>{
   grants.push('returns.logistics');let d=await finished(1,'resale');d=await operate(d,'disposition',{itemId:d.items[0].id,receiptId:null,asset:'original',quantity:1,destination:'reconditioning',fromLocation:'Triagem',toLocation:'Técnico',custodian:'Técnico de teste',reference:'REPARO-TECH',reason:'Recuperação solicitada',testNotes:'Inspeção inicial',occurredAt});
   d=await nativeOk(d,'repair_assign',{dispositionId:d.execution.dispositions[0].id,assigneeId:'10000000-0000-4000-8000-000000000002',dueAt:'2026-12-10T12:00:00Z',notes:'Recuperar e registrar imagem/touch'});expect(d.assignee.id).toBe('10000000-0000-4000-8000-000000000002');
   const job=(await nativeDetail(d)).repairs[0];
   const response=await request(app).post(`/api/returns/${d.id}/native/repair_complete`).set('Authorization','Bearer technician').send({requestId:crypto.randomUUID(),version:d.version,jobId:job.id,jobVersion:job.version,grade:'grade_1',seal:'1',testNotes:'Imagem e touch testados após recuperação'});expect(response.status,response.body.message).toBe(200);d=response.body;expect(d.assignee.id).toBe(operatorId);
   expect((await request(app).post(`/api/returns/${d.id}/native/stock_receive`).set('Authorization','Bearer technician').send({})).status).toBe(403);
   expect((await request(app).get('/api/returns/wallet').set('Authorization','Bearer technician')).status).toBe(403);
  });
  it('serializes stock issues across different customer protocols without overselling',async()=>{
   grants.push('returns.logistics');let source=await finished(1,'approved');source=await operate(source,'disposition',{itemId:source.items[0].id,receiptId:null,asset:'original',quantity:1,destination:'stock',fromLocation:'Triagem',toLocation:'Estoque recuperado',custodian:'Isis',reference:'STOCK-CONC',reason:'Peça conferida',testNotes:'Imagem e touch testados',occurredAt});source=await operate(source,'disposition_confirm',{dispositionId:source.execution.dispositions[0].id,occurredAt,receivedBy:'Isis',proof:'Entrada conferida'});
   source=await nativeOk(source,'stock_receive',{dispositionId:source.execution.dispositions[0].id,sku:'CX156-1',grade:'grade_1',seal:'1',inspection:'Teste e condição conferidos',location:'A1',reference:'ENT-CONC'});const lot=(await nativeDetail(source)).stock[0];
   const make=async()=>{let d=await finished(1,'approved');return operate(d,'resolution',{itemId:d.items[0].id,resultId:null,quantity:1,kind:'replacement',reason:'Reposição conferida',approvalReference:''});};const a=await make(),b=await make();
   const issue=(d:any)=>native(d,'stock_issue',{lotId:lot.id,itemId:d.items[0].id,quantity:1,reference:'CONC-'+d.id,reason:'Separação para atendimento',location:'Entrega',receivedBy:'Isis'});
   const responses=await Promise.all([issue(a),issue(b)]);expect(responses.map(r=>r.status).sort()).toEqual([200,409]);expect((await get('/stock')).body).toHaveLength(0);expect((await pool.query("SELECT count(*)::int AS n FROM return_stock_movements WHERE kind='issue'")).rows[0].n).toBe(1);
  });
});
