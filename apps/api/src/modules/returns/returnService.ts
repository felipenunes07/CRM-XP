import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { ReturnCase, ReturnDetail, ReturnItem, ReturnQueue } from "@olist-crm/shared";
import { pool } from "../../db/client.js";
import { HttpError } from "../../lib/httpError.js";
import type { JwtUser } from "../platform/authService.js";
import { computeEffectivePermissions } from "../platform/permissionService.js";
import { transaction, lockCase, record } from "./returnTransactions.js";
import { loadExecution,loadExecutions } from "./returnExecutionData.js";
import { factoryProfiles,routeReturnItem } from './returnFactoryPolicies.js';
import { actionSchema, assignmentSchema, attachmentSchema, itemSchema, queueSchema, receiptSchema } from "./returnSchemas.js";

const caseSelect = `SELECT r.*, c.customer_code, c.display_name, p.full_name AS assignee_name,
  COALESCE(i.quantity,0)::int AS item_quantity,
  (r.received_quantity - COALESCE(i.decided,0))::int AS pending_quantity,
  (r.stage <> 'closed' AND r.due_at < NOW()) AS overdue
  FROM return_cases r JOIN customers c ON c.id = r.customer_id
  LEFT JOIN profiles p ON p.id = r.assignee_id
  LEFT JOIN LATERAL (SELECT SUM(quantity) AS quantity,
    SUM(quantity) FILTER (WHERE outcome NOT IN ('pending','review')) AS decided
    FROM return_items WHERE case_id = r.id) i ON true`;

const iso = (value: Date | string) => new Date(value).toISOString();
function mapCase(row: Record<string, any>): ReturnCase {
  return {
    id: row.id, protocol: `TR-${String(row.protocol_number).padStart(6, "0")}`,
    customer: { id: row.customer_id, code: row.customer_code, name: row.display_name },
    stage: row.stage, receivedAt: iso(row.received_at), receiverName: row.receiver_name,
    declaredQuantity: row.declared_quantity, receivedQuantity: row.received_quantity,
    volumes: row.volumes, location: row.location, notes: row.notes,
    assignee: row.assignee_id ? { id: row.assignee_id, name: row.assignee_name } : null,
    dueAt: row.due_at ? iso(row.due_at) : null, nextAction: row.next_action,
    version: row.version, itemQuantity: row.item_quantity, pendingQuantity: row.pending_quantity,
    overdue: Boolean(row.overdue), updatedAt: iso(row.updated_at),
    closedAt: row.closed_at ? iso(row.closed_at) : null,
  };
}

export async function getReturnDetail(id: string): Promise<ReturnDetail> {
 return transaction(async client=>{
  await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const result = await client.query(`SELECT base.*,
    COALESCE((SELECT jsonb_agg(to_jsonb(item) ORDER BY item."createdAt",item.id) FROM
      (SELECT id,model,sku,quantity,frame,color,manufacturer,outcome,reason,test_notes AS "testNotes",factory_code AS "factoryCode",factory_workflow AS "factoryWorkflow",seal,routing_override AS "routingOverride",created_at AS "createdAt"
        FROM return_items WHERE case_id=base.id) item),'[]'::jsonb) AS items,
    COALESCE((SELECT jsonb_agg(to_jsonb(file) ORDER BY file."createdAt",file.id) FROM
      (SELECT id,name,content_type AS "contentType",octet_length(bytes) AS size,created_at AS "createdAt",author_name AS "authorName"
        FROM return_attachments WHERE case_id=base.id) file),'[]'::jsonb) AS attachments,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id',e.id::text,'action',e.action,'authorName',e.author_name,'createdAt',e.created_at,'data',e.data) ORDER BY e.id DESC)
      FROM return_events e WHERE e.case_id=base.id),'[]'::jsonb) AS events
    FROM (${caseSelect} WHERE r.id=$1) base`, [id]);
  if (!result.rows[0]) throw new HttpError(404, "Protocolo não encontrado");
  const row = result.rows[0];
  const execution=await loadExecution(client,id,row.items,row.stage);
  return { ...mapCase(row), items: row.items as ReturnItem[], attachments: row.attachments, events: row.events,execution,progress:execution.progress };
 });
}

