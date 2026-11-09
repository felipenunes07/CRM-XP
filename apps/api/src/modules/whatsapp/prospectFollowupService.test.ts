import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({query:vi.fn(),clientQuery:vi.fn(),connect:vi.fn(),release:vi.fn(),groups:vi.fn(),info:vi.fn(),sender:vi.fn(),send:vi.fn(),sync:vi.fn(),fresh:true,customers:[] as Record<string,unknown>[],env:{WHATSAPP_PROSPECT_FOLLOWUP_ENABLED:true}}));
vi.mock("../../db/client.js",()=>({pool:{query:mocks.query,connect:mocks.connect}}));
vi.mock("../../lib/env.js",()=>({env:mocks.env}));
vi.mock("../../lib/logger.js",()=>({logger:{info:vi.fn(),error:vi.fn()}}));
vi.mock("../crm/offboardingAlertService.js",()=>({sendToGroup:mocks.send}));
vi.mock("../crm/reactivationAudience.js",()=>({requireReactivationSender:mocks.sender}));
vi.mock("../platform/syncService.js",()=>({runPrimarySync:mocks.sync}));
vi.mock("./evolutionMetadataService.js",()=>({fetchEvolutionGroupInfo:mocks.info}));
vi.mock("./whatsappMonitorService.js",()=>({getWhatsappGroupsCreatedOnDate:mocks.groups,getWhatsappReportTeamIdentities:()=>["5511999999999","111111111111111"],isInternalWhatsappReportChat:()=>false}));
import { previewProspectFollowups,runProspectFollowups } from "./prospectFollowupService.js";
const group={jid:"120300000000001@g.us",name:"Cliente Janfone Celulares",createdAt:"2026-11-09T13:01:46Z"};
const now=new Date("2026-11-11T12:00:00Z");
const raw=()=>({id:group.jid,owner:"111111111111111@lid",participants:[
  {id:"111111111111111@lid",phoneNumber:"5511999999999@s.whatsapp.net"},
  {id:"222222222222222@lid",phoneNumber:"558189999000@s.whatsapp.net"},
]});
describe("prospect group followups",()=>{
  beforeEach(()=>{
    vi.clearAllMocks();mocks.fresh=true;mocks.customers=[];mocks.env.WHATSAPP_PROSPECT_FOLLOWUP_ENABLED=true;
    mocks.groups.mockResolvedValue([group]);mocks.info.mockResolvedValue({displayName:group.name,rawProfile:raw()});
    mocks.sender.mockResolvedValue({id:"lili-id",instance_name:"Lili",provider:"EVOLUTION",evolution_base_url:"https://evo.example",evolution_api_key:"test"});
    mocks.send.mockResolvedValue({key:{id:"sent-1"}});mocks.sync.mockResolvedValue({});
    mocks.query.mockImplementation(async(sql:string)=>{
      if(sql.startsWith("SELECT id FROM whatsapp_instances"))return{rows:[{id:"lili-id"}]};
      if(sql.includes("AS fresh"))return{rows:[{fresh:mocks.fresh}]};
      if(sql.includes("FROM customers c"))return{rows:mocks.customers};
      return{rows:[]};
    });
    const cursors=new Map<string,string>();
    mocks.clientQuery.mockImplementation(async(sql:string,params:string[]=[])=>{
      if(sql.includes("pg_try_advisory_lock"))return{rows:[{locked:true}]};
      if(sql.startsWith("SELECT cursor_value"))return{rows:cursors.has(params[0]!)?[{cursor_value:cursors.get(params[0]!)}]:[]};
      if(sql.startsWith("INSERT INTO sync_cursors")||sql.startsWith("UPDATE sync_cursors"))cursors.set(params[0]!,params[1]!);
      return{rows:[]};
    });
    mocks.connect.mockResolvedValue({query:mocks.clientQuery,release:mocks.release});
  });
  it("previews the D+2 group and mention without sending or claiming it",async()=>{
    const preview=await previewProspectFollowups("2026-11-11");
    expect(mocks.groups).toHaveBeenCalledWith("2026-11-09");
    expect(preview.groups[0]).toMatchObject({phone:"558189999000",reason:null});
    expect(mocks.send).not.toHaveBeenCalled();expect(mocks.connect).not.toHaveBeenCalled();
  });
  it("sends once, only mentions the customer, and leaves an audit record",async()=>{
    expect((await runProspectFollowups(now)).results).toMatchObject([{status:"sent"}]);
    expect((await runProspectFollowups(now)).results).toMatchObject([{status:"already_handled"}]);
    expect(mocks.send).toHaveBeenCalledOnce();
    expect(mocks.send).toHaveBeenCalledWith(group.jid,expect.stringContaining("Bom dia @558189999000 ☀️🙏🏻🤩"),"lili-id",["558189999000"]);
    expect(mocks.clientQuery).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO message_logs"),[group.jid,expect.any(String)]);
  });
  it("rechecks a purchase after an earlier eligible preview even without a CL in the group",async()=>{
    expect((await previewProspectFollowups("2026-11-11")).groups[0]?.reason).toBeNull();
    mocks.customers=[{id:"buyer",customer_code:null,display_name:"Outro nome",phone:"5581989999000",has_purchase:true}];
    expect((await runProspectFollowups(now)).results).toMatchObject([{status:"skipped",reason:"already_purchased"}]);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("stops when the group was renamed to a client code",async()=>{
    mocks.info.mockResolvedValue({displayName:"CL1584 - Janfone Celulares",rawProfile:raw()});
    expect((await runProspectFollowups(now)).results).toMatchObject([{reason:"already_customer_code"}]);expect(mocks.send).not.toHaveBeenCalled();
    expect((await runProspectFollowups(now)).results).toMatchObject([{status:"already_handled"}]);
  });
  it("does not guess a mention when there are two customers",async()=>{
    const profile=raw();profile.participants.push({id:"333333333333333@lid",phoneNumber:"5511988888888@s.whatsapp.net"});
    mocks.info.mockResolvedValue({displayName:group.name,rawProfile:profile});
    expect((await runProspectFollowups(now)).results).toMatchObject([{reason:"multiple_customers"}]);expect(mocks.send).not.toHaveBeenCalled();
  });
  it("does not follow up groups created by an external person",async()=>{
    mocks.info.mockResolvedValue({displayName:group.name,rawProfile:{...raw(),owner:"222222222222222@lid"}});
    expect((await runProspectFollowups(now)).results).toMatchObject([{reason:"group_creator_not_team"}]);expect(mocks.send).not.toHaveBeenCalled();
  });
  it("requires recent sales and never sends after an unsuccessful sync",async()=>{
    mocks.fresh=false;
    await expect(runProspectFollowups(now)).rejects.toThrow("vendas atualizadas");
    expect(mocks.sync).toHaveBeenCalledOnce();expect(mocks.send).not.toHaveBeenCalled();
  });
  it("keeps a provider timeout claimed to prevent duplicate delivery",async()=>{
    mocks.send.mockRejectedValueOnce(new Error("provider timeout"));
    await runProspectFollowups(now);await runProspectFollowups(now);
    expect(mocks.send).toHaveBeenCalledOnce();
    expect(mocks.clientQuery).toHaveBeenCalledWith(expect.stringContaining("UPDATE sync_cursors"),[expect.any(String),expect.stringContaining('"status":"failed"')]);
    expect(mocks.clientQuery.mock.calls.some(call=>String(call[0]).includes("INSERT INTO message_logs"))).toBe(false);
  });
  it("does not act before 9h or while disabled",async()=>{
    await runProspectFollowups(new Date("2026-11-11T11:59:59Z"));mocks.env.WHATSAPP_PROSPECT_FOLLOWUP_ENABLED=false;await runProspectFollowups(now);
    expect(mocks.groups).not.toHaveBeenCalled();expect(mocks.send).not.toHaveBeenCalled();
  });
});
