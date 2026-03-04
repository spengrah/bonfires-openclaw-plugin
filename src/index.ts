import { parseConfig } from './config.js';
import { createBonfiresClient } from './bonfires-client.js';
import { InMemoryCaptureLedger } from './capture-ledger.js';
import { handleAgentEnd, handleBeforeAgentStart, handleSessionEnd } from './hooks.js';
import { bonfiresSearchTool } from './tools/bonfires-search.js';
import { startStackHeartbeat } from './heartbeat.js';
import { startIngestionCron } from './ingestion.js';

export default function register(api){
  const cfg=parseConfig(api.pluginConfig ?? {}, { logger: api.logger });
  const client=createBonfiresClient(cfg, api.logger);
  const resolvePath = typeof api.resolvePath === 'function' ? api.resolvePath : (p) => p;
  const stateDir=resolvePath(cfg.stateDir);
  const ledgerPath=resolvePath(`${cfg.stateDir}/capture-ledger.json`);
  const ledger=new InMemoryCaptureLedger(ledgerPath, stateDir);

  const recoveryCandidates = [
    api.getPersistedSessions,
    api.getSessionTranscripts,
    api.listSessionTranscripts,
    api.recoverySource,
  ];
  const recoveryFn = recoveryCandidates.find((fn) => typeof fn === 'function');

  const stopHeartbeat = startStackHeartbeat({
    cfg,
    client,
    ledger,
    logger: api.logger,
    statePath: resolvePath(`${cfg.stateDir}/heartbeat-state.json`),
    recoverySource: recoveryFn ? () => recoveryFn() : undefined,
  });

  // Wire profiles and agentProfiles into ingestion cron (PM6-R1, PM6-R2)
  const profiles = cfg.ingestion.profiles;
  const agentProfiles = cfg.ingestion.agentProfiles;
  const defaultProfile = cfg.ingestion.defaultProfile;

  const stopIngestion = startIngestionCron({
    enabled: cfg.ingestion.enabled,
    everyMinutes: cfg.ingestion.everyMinutes,
    rootDir: cfg.ingestion.rootDir,
    ledgerPath: resolvePath(cfg.ingestion.ledgerPath),
    summaryPath: resolvePath(cfg.ingestion.summaryPath),
    client,
    logger: api.logger,
    profiles: Object.keys(profiles).length > 0 ? profiles : undefined,
    agentProfiles: Object.keys(agentProfiles).length > 0 ? agentProfiles : undefined,
    defaultProfile,
  });

  api.on('before_agent_start',(event,ctx)=>handleBeforeAgentStart(event,ctx,{cfg,client,logger:api.logger}));
  api.on('agent_end',(event,ctx)=>handleAgentEnd(event,ctx,{cfg,client,ledger,logger:api.logger}));
  api.on('session_end',(event,ctx)=>handleSessionEnd(event,ctx,{cfg,client,ledger,logger:api.logger}));
  api.registerTool({
    name:'bonfires_search',
    description:'Search Bonfires memories',
    parameters:{type:'object',properties:{query:{type:'string'},limit:{type:'number',minimum:1,maximum:50}},required:['query']},
    execute: async (params,ctx)=>bonfiresSearchTool(params,ctx,{cfg,client,logger:api.logger})
  });

  // Return dispose handle for lifecycle management (PM5-R5).
  // If the host calls this, background loops stop deterministically.
  return {
    dispose() {
      stopHeartbeat?.();
      stopIngestion?.();
    },
  };
}
