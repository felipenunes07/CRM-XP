// Real browser/API/PostgreSQL, isolated LOCAL fixtures. Never writes to production.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const front=process.env.RETURN_E2E_FRONT||'http://127.0.0.1:5189',backend=process.env.RETURN_E2E_API||'http://127.0.0.1:15441';
for(const target of [front,backend])assert(['127.0.0.1','localhost'].includes(new URL(target).hostname),'Local fixtures only');
const database=new URL(process.env.RETURN_WORKFLOW_TEST_DATABASE_URL||'');assert(['127.0.0.1','localhost'].includes(database.hostname)&&database.pathname==='/crm_returns_test','Local isolated database only');
const headers={Authorization:'Bearer local-dev-token','Content-Type':'application/json'},uuid=()=>crypto.randomUUID(),admin='00000000-0000-0000-0000-000000000001';
async function call(route,input,method=input?'POST':'GET'){const r=await fetch(backend+'/api/returns'+route,{headers,method,body:input?JSON.stringify(input):undefined}),d=await r.json();assert(r.ok,JSON.stringify(d));return d;}
(async()=>{
 const {migrations}=await import('../apps/api/dist/db/migrations.js');
 const schema='returns_preview_'+crypto.createHash('sha256').update(migrations.slice(103).join('')+(await fs.readFile(path.join(__dirname,'returns-finance-fixture.sql'),'utf8')).replaceAll('\r\n','\n')).digest('hex').slice(0,12);
 const {Pool}=require('pg'),pool=new Pool({connectionString:database.toString(),options:'-c search_path='+schema});
 const output=process.env.RETURN_SCREENSHOT_DIR||path.resolve('artifacts/returns-worksheet');await fs.mkdir(output,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1500,height:1050}}),errors=[];
 page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const section=name=>page.getByRole('button',{name:'Abrir: '+name,exact:true}).click();
 const work=()=>page.getByRole('region',{name:'Vez de cada pessoa',exact:true});
 const save=async()=>{await page.getByRole('button',{name:/^Salvar alterações/}).click();await page.getByRole('status').filter({hasText:/Todas as alterações foram salvas|Linhas salvas/}).waitFor();};
 const refresh=async()=>{const options=page.locator('.returns-detail-options');if(await options.getAttribute('open')===null)await options.locator('summary').click();await options.getByRole('button',{name:'Atualizar atendimento',exact:true}).click();};
 try{
  let d=await call('',{requestId:uuid(),customerId:'20000000-0000-4000-8000-000000000001',receivedAt:new Date().toISOString(),declaredQuantity:5,receivedQuantity:5,volumes:1,location:'FICTÍCIO — DEMONSTRAÇÃO DE LANÇAMENTO',notes:'Teste local, sem mercadoria real'});
  d=await call('/'+d.id,{version:d.version,assigneeId:admin,dueAt:'2026-12-10T12:00:00Z',nextAction:'Testes fictícios de interface',location:d.location,receivedQuantity:5,correctionReason:''},'PATCH');
  d=await call('/'+d.id+'/actions',{version:d.version,action:'start_triage'});
  await page.goto(front+'/trocas?protocolo='+d.id);await work().getByText('Lançar e concluir os testes',{exact:true}).waitFor();assert((await work().innerText()).includes('É sua vez'));
  await page.getByRole('button',{name:'Colar do Excel',exact:true}).click();await page.getByLabel('Linhas copiadas do Excel',{exact:true}).fill('MODELO\tSKU\tARO\tCOR\tTROCA\tNÃO TROCA\tMOTIVO\nIP11 — DEMONSTRAÇÃO\tCX156-1\tS/A\tPreto\t2\t3\tInspeção de teste');await page.getByRole('button',{name:'Adicionar linhas coladas',exact:true}).click();
  assert.equal(await page.locator('.returns-sheet-table tbody tr').count(),2);
  for(const n of [1,2]){await page.getByLabel('Fábrica da linha '+n,{exact:true}).fill('XP');await page.getByLabel('Teste realizado da linha '+n,{exact:true}).fill('Teste fictício de imagem e touch para a linha '+n);}
  await page.getByRole('button',{name:'Detalhes da linha 2',exact:true}).click();await page.getByRole('region',{name:'Detalhes da linha 2',exact:true}).getByLabel('Defeito informado pelo cliente',{exact:true}).fill('Imagem falhando — relato fictício');await page.getByRole('button',{name:'Fechar detalhes da linha',exact:true}).click();
  await page.screenshot({path:path.join(output,'01-lancamento-em-tabela.png'),fullPage:false});
  let lostInput=null;
  await page.route('**/api/returns/*/items-sheet',async route=>{lostInput=route.request().postDataJSON();const response=await route.fetch();assert.equal(response.status(),200);await route.abort('failed');},{times:1});
  await page.getByRole('button',{name:/^Salvar alterações/}).click();await page.getByRole('alert').filter({hasText:'Não foi possível confirmar o salvamento'}).waitFor();
  assert((await call('/'+d.id)).items.length===2);assert(await page.getByLabel('Modelo da linha 1',{exact:true}).isDisabled());
  await page.reload();await page.getByRole('button',{name:'Verificar salvamento',exact:true}).waitFor();await page.getByRole('button',{name:'Verificar salvamento',exact:true}).click();await page.getByRole('status').filter({hasText:'Todas as alterações foram salvas'}).waitFor();
  d=await call('/'+d.id);assert.equal(d.items.length,2);assert.equal((await pool.query('SELECT count(*)::int AS n FROM return_commands WHERE request_id=$1',[lostInput.requestId])).rows[0].n,1);
  assert.equal(d.items.find(i=>i.outcome==='refused').customerReportedDefect,'Imagem falhando — relato fictício');
  await page.getByLabel('Cor da linha 1',{exact:true}).fill('Branco');await page.reload();await page.getByLabel('Cor da linha 1',{exact:true}).waitFor();assert.equal(await page.getByLabel('Cor da linha 1',{exact:true}).inputValue(),'Branco');
  const second=d.items[1];const itemFields=i=>Object.fromEntries(Object.entries(i).filter(([key])=>!['id','factoryWorkflow','createdAt'].includes(key)));
  d=await call('/'+d.id+'/items/'+second.id,{...itemFields(second),version:d.version,testNotes:'Teste remoto fictício atualizado'},'PUT');
  await refresh();await page.getByText('O atendimento mudou enquanto você lançava.',{exact:true}).waitFor();await page.getByRole('button',{name:'Conferi: atualizar versão e manter meu rascunho',exact:true}).click();await save();
  d=await call('/'+d.id);assert(d.items.some(i=>i.color==='Branco'));assert.equal(d.items.find(i=>i.id===second.id).testNotes,'Teste remoto fictício atualizado');
  const first=d.items[0];await page.getByLabel('Modelo da linha 1',{exact:true}).fill('Minha alteração fictícia');d=await call('/'+d.id+'/items/'+first.id,{...itemFields(first),version:d.version,model:'Modelo conferido por outra pessoa'},'PUT');
  await refresh();await page.getByRole('button',{name:'Usar CRM',exact:true}).click();await page.getByLabel('Modelo da linha 1',{exact:true}).waitFor();assert.equal(await page.getByLabel('Modelo da linha 1',{exact:true}).inputValue(),'Modelo conferido por outra pessoa');
  await page.getByRole('button',{name:'Concluir triagem e devolver à coordenação',exact:true}).click();await work().getByText('Definir o atendimento ao cliente',{exact:true}).waitFor();d=await call('/'+d.id);assert.equal(d.work.coordinator.name,'Isis');assert.equal(d.assignee.id,d.work.coordinator.id);
  const rick=uuid(),kevin=uuid();for(const [id,name] of [[rick,'Rick — TESTE LOCAL'],[kevin,'Kevin — TESTE LOCAL']]){await pool.query("INSERT INTO profiles(id,email,full_name,role,is_active) VALUES($1,$2,$3,'viewer',true)",[id,id+'@test.invalid',name]);await pool.query("INSERT INTO user_permissions(user_id,permission_key,allowed) VALUES($1,'returns.view',true),($1,'returns.manage',true)",[id]);}
  for(const [index,destination,actor,operation] of [[0,'technical_review',rick,'inspection_assign'],[1,'reconditioning',kevin,'repair_assign']]){
   const item=d.items[index];d=await call('/'+d.id+'/execution/disposition',{requestId:uuid(),version:d.version,itemId:item.id,receiptId:null,asset:'original',quantity:item.quantity,destination,fromLocation:'Teste fictício',toLocation:'Bancada fictícia',custodian:'Técnico de demonstração',reference:uuid(),reason:'Trabalho fictício para provar fila paralela',testNotes:'Teste local',occurredAt:new Date().toISOString()});
   const disposition=d.execution.dispositions.find(x=>x.itemId===item.id&&!x.voidedAt);d=await call('/'+d.id+'/native/'+operation,{requestId:uuid(),version:d.version,dispositionId:disposition.id,assigneeId:actor,dueAt:'2026-12-10T12:00:00Z',notes:'Trabalho local de demonstração'});
  }
  const owners=d.work.tasks.filter(t=>t.id.startsWith('job-')).map(t=>t.owner.name);assert(owners.includes('Rick — TESTE LOCAL')&&owners.includes('Kevin — TESTE LOCAL'));assert.equal(d.assignee.id,kevin);
  await page.reload();await work().getByText('Rick — TESTE LOCAL',{exact:true}).waitFor();await work().getByText('Kevin — TESTE LOCAL',{exact:true}).waitFor();await page.screenshot({path:path.join(output,'02-responsaveis-em-paralelo.png'),fullPage:false});
  await section('Peças e testes');assert(await page.getByLabel('Modelo da linha 1',{exact:true}).isDisabled());await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(output,'03-celular.png'),fullPage:true});assert.deepEqual(errors,[]);
  const result={checkedAt:new Date().toISOString(),caseId:d.id,pasteFamiliarColumns:true,multipleRowsAtomic:true,responseLostRecoveredAfterReload:true,noDuplicateItems:true,draftRecoveredAfterReload:true,nonOverlappingChangesPreserved:true,sameRowConflictExplicit:true,customerEvidencePreserved:true,triageHandedToIsis:true,parallelTechniciansPreserved:true,readOnlyAfterTriage:true,mobileNoOverflow:true,errors};await fs.writeFile(path.join(output,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
 }catch(e){await page.screenshot({path:path.join(output,'failure.png'),fullPage:true});throw e;}finally{await browser.close();await pool.end();}
})().catch(e=>{console.error(e);process.exitCode=1;});
