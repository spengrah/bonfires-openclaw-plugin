import { resolveBonfiresAgentId } from './config.js';

function formatPrepend(results){
  const head='--- Bonfires context ---\n'; const tail='\n---'; let body='';
  for(const r of results){ const line=`- ${r.summary} (source: ${r.source}, relevance: ${r.score})\n`; if((head+body+line+tail).length>2000) break; body+=line; }
  return body ? head+body.trimEnd()+tail : '';
}

export async function handleBeforeAgentStart(event, ctx, deps){
  try{
    const raw=String(event?.prompt ?? '').trim(); if(!raw) return;
    const query=raw.slice(0,500);
    const agent=resolveBonfiresAgentId(deps.cfg, ctx.agentId);
    if(!agent){ deps.logger?.warn?.(`No bonfires agent mapping for ${ctx.agentId ?? 'unknown'}`); return; }
    const res=await deps.client.search({agentId:agent, query, limit:deps.cfg.search.maxResults});
    const prependContext=formatPrepend(res.results ?? []);
    return prependContext ? {prependContext} : undefined;
  }catch(e){ deps.logger?.warn?.(`before_agent_start error: ${e?.message ?? e}`); return; }
}

export async function handleAgentEnd(event, ctx, deps){
  try{
    const sessionKey=ctx.sessionKey; if(!sessionKey) return;
    const agent=resolveBonfiresAgentId(deps.cfg, ctx.agentId); if(!agent){ deps.logger?.warn?.(`No bonfires agent mapping for ${ctx.agentId ?? 'unknown'}`); return; }
    const msgs=event.messages ?? []; const now=deps.nowMs?deps.nowMs():Date.now(); const throttleMs=deps.cfg.capture.throttleMinutes*60000;
    const mark=deps.ledger.get(sessionKey); if(mark && now-mark.lastPushedAt < throttleMs) return;
    const start=mark ? mark.lastPushedIndex+1 : 0; const slice=msgs.slice(start); if(!slice.length) return;
    await deps.client.capture({agentId:agent, sessionKey, messages:slice});
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
    const start=mark ? mark.lastPushedIndex+1 : 0;
    const endIndex=msgs.length-1;
    if(endIndex <= (mark?.lastPushedIndex ?? -1)) return;

    const slice=msgs.slice(start);
    await deps.client.capture({agentId:agent, sessionKey, messages:slice});
    deps.ledger.set(sessionKey,{lastPushedAt:deps.nowMs?deps.nowMs():Date.now(),lastPushedIndex:endIndex});
  }catch(e){ deps.logger?.warn?.(`session_end error: ${e?.message ?? e}`); }
}
