// Real local UI; configures a fictitious sender and never sends a message.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const front=process.env.RETURN_E2E_FRONT||'http://127.0.0.1:5189',backend=process.env.RETURN_E2E_API||'http://127.0.0.1:15441';
for(const url of [front,backend])assert(['localhost','127.0.0.1'].includes(new URL(url).hostname),'Use isolated local fixtures only');
(async()=>{
 const output=process.env.RETURN_SCREENSHOT_DIR||path.resolve('artifacts/returns-notice-access');await fs.mkdir(output,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1450,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(front+'/trocas?visao=regras');await page.getByRole('heading',{name:'WhatsApp para avisos de trocas',exact:true}).waitFor();
  const form=page.getByRole('form',{name:'Vincular remetente de trocas',exact:true});await form.getByLabel('WhatsApp aprovado',{exact:true}).selectOption('30000000-0000-4000-8000-000000000001');await form.getByLabel('Responsável pelos avisos',{exact:true}).selectOption('10000000-0000-4000-8000-000000000001');
  await form.getByLabel('Motivo / autorização do canal').fill('Canal fictício aprovado para validação local, sem envio');
  let response=page.waitForResponse(r=>r.url().endsWith('/notice-sender-access')&&r.request().method()==='POST');await form.getByRole('button',{name:'Salvar vínculo de WhatsApp',exact:true}).click();let result=await response,data=await result.json();assert.equal(result.status(),200,data.message);assert(data.instances[0].grants.some(g=>g.userId==='10000000-0000-4000-8000-000000000001'));assert.equal(data.instances[0].isDefault,false);
  await page.getByText('Vínculos adicionais para trocas: Isis',{exact:true}).waitFor();await page.screenshot({path:path.join(output,'canal-vinculado.png'),fullPage:true});
  await form.getByLabel('Ação do vínculo de WhatsApp',{exact:true}).selectOption('false');await form.getByLabel('Motivo / autorização do canal').fill('Revogação de teste sem alterar remetente geral');
  response=page.waitForResponse(r=>r.url().endsWith('/notice-sender-access')&&r.request().method()==='POST');await form.getByRole('button',{name:'Salvar vínculo de WhatsApp',exact:true}).click();result=await response;data=await result.json();assert.equal(result.status(),200,data.message);assert.equal(data.instances[0].grants.length,0);assert.equal(data.instances[0].isDefault,false);
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(output,'canal-mobile.png'),fullPage:true});assert.deepEqual(errors,[]);
  const report={checkedAt:new Date().toISOString(),grantUi:true,revokeUi:true,globalSenderUnchanged:true,mobileNoOverflow:true,realMessagesSent:0,errors};await fs.writeFile(path.join(output,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }catch(error){await page.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(()=>{});throw error;}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
