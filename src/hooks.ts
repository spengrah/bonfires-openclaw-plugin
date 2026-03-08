import { resolveBonfiresAgentId } from './config.js';
import { extractUserMessage, hasUserMetadata } from './message-utils.js';

export { extractUserMessage, hasUserMetadata };

function formatPrepend(results){
  const head='--- Bonfires context ---\n'; const tail='\n---'; let body='';
  for(const r of results){ const line=`- ${r.summary} (source: ${r.source}, relevance: ${r.score})\n`; if((head+body+line+tail).length>2000) break; body+=line; }
  return body ? head+body.trimEnd()+tail : '';
}

export async function handleBeforeAgentStart(event, ctx, deps){
  try{
    const raw=String(event?.prompt ?? '').trim(); if(!raw) return;
    // Skip system-generated messages (session reset, cron, etc.) — no metadata wrapper
    if(!hasUserMetadata(raw)) return;
    const query=extractUserMessage(raw).slice(0,500);
    if(!query) return;
    const agent=resolveBonfiresAgentId(deps.cfg, ctx.agentId);
    if(!agent){ deps.logger?.warn?.(`No bonfires agent mapping for ${ctx.agentId ?? 'unknown'}`); return; }

    // PM12: Only auto-inject on first message of session
    const sessionId = ctx.sessionId;
    if (sessionId && deps.ledger?.hasInjected?.(sessionId)) return;

    const res=await deps.client.search({agentId:agent, query, limit:deps.cfg.search.maxResults});

    // PM12: Mark session as injected after successful search
    if (sessionId) deps.ledger?.markInjected?.(sessionId);

    const prependContext=formatPrepend(res.results ?? []);
    return prependContext ? {prependContext} : undefined;
  }catch(e){ deps.logger?.warn?.(`before_agent_start error: ${e?.message ?? e}`); return; }
}

export async function handleAgentEnd(event, ctx, deps){
  try{
    const sessionKey=ctx.sessionKey; if(!sessionKey) return;
    const agent=resolveBonfiresAgentId(deps.cfg, ctx.agentId); if(!agent){ deps.logger?.warn?.(`No bonfires agent mapping for ${ctx.agentId ?? 'unknown'}`); return; }
    const msgs=event.messages ?? [];
    const mark=deps.ledger.get(sessionKey);
    let start=mark ? mark.lastPushedIndex+1 : 0;
    if(mark && mark.lastPushedIndex >= msgs.length){ deps.logger?.warn?.(`agent_end watermark reset: lastPushedIndex=${mark.lastPushedIndex} >= msgs.length=${msgs.length} for ${sessionKey}`); start=0; }
    const slice=msgs.slice(start); if(!slice.length) return;
    const agentDisplayName = deps.agentDisplayNames?.[ctx.agentId] ?? ctx.agentId;
    const roles = slice.map(m => m.role);
    const conversational = slice.filter(m => m.role === 'user' || m.role === 'assistant');
    deps.logger?.warn?.(`agent_end capture: ${slice.length} msgs (roles: ${roles.join(',')}), ${conversational.length} conversational, displayName=${agentDisplayName}`);
    await deps.client.capture({agentId:agent, sessionKey, sessionId: ctx.sessionId, messages:slice, agentDisplayName});
    const now=deps.nowMs?deps.nowMs():Date.now();
    deps.ledger.set(sessionKey,{lastPushedAt:now,lastPushedIndex:msgs.length-1});
  }catch(e){ deps.logger?.warn?.(`agent_end error: ${e?.message ?? e}`); }
}

export async function handleSessionEnd(event, ctx, deps){
  try{
    const sessionKey=ctx?.sessionKey; if(!sessionKey) return;
    const agent=resolveBonfiresAgentId(deps.cfg, ctx.agentId); if(!agent){ deps.logger?.warn?.(`No bonfires agent mapping for ${ctx.agentId ?? 'unknown'}`); return; }
    const msgs = Array.isArray(event?.messages) ? event.messages : [];
    if(!msgs.length) return;

    const mark=deps.ledger.get(sessionKey);
    let start=mark ? mark.lastPushedIndex+1 : 0;
    if(mark && mark.lastPushedIndex >= msgs.length){ deps.logger?.warn?.(`session_end watermark reset: lastPushedIndex=${mark.lastPushedIndex} >= msgs.length=${msgs.length} for ${sessionKey}`); start=0; }
    const endIndex=msgs.length-1;
    if(endIndex < 0) return;

    const slice=msgs.slice(start); if(!slice.length) return;
    const agentDisplayName = deps.agentDisplayNames?.[ctx.agentId] ?? ctx.agentId;
    await deps.client.capture({agentId:agent, sessionKey, sessionId: ctx.sessionId, messages:slice, agentDisplayName});
    deps.ledger.set(sessionKey,{lastPushedAt:deps.nowMs?deps.nowMs():Date.now(),lastPushedIndex:endIndex});
    // Finalize pending episodes before session closes
    try{ await deps.client.processStack?.({agentId:agent}); }catch(pe){ deps.logger?.warn?.(`session_end processStack: ${pe?.message ?? pe}`); }
  }catch(e){ deps.logger?.warn?.(`session_end error: ${e?.message ?? e}`); }
}


export async function handleBeforeCompaction(event, ctx, deps){
  try{
    const sessionKey=ctx?.sessionKey; if(!sessionKey) return;
    const agent=resolveBonfiresAgentId(deps.cfg, ctx.agentId);
    if(!agent){ deps.logger?.warn?.(`No bonfires agent mapping for ${ctx.agentId ?? 'unknown'}`); return; }
    // Finalize pending stack messages into episodes before compaction rewrites transcript
    try{ await deps.client.processStack?.({agentId:agent}); }catch(pe){ deps.logger?.warn?.(`before_compaction processStack: ${pe?.message ?? pe}`); }
    // Reset watermark — transcript will be rewritten, indices invalidated
    deps.ledger.set(sessionKey,{lastPushedAt:deps.nowMs?deps.nowMs():Date.now(),lastPushedIndex:-1});
  }catch(e){ deps.logger?.warn?.(`before_compaction error: ${e?.message ?? e}`); }
}
