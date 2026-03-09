import { parseConfig } from './config.js';
import { createBonfiresClient } from './bonfires-client.js';
import { InMemoryCaptureLedger } from './capture-ledger.js';
import { handleBeforeCompaction, handleSessionEnd } from './hooks.js';
import { bonfiresSearchTool } from './tools/bonfires-search.js';
import { bonfiresStackSearchTool } from './tools/bonfires-stack-search.js';
import { bonfiresIngestLinkTool } from './tools/bonfires-ingest-link.js';
import { bonfiresIngestLinksTool } from './tools/bonfires-ingest-links.js';
import { prepareIngestApprovalTool } from './tools/prepare-ingest-approval.js';
import { discoverLinksTool } from './tools/discover-links.js';
import { startStackHeartbeat } from './heartbeat.js';
import { startIngestionCron } from './ingestion.js';
import { createBonfiresContextEngine } from './context-engine.js';

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

  const agentDisplayNames: Record<string, string> = {};
  for (const a of (api.config?.agents?.list ?? [])) {
    if (a.id && a.name) agentDisplayNames[a.id] = a.name;
  }

  api.registerContextEngine?.('bonfires', () => createBonfiresContextEngine({ cfg, client, ledger, logger: api.logger, agentDisplayNames, defaultAgentId: Object.keys(cfg.agents)[0] }));
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

  api.registerTool((toolCtx) => ({
    name:'bonfires_prepare_ingest_approval',
    label:'Prepare an approval token for Bonfires link ingestion',
    description:'Mint a session-bound approval token for an exact user-approved URL set already observed in this session. Use this after the user explicitly approves specific shared or discovered URLs and before calling bonfires_ingest_links.',
    parameters:{
      type:'object',
      properties:{
        approvalContext:{
          type:'object',
          properties:{
            approvedByUser:{type:'boolean',const:true},
            approvedUrls:{type:'array',items:{type:'string'},minItems:1,maxItems:10},
          },
          required:['approvedByUser','approvedUrls'],
          additionalProperties:false,
        },
      },
      required:['approvalContext'],
      additionalProperties:false,
    },
    execute: async (_toolCallId, params) => {
      const result = await prepareIngestApprovalTool(params, toolCtx, {cfg});
      return { content: [{ type: 'text', text: JSON.stringify(result) }], details: result };
    },
  }));

  api.registerTool((toolCtx) => ({
    name:'bonfires_ingest_links',
    label:'Ingest approved links into Bonfires',
    description:'Ingest multiple links into your knowledge graph, but only after the user explicitly approves the exact URL set and you mint a session-bound approval token with bonfires_prepare_ingest_approval. Only pass approvalContext.approvalToken to execute ingestion.',
    parameters:{
      type:'object',
      properties:{
        approvalContext:{
          type:'object',
          properties:{
            approvalToken:{type:'string',minLength:1},
          },
          required:['approvalToken'],
          additionalProperties:false,
        },
      },
      required:['approvalContext'],
      additionalProperties:false,
    },
    execute: async (_toolCallId, params) => {
      const result = await bonfiresIngestLinksTool(params, toolCtx, {cfg, client, logger: api.logger});
      return { content: [{ type: 'text', text: JSON.stringify(result) }], details: result };
    },
  }));

  api.registerTool((toolCtx) => ({
    name:'discover_links',
    label:'Discover links for later approval',
    description:'Discover public-web links relevant to a query. This tool is feature-flagged and returns untrusted candidates that still require the user to approve a selected set and mint an approval token before any Bonfires ingestion.',
    parameters:{type:'object',properties:{query:{type:'string'},maxCandidates:{type:'number',minimum:1,maximum:25}},required:['query'],additionalProperties:false},
    execute: async (_toolCallId, params) => {
      const result = await discoverLinksTool(params, toolCtx, {cfg, logger: api.logger});
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
