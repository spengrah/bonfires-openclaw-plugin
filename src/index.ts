import { parseConfig } from './config.js';
import { createBonfiresClient } from './bonfires-client.js';
import { InMemoryCaptureLedger } from './capture-ledger.js';
import { handleAgentEnd, handleBeforeAgentStart, handleSessionEnd } from './hooks.js';
import { bonfiresSearchTool } from './tools/bonfires-search.js';

export default function register(api){
  const cfg=parseConfig(api.pluginConfig ?? {});
  const client=createBonfiresClient(cfg, api.logger);
  const logDir=api.resolvePath?.('.ai/log') ?? '.ai/log';
  const ledgerPath=api.resolvePath?.('.ai/log/bonfires-ledger.json') ?? '.ai/log/bonfires-ledger.json';
  const ledger=new InMemoryCaptureLedger(ledgerPath, logDir);

  api.on('before_agent_start',(event,ctx)=>handleBeforeAgentStart(event,ctx,{cfg,client,logger:api.logger}));
  api.on('agent_end',(event,ctx)=>handleAgentEnd(event,ctx,{cfg,client,ledger,logger:api.logger}));
  api.on('session_end',(event,ctx)=>handleSessionEnd(event,ctx,{logger:api.logger}));
  api.registerTool({
    name:'bonfires_search',
    description:'Search Bonfires memories',
    parameters:{type:'object',properties:{query:{type:'string'},limit:{type:'number',minimum:1,maximum:50}},required:['query']},
    execute: async (params,ctx)=>bonfiresSearchTool(params,ctx,{cfg,client,logger:api.logger})
  });
}
