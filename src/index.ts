import { parseConfig } from './config.js';
import { createBonfiresClient } from './bonfires-client.js';
import { InMemoryCaptureLedger } from './capture-ledger.js';
import { handleAgentEnd, handleBeforeAgentStart, handleBeforeCompaction, handleSessionEnd } from './hooks.js';
import { bonfiresSearchTool } from './tools/bonfires-search.js';
import { bonfiresStackSearchTool } from './tools/bonfires-stack-search.js';
import { bonfiresIngestLinkTool } from './tools/bonfires-ingest-link.js';
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

  // Build agent display name map from OpenClaw agent config (PM13)
  const agentDisplayNames: Record<string, string> = {};
  for (const a of (api.config?.agents?.list ?? [])) {
    if (a.id && a.name) agentDisplayNames[a.id] = a.name;
  }

  api.on('before_agent_start',(event,ctx)=>handleBeforeAgentStart(event,ctx,{cfg,client,ledger,logger:api.logger}));
  api.on('agent_end',(event,ctx)=>handleAgentEnd(event,ctx,{cfg,client,ledger,logger:api.logger,agentDisplayNames}));
  api.on('session_end',(event,ctx)=>handleSessionEnd(event,ctx,{cfg,client,ledger,logger:api.logger,agentDisplayNames}));
  api.on('before_compaction',(event,ctx)=>handleBeforeCompaction(event,ctx,{cfg,client,ledger,logger:api.logger}));

  api.registerTool((toolCtx) => ({
    name:'bonfires_search',
    label:'Search Bonfires knowledge graph',
    description:'Search your knowledge graph for relevant context. This includes memories from previous conversations, ingested documents, files, media, and other knowledge sources. Use when you need to recall preferences, decisions, facts, history, or reference material that may not be in your current conversation.',
    parameters:{type:'object',properties:{query:{type:'string'},limit:{type:'number',minimum:1,maximum:50}},required:['query']},
    execute: async (_toolCallId, params) => {
      const result = await bonfiresSearchTool(params, toolCtx, {cfg, client, logger: api.logger});
      return { content: [{ type: 'text', text: JSON.stringify(result) }], details: result };
    },
  }));

  api.registerTool((toolCtx) => ({
    name:'bonfires_stack_search',
    label:'Search recent unprocessed messages',
    description:'Search your recent unprocessed conversation messages. Use when you need to find something said recently in the current or recent conversations that may not yet be in the knowledge graph.',
    parameters:{type:'object',properties:{query:{type:'string'},limit:{type:'number',minimum:1,maximum:100}},required:['query']},
    execute: async (_toolCallId, params) => {
      const result = await bonfiresStackSearchTool(params, toolCtx, {cfg, client, logger: api.logger});
      return { content: [{ type: 'text', text: JSON.stringify(result) }], details: result };
    },
  }));

  api.registerTool((toolCtx) => ({
    name:'bonfires_ingest_link',
    label:'Ingest a link into Bonfires',
    description:'Ingest content from a URL into your knowledge graph. Use this when the user shares a link and explicitly asks to save or ingest it. Always confirm with the user before calling this tool.',
    parameters:{type:'object',properties:{url:{type:'string',description:'The URL to fetch and ingest'}},required:['url']},
    execute: async (_toolCallId, params) => {
      const result = await bonfiresIngestLinkTool(params, toolCtx, {cfg, client, logger: api.logger});
      return { content: [{ type: 'text', text: JSON.stringify(result) }], details: result };
    },
  }));

  return {
    dispose() {
      stopHeartbeat?.();
      stopIngestion?.();
    },
  };
}