export async function listReturnQueue(query: unknown, actor: JwtUser): Promise<ReturnQueue> {
  const input = queueSchema.parse(query);
  const params: unknown[] = [];
  const where: string[] = [];
  const add = (sql: string, value: unknown) => { params.push(value); where.push(sql.replace("?", `$${params.length}`)); };
  if (input.stage === "active") where.push("r.stage <> 'closed'");
  else if (input.stage === "overdue") where.push("r.stage <> 'closed' AND r.due_at < NOW()");
  else if (input.stage !== "all") add("r.stage = ?", input.stage);
  if (input.mine === "true") add("r.assignee_id = ?", actor.id);
  if(input.factory)add('EXISTS(SELECT 1 FROM return_items f WHERE f.case_id=r.id AND f.factory_code=?)',input.factory);
  if (input.search) {
    params.push(`%${input.search}%`);
    const n = params.length;
    where.push(`(c.display_name ILIKE $${n} OR c.customer_code ILIKE $${n} OR
      ('TR-' || LPAD(r.protocol_number::text, GREATEST(6,length(r.protocol_number::text)), '0')) ILIKE $${n})`);
  }
  const condition = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  const count = await pool.query(`SELECT count(*)::int AS total FROM return_cases r JOIN customers c ON c.id=r.customer_id${condition}`, params);
  const data = await pool.query(`${caseSelect}${condition}
    ORDER BY (r.stage = 'closed'), r.due_at ASC NULLS LAST, r.received_at ASC, r.id
    LIMIT 50 OFFSET $${params.length + 1}`, [...params, (input.page - 1) * 50]);
  const summary = await pool.query(`SELECT
    count(*) FILTER (WHERE stage='received')::int AS received,
    count(*) FILTER (WHERE stage='triage')::int AS triage,
    count(*) FILTER (WHERE stage='triage_completed')::int AS "triageCompleted",
    count(*) FILTER (WHERE stage='closed')::int AS closed,
    count(*) FILTER (WHERE stage<>'closed' AND due_at<NOW())::int AS overdue FROM return_cases`);
  const items=(await pool.query(`SELECT case_id AS "caseId",id,model,sku,quantity,frame,color,manufacturer,outcome,reason,test_notes AS "testNotes" FROM return_items WHERE case_id=ANY($1::uuid[])`,[data.rows.map(row=>row.id)])).rows;
  const execution=await loadExecutions(pool,data.rows.map(row=>({id:row.id,stage:row.stage,items:items.filter(item=>item.caseId===row.id)})));
  return { items: data.rows.map(row=>({...mapCase(row),progress:execution.get(row.id)!.progress})), total: count.rows[0].total, page: input.page, summary: summary.rows[0] };
}

async function returnOperators(client: Pool | PoolClient,required:'any'|'returns.manage'='any') {
  const result = await client.query(`SELECT p.id,COALESCE(NULLIF(p.full_name,''),p.email) AS name,p.role,
    COALESCE(jsonb_agg(jsonb_build_object('permissionKey',u.permission_key,'allowed',u.allowed))
      FILTER (WHERE u.permission_key IS NOT NULL),'[]'::jsonb) AS overrides
    FROM profiles p LEFT JOIN user_permissions u ON u.user_id=p.id
    WHERE p.is_active GROUP BY p.id ORDER BY name,p.id`);
  return result.rows.flatMap(row => {
    const permissions = computeEffectivePermissions({ role: row.role, overrides: row.overrides });
    const eligible=required==='any'?['returns.manage','returns.logistics','returns.finance'].some(key=>permissions.includes(key)):permissions.includes(required);
    return permissions.includes('returns.view')&&eligible?[{id:row.id as string,name:row.name as string,canTriage:permissions.includes('returns.manage'),canLogistics:permissions.includes('returns.logistics')}]:[];
  });
}

export async function getReturnLookups(search: string) {
  const [people, customers] = await Promise.all([
    returnOperators(pool),
    pool.query(`SELECT id, customer_code AS code, display_name AS name FROM customers
      WHERE customer_code ILIKE $1 OR display_name ILIKE $1 ORDER BY customer_code,id LIMIT 30`, [`%${search}%`]),
  ]);
  return { coordinator: "Isis", people, customers: customers.rows,factories:await factoryProfiles() };
}

export async function createReturnReceipt(payload: unknown, actor: JwtUser) {
  const input = receiptSchema.parse(payload);
  const hash = createHash("sha256").update(JSON.stringify({ ...input, actorId: actor.id })).digest("hex");
  const id = await transaction(async client => {
    if (!(await client.query("SELECT id FROM customers WHERE id=$1", [input.customerId])).rowCount) throw new HttpError(400, "Cliente não encontrado");
    const result = await client.query(`INSERT INTO return_cases
      (request_id,request_hash,customer_id,received_at,receiver_id,receiver_name,declared_quantity,received_quantity,volumes,location,notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (request_id) DO NOTHING RETURNING id`,
      [input.requestId,hash,input.customerId,input.receivedAt,actor.id,actor.name,input.declaredQuantity,input.receivedQuantity,input.volumes,input.location,input.notes]);
    if (!result.rows[0]) {
      const existing = (await client.query("SELECT id, request_hash FROM return_cases WHERE request_id=$1", [input.requestId])).rows[0];
      if (existing.request_hash !== hash) throw new HttpError(409, "Esta solicitação já foi usada para outro recebimento. Abra um novo formulário.");
      return existing.id as string;
    }
    await record(client, result.rows[0].id, "received", input, actor);
    return result.rows[0].id as string;
  });
  return getReturnDetail(id);
}

