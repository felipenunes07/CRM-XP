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
  });
  beforeEach(async () => {
    grants=["returns.view","returns.manage"];
    await pool.query("TRUNCATE return_attachments,return_events,return_items,return_cases RESTART IDENTITY");
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
    await pool.query("INSERT INTO user_permissions VALUES($1,'returns.manage',false)",[operatorId]);
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
    expect((await get("")).body.total).toBe(0);
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
});
