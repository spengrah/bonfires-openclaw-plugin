import { captureBonfiresTurn, mergeSystemGuidance, retrieveBonfiresContext } from './hooks.js';

type LoggerLike = { warn?: (msg: string) => void };

type ContextEngineDeps = {
  cfg: any;
  client: any;
  ledger: any;
  logger?: LoggerLike;
  agentDisplayNames?: Record<string, string>;
  /**
   * OpenClaw's context-engine lifecycle currently provides `sessionId` but not a distinct
   * routing `sessionKey`, so the plugin uses that `sessionId` as the capture key inside the
   * engine-owned path. Legacy hook paths still receive a real `sessionKey` from hook context.
   */
  defaultAgentId: string;
};

type ContextEngineAfterTurnParams = {
  sessionId?: string;
  sessionFile?: string;
  prePromptMessageCount?: number;
  messages?: any[];
};

type ContextEngineAssembleParams = {
  sessionId?: string;
  messages?: any[];
  tokenBudget?: number;
};

export function createBonfiresContextEngine(deps: ContextEngineDeps) {
  return {
    info: {
      id: 'bonfires',
      name: 'Bonfires Context Engine',
    },

    async ingest() {
      return { ingested: false };
    },

    async afterTurn(params: ContextEngineAfterTurnParams) {
      try {
        const prePromptMessageCount = typeof params?.prePromptMessageCount === 'number' && Number.isFinite(params.prePromptMessageCount)
          ? params.prePromptMessageCount
          : 0;
        const sessionId = typeof params?.sessionId === 'string' && params.sessionId ? params.sessionId : undefined;
        if (!sessionId) {
          deps.logger?.warn?.('context_engine afterTurn: missing sessionId, skipping capture');
          return;
        }
        await captureBonfiresTurn(params?.messages ?? [], {
          agentId: deps.defaultAgentId,
          sessionKey: sessionId,
          sessionId,
        }, deps, { startIndex: prePromptMessageCount });
      } catch (e: any) {
        deps.logger?.warn?.(`context_engine afterTurn error: ${e?.message ?? e}`);
      }
    },

    async assemble(params: ContextEngineAssembleParams) {
      const baseMessages = Array.isArray(params?.messages) ? params.messages : [];
      try {
        const cfg = deps.cfg;
        const systemGuidance = cfg.retrieval?.systemGuidance;
        const dynamicRetrievalEnabled = Boolean(cfg.retrieval?.enableDynamicRetrieval);
        if (!baseMessages.length) {
          return {
            messages: baseMessages,
            estimatedTokens: 0,
            systemPromptAddition: systemGuidance,
          };
        }

        let prependContext: string | undefined;
        let systemPromptAddition = systemGuidance;
        if (dynamicRetrievalEnabled) {
          const lastUser = [...baseMessages].reverse().find((m: any) => m?.role === 'user');
          const prompt = typeof lastUser?.content === 'string' ? lastUser.content : '';
          const sessionId = typeof params?.sessionId === 'string' && params.sessionId ? params.sessionId : undefined;
          if (!sessionId) {
            deps.logger?.warn?.('context_engine assemble: missing sessionId, proceeding without session scope');
          }
          const retrieved = await retrieveBonfiresContext(prompt, {
            agentId: deps.defaultAgentId,
            sessionId,
            sessionKey: sessionId,
          }, deps, { includeDynamicRetrieval: true, allowRawPrompt: true });
          prependContext = retrieved?.prependContext;
          systemPromptAddition = mergeSystemGuidance(retrieved?.systemGuidance, undefined) ?? systemGuidance;
        }

        const messages = prependContext
          ? [{ role: 'system', content: prependContext }, ...baseMessages]
          : baseMessages;

        return {
          messages,
          estimatedTokens: Math.max(0, Math.min(params?.tokenBudget ?? 0, JSON.stringify(messages).length / 4)),
          systemPromptAddition: systemPromptAddition,
        };
      } catch (e: any) {
        deps.logger?.warn?.(`context_engine assemble error: ${e?.message ?? e}`);
        return {
          messages: baseMessages,
          estimatedTokens: Math.max(0, Math.min(params?.tokenBudget ?? 0, JSON.stringify(baseMessages).length / 4)),
          systemPromptAddition: deps.cfg.retrieval?.systemGuidance,
        };
      }
    },

    async compact() {
      return { ok: true, compacted: false, reason: 'bonfires plugin does not own compaction' };
    },
  };
}