export async function assignReturnCase(id: string, payload: unknown, actor: JwtUser) {
  const input = assignmentSchema.parse(payload);
  await transaction(async client => {
    const before = await lockCase(client, id, input.version);
    if(before.stage==="closed")throw new HttpError(409,"Reabra o protocolo antes de alterar a responsabilidade");
    if (input.assigneeId && !(await returnOperators(client,['received','triage'].includes(before.stage)?'returns.manage':'any')).some(person => person.id === input.assigneeId)) throw new HttpError(400, "Selecione um responsável ativo com acesso à etapa da troca");
    if (["triage","triage_completed"].includes(before.stage) && (!input.assigneeId || !input.dueAt)) throw new HttpError(400, "Protocolo em andamento precisa de responsável e prazo");
    if (before.received_quantity !== input.receivedQuantity) {
      if (!input.correctionReason) throw new HttpError(400,"Informe o motivo da correção da contagem");
      if (before.stage === "triage_completed") throw new HttpError(409,"Reabra a triagem antes de corrigir a contagem");
      const total = (await client.query("SELECT COALESCE(sum(quantity),0)::int AS total FROM return_items WHERE case_id=$1",[id])).rows[0].total;
      if (input.receivedQuantity < total) throw new HttpError(400,"A contagem não pode ser menor que a soma dos itens. Corrija os grupos primeiro.");
    }
    await client.query("UPDATE return_cases SET assignee_id=$2,due_at=$3,next_action=$4,location=$5,received_quantity=$6 WHERE id=$1",
      [id,input.assigneeId,input.dueAt,input.nextAction,input.location,input.receivedQuantity]);
    await record(client, id, "assignment_updated", { before: { assigneeId: before.assignee_id, dueAt: before.due_at, nextAction: before.next_action, location: before.location, receivedQuantity: before.received_quantity }, after: input }, actor);
  });
  return getReturnDetail(id);
}

export async function saveReturnItem(id: string, itemId: string | null, payload: unknown, actor: JwtUser) {
  const parsed = itemSchema.parse(payload);
  await transaction(async client => {
    const parent = await lockCase(client, id, parsed.version);
    const input=await routeReturnItem(client,parsed,actor);
    if (parent.stage !== "triage") throw new HttpError(409, "Inicie ou reabra a triagem para alterar os itens");
    const before = itemId ? (await client.query("SELECT * FROM return_items WHERE case_id=$1 AND id=$2", [id,itemId])).rows[0] : null;
    if (itemId && !before) throw new HttpError(404, "Item não encontrado neste protocolo");
    const total = (await client.query("SELECT COALESCE(sum(quantity),0)::int AS total FROM return_items WHERE case_id=$1 AND ($2::uuid IS NULL OR id<>$2)", [id,itemId])).rows[0].total;
    if (total + input.quantity > parent.received_quantity) throw new HttpError(400, "A soma dos itens excede a quantidade recebida");
    const values = [id,input.model,input.sku,input.quantity,input.frame,input.color,input.manufacturer,input.outcome,input.reason,input.testNotes,input.factoryCode,input.factoryWorkflow,input.seal,input.routingOverride];
    const result = itemId
      ? await client.query(`UPDATE return_items SET model=$2,sku=$3,quantity=$4,frame=$5,color=$6,manufacturer=$7,outcome=$8,reason=$9,test_notes=$10,factory_code=$11,factory_workflow=$12,seal=$13,routing_override=$14 WHERE case_id=$1 AND id=$15 RETURNING id`, [...values,itemId])
      : await client.query(`INSERT INTO return_items (case_id,model,sku,quantity,frame,color,manufacturer,outcome,reason,test_notes,factory_code,factory_workflow,seal,routing_override) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`, values);
    await record(client,id,itemId ? "item_updated" : "item_added",{ itemId: result.rows[0].id, before, after: input,requestedOutcome:parsed.outcome,routingApplied:parsed.outcome!==input.outcome },actor);
  });
  return getReturnDetail(id);
}

