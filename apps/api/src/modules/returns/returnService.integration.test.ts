import express from "express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

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
import { HttpError } from "../../lib/httpError.js";
import { returnRoutes } from "./returnRoutes.js";

const operatorId = "10000000-0000-4000-8000-000000000001";
const customerId = "20000000-0000-4000-8000-000000000001";
let grants = ["returns.view","returns.manage"];
const app = express();
app.use(express.json({ limit: "8mb" }));
app.use((req,_res,next) => {
  if (req.headers.authorization === "Bearer operator") req.user = { id: operatorId,name: "Isis",email: "isis@test.invalid",role: "MANAGER",appRole: "operacional",permissions: grants };
  next();
});
app.use("/api/returns",returnRoutes);
app.use((error: unknown,_req: express.Request,res: express.Response,_next: express.NextFunction) => {
  res.status(error instanceof HttpError ? error.statusCode : error instanceof z.ZodError ? 400 : 500).json({ message: String(error) });
});
const post = (path: string,body: object) => request(app).post(`/api/returns${path}`).set("Authorization","Bearer operator").send(body);
const get = (path: string) => request(app).get(`/api/returns${path}`).set("Authorization","Bearer operator");
const receipt = (quantity = 5) => ({ requestId: crypto.randomUUID(),customerId,receivedAt:"2026-11-16T09:00:00-03:00",declaredQuantity:quantity,receivedQuantity:quantity,volumes:1,location:"Recebimento, caixa 12",notes:"" });
const item = (version: number,quantity = 5) => ({ version,model:"IP-11 LCD",sku:"CX156-1",quantity,frame:"S/A",color:"Preto",manufacturer:"VV",outcome:"approved",reason:"",testNotes:"Inspeção e teste de imagem realizados" });
async function start(quantity = 5) {
  const created = (await post("",receipt(quantity))).body;
  const assigned = (await request(app).patch(`/api/returns/${created.id}`).set("Authorization","Bearer operator").send({ version:created.version,assigneeId:operatorId,dueAt:"2026-11-17T15:00:00-03:00",nextAction:"Identificar e testar",location:"Bancada de triagem",receivedQuantity:quantity,correctionReason:"" })).body;
  const result = await post(`/${created.id}/actions`,{ version:assigned.version,action:"start_triage" });
  expect(result.status).toBe(200);
  return result.body;
}
async function finished(quantity=3,outcome='external_analysis'){
 let d=await start(quantity);d=(await post(`/${d.id}/items`,{...item(d.version,quantity),outcome,reason:'Conferência técnica'})).body;
 const result=await post(`/${d.id}/actions`,{version:d.version,action:'complete_triage'});expect(result.status).toBe(200);return result.body;
}
const execution=(d:any,operation:string,input:object={})=>post(`/${d.id}/execution/${operation}`,{requestId:crypto.randomUUID(),version:d.version,...input});
async function operate(d:any,operation:string,input:object={}){const r=await execution(d,operation,input);expect(r.status,r.body.message).toBe(200);return r.body;}
const occurredAt='2026-11-17T12:00:00Z';
const batchInput=(cases:any[])=>({requestId:crypto.randomUUID(),manufacturer:'VV',sentAt:occurredAt,dueAt:'2026-12-10T12:00:00Z',reference:'MAN-'+crypto.randomUUID(),carrier:'Transportadora / comprovante 123',fromLocation:'Recebimento XP',lines:cases.map(d=>({caseId:d.id,itemId:d.items[0].id,version:d.version,quantity:d.items[0].quantity}))});
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
      INSERT INTO profiles VALUES('${operatorId}','isis@test.invalid','Isis','operacional',true);
      INSERT INTO customers VALUES('${customerId}','CL-TESTE','Cliente de teste');`);
    await pool.query(returnWorkflowMigration);
    await pool.query(returnExecutionMigration);
  });
  beforeEach(async () => {
    grants=["returns.view","returns.manage"];
    await pool.query("TRUNCATE return_attachments,return_events,return_items,return_cases,return_commands RESTART IDENTITY CASCADE");
    await pool.query("DELETE FROM user_permissions");
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
    expect((await get("/lookups")).body.people).toEqual([]);
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
   d=await operate(d,'disposition_confirm',{dispositionId:d.execution.dispositions[0].id,occurredAt,receivedBy:'Responsável pelo estoque',proof:'OS-1 concluída, entrada de outlet OUT-1'});
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
});
