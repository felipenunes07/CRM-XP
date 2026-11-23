// Actual local UI + isolated PostgreSQL. This script deliberately refuses remote URLs.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const front=process.env.RETURN_E2E_FRONT||'http://127.0.0.1:5189',backend=process.env.RETURN_E2E_API||'http://127.0.0.1:15441';
for(const url of [front,backend])assert(['127.0.0.1','localhost'].includes(new URL(url).hostname),'Use only isolated local fixtures');
(async()=>{
 const output=process.env.RETURN_SCREENSHOT_DIR||path.resolve('artifacts/returns-complete');await fs.mkdir(output,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1500,height:1050}});page.setDefaultTimeout(15000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().includes('/api/returns')&&r.status()>=500)errors.push('HTTP '+r.status());});
 const detail=id=>fetch(backend+'/api/returns/'+id,{headers:{Authorization:'Bearer local-dev-token'}}).then(async r=>{assert.equal(r.status,200);return r.json();});
 const state={};
 try{
  await page.goto(front+'/trocas');
  async function receipt(customerId,quantity){
   await page.getByRole('button',{name:'Novo recebimento',exact:true}).click();
   await page.getByRole('combobox',{name:'Cliente',exact:true}).selectOption(customerId);
   await page.getByLabel('Quantidade declarada pelo cliente').fill(String(quantity));
   await page.getByLabel('Quantidade contada',{exact:true}).fill(String(quantity));
   await page.getByLabel('Localização da caixa').fill('TESTE LOCAL — SEM MERCADORIA');
   await page.getByLabel('Observações / divergência de contagem').fill('VALIDAÇÃO E2E DO PROCESSO COMPLETO — NÃO OPERACIONAL');
   const createdResponse=page.waitForResponse(r=>r.url()===backend+'/api/returns'&&r.request().method()==='POST');await page.getByRole('button',{name:'Gerar protocolo',exact:true}).click();const created=await (await createdResponse).json();await page.getByRole('heading',{name:created.protocol,exact:true}).waitFor();
   const id=new URL(page.url()).searchParams.get('protocolo');assert(id);
   await page.getByRole('combobox',{name:'Responsável pela próxima ação',exact:true}).selectOption('10000000-0000-4000-8000-000000000001');
   await page.getByLabel('Prazo interno').fill('2026-12-10T15:00');await page.getByLabel('Próxima ação',{exact:true}).fill('Conferir remessa de teste');
   await page.getByRole('button',{name:'Salvar responsável e ação',exact:true}).click();
   await page.locator('.returns-card.is-selected').getByText('Responsável: Isis',{exact:true}).waitFor();await page.getByRole('button',{name:'Iniciar triagem',exact:true}).click();
   await page.getByRole('button',{name:'Adicionar item',exact:true}).click();
   await page.getByLabel('Modelo',{exact:true}).fill('IP11 — TESTE E2E');await page.getByLabel('SKU, se identificado',{exact:true}).fill('CX156-1');await page.getByLabel('Quantidade do grupo').fill(String(quantity));
   await page.getByRole('combobox',{name:'Resultado',exact:true}).selectOption('external_analysis');await page.getByLabel('Fábrica',{exact:true}).fill('VV');
   await page.getByLabel('Teste ou inspeção realizada').fill('Teste de imagem e inspeção realizados');
   await page.getByRole('button',{name:'Salvar item',exact:true}).click();await page.getByRole('button',{name:'Salvar item',exact:true}).waitFor({state:'hidden'});
   await page.getByRole('button',{name:'Concluir triagem',exact:true}).click();await page.getByRole('heading',{name:'Fábrica, acerto e entrega',exact:true}).waitFor();
   return detail(id);
  }
  const a=await receipt('20000000-0000-4000-8000-000000000001',3),b=await receipt('20000000-0000-4000-8000-000000000002',1);
  state.caseIds=[a.id,b.id];await fs.writeFile(path.join(output,'test-cases.json'),JSON.stringify(state,null,2));
  await page.getByRole('button',{name:'Envios de fábrica',exact:true}).click();await page.getByRole('button',{name:'Novo envio',exact:true}).click();
  const batchForm=page.getByRole('form',{name:'Novo envio de fábrica'});
  await batchForm.getByLabel('Fábrica do envio').fill('VV');await batchForm.getByLabel('Situação',{exact:true}).selectOption('sent');await batchForm.getByLabel('Identificação do lote / agrupamento').fill('VV-E2E-'+Date.now());await batchForm.getByLabel('Prazo interno de retorno').fill('2026-12-12T15:00');
  await batchForm.getByLabel('Local de saída').fill('Recebimento XP');await batchForm.getByLabel('Transportadora / entregue por').fill('Isis — transporte de teste');
  const reference='ENV-E2E-'+Date.now();await batchForm.getByLabel('Comprovante único do envio').fill(reference);
  await batchForm.getByLabel('Buscar itens por cliente ou fábrica').fill(a.protocol);
  await batchForm.getByRole('checkbox',{name:new RegExp(a.protocol)}).check();
  await batchForm.getByLabel('Buscar itens por cliente ou fábrica').fill(b.protocol);
  await batchForm.getByRole('checkbox',{name:new RegExp(b.protocol)}).check();
  await batchForm.getByRole('button',{name:'Registrar encaminhamento',exact:true}).click();await page.getByRole('heading',{name:/^EF-\d+ · VV$/}).waitFor();
  await page.screenshot({path:path.join(output,'lote-dois-clientes.png'),fullPage:true});
  await page.evaluate(()=>{window.print=()=>{};});await page.getByRole('button',{name:'Imprimir relação do envio'}).click();await page.pdf({path:path.join(output,'relacao-envio.pdf'),format:'A4'});
  async function openCase(id){await page.goto(front+'/trocas?protocolo='+id);await page.getByRole('heading',{name:'Fábrica, acerto e entrega',exact:true}).waitFor();}
  const operationTitles={factory_result:'Registrar parecer da fábrica',physical_receipt:'Registrar entrada física ou retenção',resolution:'Definir atendimento ao cliente',credit_authorize:'Registrar crédito autorizado',credit_post:'Confirmar lançamento no financeiro',delivery:'Registrar retirada ou despacho',delivery_confirm:'Confirmar recebimento do cliente',notice:'Registrar contato realizado',disposition:'Encaminhar peça para destino interno',disposition_confirm:'Confirmar conclusão do destino',close:'Encerrar protocolo'};
  const operationButtons={factory_result:'Registrar parecer',physical_receipt:'Registrar retorno físico / estoque',resolution:'Definir atendimento',credit_authorize:'Registrar crédito autorizado',credit_post:'Confirmar lançamento no financeiro',delivery:'Registrar retirada ou despacho',delivery_confirm:'Confirmar recebimento do cliente',notice:'Registrar contato realizado',disposition:'Encaminhar destino interno',disposition_confirm:'Confirmar conclusão do destino',close:'Encerrar protocolo'};
  const operationTabs={factory_result:'Fábrica',physical_receipt:'Fábrica',resolution:'Acerto e créditos',credit_authorize:'Acerto e créditos',credit_post:'Acerto e créditos',delivery:'Contato e entrega',delivery_confirm:'Contato e entrega',notice:'Contato e entrega',disposition:'Destino e encerramento',disposition_confirm:'Destino e encerramento',close:'Destino e encerramento'};
  async function operation(op,fill){
   await page.getByRole('tab',{name:operationTabs[op],exact:true}).click();await page.getByRole('button',{name:operationButtons[op],exact:true}).click();
   const form=page.getByRole('form',{name:operationTitles[op],exact:true});await fill(form);
   const response=page.waitForResponse(r=>r.url().includes('/execution/'+op)&&r.request().method()==='POST');
   await form.getByRole('button',{name:'Confirmar registro',exact:true}).click();const result=await response;const data=await result.json();assert.equal(result.status(),200,data.message);await form.waitFor({state:'hidden'});return data;
  }
  async function factoryResult(id,quantity,decision,compensation,label){
   return operation('factory_result',async form=>{
    const d=await detail(id);await form.getByLabel('Linha do envio',{exact:true}).selectOption(d.execution.factoryLines[0].id);
    await form.getByLabel('Quantidade do movimento').fill(String(quantity));await form.getByLabel('Decisão da fábrica').selectOption(decision);
    await form.getByLabel('Compensação da fábrica para esta quantidade').selectOption(compensation);await form.getByLabel('Parecer original',{exact:true}).fill('原始报告 — E2E');
    await form.getByLabel('Tradução / parecer conferido').fill('Parecer de teste conferido');await form.getByLabel('Motivo / conferência').fill('Conferência de quantidade e resultado');
    await form.getByLabel('Referência da autorização da gestão').fill('AUTORIZACAO-E2E');await form.getByLabel('Documento / comprovante do movimento').fill(label);
   });
  }
  await openCase(a.id);
  await factoryResult(a.id,1,'approved','credit',reference+'-C');await factoryResult(a.id,1,'approved','replacement',reference+'-S');let d=await factoryResult(a.id,1,'refused','none',reference+'-R');
  assert.equal((await detail(b.id)).execution.progress.factoryPendingQuantity,1);
  async function physical(id,kind,quantity,resultId=null){
   return operation('physical_receipt',async form=>{
    const d=await detail(id);await form.getByLabel('Tipo de entrada / custódia').selectOption(kind);await form.getByLabel('Item de origem').selectOption(d.items[0].id);
    await form.getByLabel('Linha do envio',{exact:true}).selectOption(d.execution.factoryLines[0].id);
    if(resultId)await form.getByLabel('Parecer com substitutas aprovadas').selectOption(resultId);
    await form.getByLabel('Quantidade do movimento').fill(String(quantity));await form.getByLabel('Localização após a conferência').fill(kind==='factory_retained'?'Fábrica VV':'Expedição XP');
    await form.getByLabel('Recebido / conferido por').fill('Conferente de teste');await form.getByLabel('Documento / comprovante do movimento').fill(reference+'-'+kind);
    await form.getByLabel('Motivo / conferência').fill('Entrada/custódia conferida fisicamente');await form.getByLabel('Referência da autorização da gestão').fill('AUT-E2E');
   });
  }
  const supplierReplacement=d.execution.results.find(r=>r.compensation==='replacement');
  await physical(a.id,'factory_retained',2);await physical(a.id,'original_returned',1);d=await physical(a.id,'supplier_replacement',1,supplierReplacement.id);
  async function resolution(id,resultId,kind){return operation('resolution',async form=>{await form.getByLabel('Quantidade com decisão disponível').selectOption(resultId);await form.getByLabel('Como resolver para o cliente').selectOption(kind);await form.getByLabel('Motivo / conferência').fill('Atendimento autorizado no teste');});}
  const creditResult=d.execution.results.find(r=>r.compensation==='credit'),refused=d.execution.results.find(r=>r.decision==='refused');
  await resolution(a.id,creditResult.id,'credit');await resolution(a.id,supplierReplacement.id,'replacement');d=await resolution(a.id,refused.id,'return_original');
  async function credit(id,party,sourceId,amount,ref){
   let d=await operation('credit_authorize',async form=>{await form.getByLabel('Crédito de quem').selectOption(party);await form.getByLabel('Origem do crédito').selectOption(sourceId);await form.getByLabel('Valor total do crédito').fill(amount);await form.getByLabel('Moeda',{exact:true}).selectOption('BRL');await form.getByLabel('Regra e base do preço conferido').fill('Valor fictício para teste; nota original conferida');await form.getByLabel('Referência da autorização da gestão').fill('FIN-TESTE');});
   const c=d.execution.credits.find(c=>(party==='customer'?c.resolutionId:c.resultId)===sourceId&&c.status==='approved');assert(c);
   return operation('credit_post',async form=>{await form.getByLabel('Crédito',{exact:true}).selectOption(c.id);await form.getByLabel('Sistema financeiro oficial').fill('ERP DE TESTE');await form.getByLabel('Referência única do lançamento / parcela').fill(ref);});
  }
  await credit(a.id,'supplier',creditResult.id,'80,00',reference+'-ERP-F');d=await credit(a.id,'customer',d.execution.resolutions.find(r=>r.kind==='credit').id,'100,29',reference+'-ERP-C');
  async function delivery(id,resolutionId,method,receiptId=null){return operation('delivery',async form=>{await form.getByLabel('Atendimento que será entregue').selectOption(resolutionId);if(receiptId)await form.getByLabel('Entrada física das substitutas').selectOption(receiptId);await form.getByLabel('Forma de entrega').selectOption(method);await form.getByLabel('Retirante / destinatário identificado').fill('Cliente de teste identificado');await form.getByLabel('Transportadora e rastreio').fill('RASTREIO-E2E');await form.getByLabel('Documento / comprovante do movimento').fill(reference+'-ENTREGA-'+method);if(method==='pickup')await form.getByLabel('Comprovante de retirada').fill('RETIRADA ASSINADA — TESTE');});}
  await delivery(a.id,d.execution.resolutions.find(r=>r.kind==='return_original').id,'pickup');
  d=await delivery(a.id,d.execution.resolutions.find(r=>r.kind==='replacement').id,'dispatch',d.execution.receipts.find(r=>r.kind==='supplier_replacement').id);
  await page.getByRole('tab',{name:'Destino e encerramento',exact:true}).click();assert(await page.getByRole('button',{name:'Encerrar protocolo',exact:true}).isDisabled());
  await operation('notice',async form=>{await form.getByLabel('Canal do contato realizado').selectOption('phone');await form.getByLabel('Com quem falou').fill('Cliente de teste');await form.getByLabel('Resumo informado ao cliente').fill('Resultados e entrega parcial informados');await form.getByLabel('Documento / comprovante do movimento').fill('CONTATO DE TESTE');});
  d=await operation('delivery_confirm',async form=>{await form.getByLabel('Despacho aguardando recebimento').selectOption(d.execution.deliveries.find(e=>!e.deliveredAt).id);await form.getByLabel('Quem recebeu').fill('Cliente de teste');await form.getByLabel('Comprovante do recebimento').fill('CANHOTO CONFIRMADO — TESTE');});
  assert.equal(d.execution.progress.canClose,true);d=await operation('close',form=>form.getByLabel('Motivo / conferência').fill('Todos os saldos e comprovantes conferidos no teste'));assert.equal(d.stage,'closed');
  const count=d.execution.credits.length;await page.evaluate(()=>{window.print=()=>{};});await page.getByRole('button',{name:'Imprimir resumo do cliente'}).click();await page.locator('.return-print-label h1').filter({hasText:'resumo da troca'}).waitFor({state:'attached'});
  await page.pdf({path:path.join(output,'resumo-cliente.pdf'),format:'A4'});await page.getByRole('button',{name:'Imprimir resumo do cliente'}).click();assert.equal((await detail(a.id)).execution.credits.length,count);
  await page.screenshot({path:path.join(output,'protocolo-encerrado.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(output,'protocolo-mobile.png'),fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.setViewportSize({width:1500,height:1050});
  await openCase(b.id);d=await factoryResult(b.id,1,'approved','none',reference+'-B');await physical(b.id,'original_returned',1);d=await resolution(b.id,d.execution.results[0].id,'credit');
  d=await credit(b.id,'customer',d.execution.resolutions[0].id,'67,89',reference+'-ERP-B');
  await operation('notice',async form=>{await form.getByLabel('Canal do contato realizado').selectOption('in_person');await form.getByLabel('Com quem falou').fill('Segundo cliente de teste');await form.getByLabel('Resumo informado ao cliente').fill('Crédito de teste conferido');await form.getByLabel('Documento / comprovante do movimento').fill('CONTATO B');});
  d=await operation('disposition',async form=>{await form.getByLabel('Item de origem').selectOption(d.items[0].id);await form.getByLabel('Destino interno').selectOption('reconditioning');await form.getByLabel('Local de saída').fill('Triagem');await form.getByLabel('Local de destino').fill('Bancada de reparo');await form.getByLabel('Responsável pela peça no destino').fill('Técnico de teste');await form.getByLabel('Documento / comprovante do movimento').fill('OS-E2E');await form.getByLabel('Motivo / conferência').fill('Retida após crédito');await form.getByLabel('Teste / condição / autorização da destinação').fill('Teste e ordem de reparo conferidos');});
  assert.equal(d.execution.progress.customerComplete,true);assert.equal(d.execution.progress.canClose,false);
  await page.screenshot({path:path.join(output,'cliente-atendido-peca-pendente.png'),fullPage:true});
  const nativeCommand=async(op,input)=>{const response=await fetch(backend+'/api/returns/'+b.id+'/native/'+op,{method:'POST',headers:{Authorization:'Bearer local-dev-token','Content-Type':'application/json'},body:JSON.stringify({requestId:crypto.randomUUID(),version:d.version,...input})});const value=await response.json();assert.equal(response.status,200,value.message);d=value;};
  await nativeCommand('repair_assign',{dispositionId:d.execution.dispositions[0].id,assigneeId:'10000000-0000-4000-8000-000000000001',dueAt:'2026-12-10T12:00:00Z',notes:'Trabalho técnico de recondicionamento'});
  const job=await fetch(backend+'/api/returns/'+b.id+'/native',{headers:{Authorization:'Bearer local-dev-token'}}).then(r=>r.json()).then(n=>n.repairs[0]);
  await nativeCommand('repair_complete',{jobId:job.id,jobVersion:job.version,grade:'grade_1',seal:'1',testNotes:'Trabalho e testes concluídos pelo técnico'});await openCase(b.id);
  d=await operation('disposition_confirm',async form=>{await form.getByLabel('Encaminhamento pendente').selectOption(d.execution.dispositions[0].id);await form.getByLabel('Responsável que confirmou a conclusão').fill('Responsável pelo estoque');await form.getByLabel('Comprovante do destino concluído / entrada no estoque').fill('OS-E2E CONCLUÍDA / ENTRADA OUTLET TESTE');});
  assert.equal(d.progress.canClose,false);assert(d.progress.blockers.some(b=>b.includes('entrada das peças recuperadas')));
  await nativeCommand('stock_receive',{dispositionId:d.execution.dispositions[0].id,sku:'CX156-1',grade:'grade_1',seal:'1',inspection:'Inspeção e testes do outlet conferidos',location:'OUTLET-TESTE',reference:reference+'-ESTOQUE-B'});await openCase(b.id);
  d=await operation('close',form=>form.getByLabel('Motivo / conferência').fill('Atendimento e destinação interna conferidos'));assert.equal(d.stage,'closed');
  await page.reload();await page.getByRole('tab',{name:'Destino e encerramento',exact:true}).click();await page.getByText(/Protocolo encerrado em/).waitFor();assert.deepEqual(errors,[]);
  const report={checkedAt:new Date().toISOString(),caseIds:state.caseIds,mixedClientBatch:true,partialFactoryPendingVisible:true,customerAndSupplierCreditsIndependent:true,partialDeliveryBlockedClose:true,originalAndReplacementCustody:true,internalWorkBlockedClose:true,reprintingDidNotDuplicateCredit:true,bothCasesClosed:true,mobileNoOverflow:true,errors};
  await fs.writeFile(path.join(output,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }catch(e){await page.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(()=>{});throw e;}
 finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