export async function removeReturnItem(id: string, itemId: string, version: number, actor: JwtUser) {
  await transaction(async client => {
    const parent = await lockCase(client,id,version);
    if (parent.stage !== "triage") throw new HttpError(409,"Inicie ou reabra a triagem para alterar os itens");
    const result = await client.query("DELETE FROM return_items WHERE case_id=$1 AND id=$2 RETURNING *",[id,itemId]);
    if (!result.rowCount) throw new HttpError(404,"Item não encontrado neste protocolo");
    await record(client,id,"item_removed",{ before: result.rows[0] },actor);
  });
  return getReturnDetail(id);
}

export async function changeReturnStage(id: string, payload: unknown, actor: JwtUser) {
  const input = actionSchema.parse(payload);
  await transaction(async client => {
    const parent = await lockCase(client,id,input.version);
    let stage: string;
    if (input.action === "start_triage") {
      if (parent.stage !== "received") throw new HttpError(409,"Este protocolo já iniciou a triagem");
      const assignee = (await returnOperators(client,'returns.manage')).some(person => person.id === parent.assignee_id);
      if (!assignee || !parent.due_at) throw new HttpError(400,"Defina um responsável ativo e um prazo antes de iniciar");
      stage = "triage";
    } else if (input.action === "complete_triage") {
      if (parent.stage !== "triage") throw new HttpError(409,"A triagem não está em andamento");
      const totals = (await client.query(`SELECT COALESCE(sum(quantity),0)::int AS total,
        count(*) FILTER (WHERE outcome IN ('pending','review') OR factory_code='UNKNOWN' OR trim(model)='' OR trim(test_notes)='')::int AS pending
        FROM return_items WHERE case_id=$1`,[id])).rows[0];
      if (totals.total !== parent.received_quantity || totals.pending) throw new HttpError(400,"Identifique, teste e dê um destino a todas as peças recebidas antes de concluir");
      stage = "triage_completed";
    } else {
      if (parent.stage !== "triage_completed") throw new HttpError(409,"Somente uma triagem concluída pode ser reaberta");
      const execution=await client.query(`SELECT EXISTS(SELECT 1 FROM return_factory_lines WHERE case_id=$1 UNION ALL SELECT 1 FROM return_resolutions WHERE case_id=$1 UNION ALL SELECT 1 FROM return_physical_receipts WHERE case_id=$1) AS present`,[id]);
      if(execution.rows[0].present)throw new HttpError(409,"Já existem movimentos após a triagem. Registre uma revisão e corrija os movimentos com histórico antes de alterar a origem.");
      if (!parent.due_at || !(await returnOperators(client,'returns.manage')).some(person => person.id === parent.assignee_id)) throw new HttpError(400,"Defina um responsável ativo com acesso à triagem e um prazo antes de reabrir");
      stage = "triage";
    }
    await client.query("UPDATE return_cases SET stage=$2 WHERE id=$1",[id,stage]);
    if (stage === "triage_completed") await client.query("UPDATE return_cases SET next_action='Conferir os destinos e definir a próxima etapa com Isis' WHERE id=$1",[id]);
    if (input.action === "reopen_triage") await client.query("UPDATE return_cases SET next_action=$2 WHERE id=$1",[id,`Revisar triagem: ${input.reason}`]);
    await record(client,id,input.action,{ before: parent.stage, after: stage, reason: input.reason },actor);
  });
  return getReturnDetail(id);
}

export async function attachReturnFile(id: string, payload: unknown, actor: JwtUser) {
  const input = attachmentSchema.parse(payload);
  const bytes = Buffer.from(input.contentBase64,"base64");
  const valid = input.contentType === "image/png" ? bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    : input.contentType === "image/jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : bytes.subarray(0,5).toString() === "%PDF-";
  if (!valid || !bytes.length || bytes.length > 5242880) throw new HttpError(400,"Envie JPG, PNG ou PDF válido com até 5 MB");
  await transaction(async client => {
    await lockCase(client,id,input.version);
    const count = (await client.query("SELECT count(*)::int AS total FROM return_attachments WHERE case_id=$1",[id])).rows[0].total;
    if (count >= 20) throw new HttpError(400,"Limite de 20 anexos por protocolo");
    const file = await client.query(`INSERT INTO return_attachments(case_id,name,content_type,bytes,author_name) VALUES($1,$2,$3,$4,$5) RETURNING id`,[id,input.name,input.contentType,bytes,actor.name]);
    await record(client,id,"file_attached",{ attachmentId: file.rows[0].id, name: input.name },actor);
  });
  return getReturnDetail(id);
}

export async function getReturnFile(id: string, fileId: string) {
  const result = await pool.query("SELECT name,content_type,bytes FROM return_attachments WHERE case_id=$1 AND id=$2",[id,fileId]);
  if (!result.rows[0]) throw new HttpError(404,"Anexo não encontrado");
  const row = result.rows[0];
  return { name: row.name, contentType: row.content_type, contentBase64: row.bytes.toString("base64") };
}
