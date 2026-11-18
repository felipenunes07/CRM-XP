import { Router } from "express";
import { z } from "zod";
import { requirePermission } from "../platform/authMiddleware.js";
import { returnIdSchema } from "./returnSchemas.js";
import { assignReturnCase, attachReturnFile, changeReturnStage, createReturnReceipt, getReturnDetail,
  getReturnFile, getReturnLookups, listReturnQueue, removeReturnItem, saveReturnItem } from "./returnService.js";
import { cancelFactoryBatch,dispatchFactoryBatch,executeReturnOperation,factoryAvailable,getFactoryBatch,listFactoryBatches } from './returnExecutionService.js';
import { executionOperation } from './returnExecutionSchemas.js';

export const returnRoutes = Router();
returnRoutes.use(requirePermission("returns.view"));
returnRoutes.get('/factory-available',async(req,res)=>{res.json(await factoryAvailable(z.string().trim().max(150).parse(req.query.search??'')));});
returnRoutes.get('/factory-batches',async(req,res)=>{const query=z.object({search:z.string().trim().max(150).default(''),page:z.coerce.number().int().min(1).max(100000).default(1)}).parse(req.query);res.json(await listFactoryBatches(query.search,query.page));});
returnRoutes.get('/factory-batches/:batchId',async(req,res)=>{res.json(await getFactoryBatch(returnIdSchema.parse(req.params.batchId)));});
returnRoutes.post('/factory-batches',requirePermission('returns.logistics'),async(req,res)=>{res.status(201).json(await dispatchFactoryBatch(req.body,req.user!));});
returnRoutes.post('/factory-batches/:batchId/cancel',requirePermission('returns.logistics'),async(req,res)=>{res.json(await cancelFactoryBatch(returnIdSchema.parse(req.params.batchId),req.body,req.user!));});
returnRoutes.post('/:id/execution/:operation',async(req,res)=>{
 const operation=executionOperation.parse(req.params.operation);
 const id=returnIdSchema.parse(req.params.id);await executeReturnOperation(id,operation,req.body,req.user!);res.json(await getReturnDetail(id));
});
returnRoutes.get("/", async (req,res) => { res.json(await listReturnQueue(req.query,req.user!)); });
returnRoutes.get("/lookups", async (req,res) => {
  res.json(await getReturnLookups(z.string().trim().max(150).parse(req.query.search ?? "")));
});
returnRoutes.get("/:id", async (req,res) => { res.json(await getReturnDetail(returnIdSchema.parse(req.params.id))); });
returnRoutes.get("/:id/attachments/:fileId", async (req,res) => {
  res.setHeader("Cache-Control","no-store");
  res.json(await getReturnFile(returnIdSchema.parse(req.params.id),returnIdSchema.parse(req.params.fileId)));
});
returnRoutes.use(requirePermission("returns.manage"));
returnRoutes.post("/", async (req,res) => { res.status(201).json(await createReturnReceipt(req.body,req.user!)); });
returnRoutes.patch("/:id", async (req,res) => { res.json(await assignReturnCase(returnIdSchema.parse(req.params.id),req.body,req.user!)); });
returnRoutes.post("/:id/actions", async (req,res) => { res.json(await changeReturnStage(returnIdSchema.parse(req.params.id),req.body,req.user!)); });
returnRoutes.post("/:id/items", async (req,res) => { res.json(await saveReturnItem(returnIdSchema.parse(req.params.id),null,req.body,req.user!)); });
returnRoutes.put("/:id/items/:itemId", async (req,res) => {
  res.json(await saveReturnItem(returnIdSchema.parse(req.params.id),returnIdSchema.parse(req.params.itemId),req.body,req.user!));
});
returnRoutes.delete("/:id/items/:itemId", async (req,res) => {
  const { version } = z.object({ version: z.number().int().positive() }).strict().parse(req.body);
  res.json(await removeReturnItem(returnIdSchema.parse(req.params.id),returnIdSchema.parse(req.params.itemId),version,req.user!));
});
returnRoutes.post("/:id/attachments", async (req,res) => {
  res.json(await attachReturnFile(returnIdSchema.parse(req.params.id),req.body,req.user!));
});
