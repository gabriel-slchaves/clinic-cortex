import type pino from "pino";
import { HttpError } from "../../errors.js";
import { GeminiClient } from "../../integrations/llm/GeminiClient.js";
import { MetaCrypto } from "../../integrations/meta/MetaCrypto.js";
import { MetaGraphClient } from "../../integrations/meta/MetaGraphClient.js";
import {
  type AgentRunRow,
  asJsonObject,
  cleanString,
  ensureString,
  normalizeTextContent,
  type JsonValue,
  type ConversationJobRow,
  type WhatsAppMessageRow,
} from "./shared.js";
import { WhatsAppRepository } from "../../repositories/supabase/WhatsAppRepository.js";

type TeamServiceLogger = Pick<pino.Logger, "warn" | "error">;

type AgentRuntimeDependencies = {
  repository: WhatsAppRepository;
  graphClient: MetaGraphClient;
  crypto: MetaCrypto;
  graphVersion: string;
  geminiApiKey: string;
  agentModel: string;
  historyLimit: number;
  fetchFn: typeof fetch;
  now: () => Date;
  randomUUID: () => string;
  log: TeamServiceLogger;
};

type SendOfficialMessageInput = {
  sourceMessageId: string;
  originJobId: string;
  agentRunId: string;
  text: string;
};

type ConversationHistoryEntry = {
  id: string;
  fromMe: boolean;
  text: string;
  occurredAt: string | null;
};

type AgentDecision =
  | {
      decision: "reply";
      replyText: string;
      handoffReason?: string | null;
      ignoreReason?: string | null;
    }
  | {
      decision: "handoff";
      handoffReason: string;
      replyText?: string | null;
      ignoreReason?: string | null;
    }
  | {
      decision: "ignore";
      ignoreReason?: string | null;
      handoffReason?: string | null;
      replyText?: string | null;
    }
  | {
      decision: "error";
      handoffReason?: string | null;
      ignoreReason?: string | null;
      replyText?: string | null;
    };

type GeminiDecisionResult = {
  modelName: string;
  requestPayload: Record<string, JsonValue>;
  responsePayload: JsonValue;
  parsedDecision: AgentDecision;
};

class AmbiguousSendStateError extends Error {
  constructor(
    message: string,
    public readonly outboundMessageId: string | null = null
  ) {
    super(message);
    this.name = "AmbiguousSendStateError";
  }
}

function mergeJsonObject(
  existing: JsonValue | null,
  patch: Record<string, JsonValue>
) {
  return {
    ...asJsonObject(existing),
    ...patch,
  } as JsonValue;
}

function formatHistoryForPrompt(history: ConversationHistoryEntry[]) {
  if (!history.length) {
    return "Sem histórico prévio disponível.";
  }

  return history
    .map((entry, index) => {
      const speaker = entry.fromMe ? "CLINICA" : "PACIENTE";
      const timestamp = entry.occurredAt ? ` (${entry.occurredAt})` : "";
      return `${index + 1}. ${speaker}${timestamp}: ${entry.text}`;
    })
    .join("\n");
}

function extractTextFromGeminiResponse(payload: Record<string, unknown>) {
  const candidates = Array.isArray(payload.candidates)
    ? payload.candidates
    : [];
  for (const candidate of candidates) {
    const content = asJsonObject(asJsonObject(candidate).content);
    const parts = Array.isArray(content.parts) ? content.parts : [];
    const text = parts
      .map(part => cleanString(asJsonObject(part).text))
      .filter(Boolean)
      .join("\n")
      .trim();

    if (text) return text;
  }

  return "";
}

function parseAgentDecisionPayload(rawText: string): AgentDecision {
  const normalized = rawText
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(normalized) as Record<string, unknown>;
  } catch (error) {
    throw new Error(
      `O provider Gemini não retornou um JSON válido para a decisão do agente: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const decision = cleanString(payload.decision).toLowerCase();
  if (
    decision !== "reply" &&
    decision !== "handoff" &&
    decision !== "ignore" &&
    decision !== "error"
  ) {
    throw new Error("A decisão do agente é inválida ou não foi informada.");
  }

  const replyText = normalizeTextContent(payload.replyText);
  const handoffReason = normalizeTextContent(payload.handoffReason);
  const ignoreReason = normalizeTextContent(payload.ignoreReason);

  if (decision === "reply" && !replyText) {
    throw new Error("A decisão reply exige replyText preenchido.");
  }

  if (decision === "handoff" && !handoffReason) {
    throw new Error("A decisão handoff exige handoffReason preenchido.");
  }

  if (decision === "reply") {
    return {
      decision,
      replyText: replyText!,
      handoffReason,
      ignoreReason,
    };
  }

  if (decision === "handoff") {
    return {
      decision,
      handoffReason: handoffReason!,
      replyText,
      ignoreReason,
    };
  }

  if (decision === "ignore") {
    return {
      decision,
      ignoreReason,
      handoffReason,
      replyText,
    };
  }

  return {
    decision,
    handoffReason,
    ignoreReason,
    replyText,
  };
}

async function callGeminiForDecision(
  deps: AgentRuntimeDependencies,
  input: {
    prompt: string;
    sourceMessage: WhatsAppMessageRow;
    history: ConversationHistoryEntry[];
  }
): Promise<GeminiDecisionResult> {
  const latestPatientMessage =
    normalizeTextContent(input.sourceMessage.text_body) || "";
  const historyText = formatHistoryForPrompt(input.history);
  const requestPayload = {
    systemInstruction: {
      parts: [
        {
          text: [
            input.prompt,
            "",
            "Você está operando o runtime WhatsApp da ClinicCortex.",
            "Responda somente em JSON.",
            'Use exatamente um dos valores: "reply", "handoff", "ignore", "error".',
            'Schema esperado: {"decision":"reply|handoff|ignore|error","replyText?:string","handoffReason?:string","ignoreReason?:string"}.',
            "Se a melhor decisão for responder, replyText deve ser curto, claro e apropriado para WhatsApp.",
            "Se faltar contexto, houver risco clínico, necessidade humana ou pedido fora das regras do prompt, prefira handoff.",
            "Se a mensagem não exigir resposta ou não tiver ação útil, use ignore.",
          ].join("\n"),
        },
      ],
    },
    contents: [
      {
        role: "user",
        parts: [
          {
            text: [
              `Mensagem mais recente do paciente: ${latestPatientMessage}`,
              "",
              "Histórico recente da conversa:",
              historyText,
            ].join("\n"),
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
    },
  } as Record<string, JsonValue>;

  let parsedBody: Record<string, unknown> = {};
  try {
    const geminiClient = new GeminiClient(deps.geminiApiKey, deps.fetchFn);
    parsedBody = await geminiClient.generateContent(
      deps.agentModel,
      requestPayload
    );
  } catch (error) {
    throw new HttpError(
      502,
      "O provider Gemini não retornou uma decisão válida para o WhatsApp.",
      {
        error: error instanceof Error ? error.message : String(error),
      }
    );
  }

  const rawDecisionText = extractTextFromGeminiResponse(parsedBody);
  if (!rawDecisionText) {
    throw new Error(
      "O provider Gemini não retornou conteúdo textual utilizável para a decisão do agente."
    );
  }

  return {
    modelName: deps.agentModel,
    requestPayload,
    responsePayload: parsedBody as JsonValue,
    parsedDecision: parseAgentDecisionPayload(rawDecisionText),
  };
}

async function insertOutboundDraft(
  deps: AgentRuntimeDependencies,
  input: {
    sourceMessage: WhatsAppMessageRow;
    originJobId: string;
    agentRunId: string;
    text: string;
    occurredAt: string;
  }
) {
  const existing = await deps.repository.getOutboundByOriginJobId(
    input.originJobId
  );
  if (existing) {
    return existing;
  }

  return deps.repository.upsertMessage({
    clinic_id: input.sourceMessage.clinic_id,
    connection_id: input.sourceMessage.connection_id,
    provider: "meta_cloud_api",
    provider_message_id: null,
    contact_wa_id: input.sourceMessage.contact_wa_id,
    from_me: true,
    message_type: "text",
    text_body: input.text,
    provider_message_status: null,
    provider_timestamp: null,
    conversation_category: null,
    pricing_payload: null,
    error_code: null,
    error_message: null,
    raw_json: {
      source_message_id: input.sourceMessage.id,
      origin_job_id: input.originJobId,
      agent_run_id: input.agentRunId,
    } as JsonValue,
    received_at: input.occurredAt,
    created_at: input.occurredAt,
    updated_at: input.occurredAt,
    reply_to_message_id: input.sourceMessage.id,
    origin_job_id: input.originJobId,
    agent_run_id: input.agentRunId,
    send_state: "dispatching",
  });
}

async function resolveConnectionForSend(
  deps: AgentRuntimeDependencies,
  connectionId: string
) {
  const connection = await deps.repository.getConnectionById(connectionId);
  if (!connection) {
    throw new HttpError(404, "Conexão WhatsApp não encontrada para envio.");
  }

  if (!cleanString(connection.phone_number_id)) {
    throw new HttpError(
      409,
      "A conexão WhatsApp ainda não possui phone_number_id para envio oficial."
    );
  }

  return connection;
}

async function performMetaSend(
  deps: AgentRuntimeDependencies,
  input: {
    sourceMessage: WhatsAppMessageRow;
    accessToken: string;
    phoneNumberId: string;
    text: string;
  }
) {
  const requestPayload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: ensureString(input.sourceMessage.contact_wa_id, "contact_wa_id", 409),
    type: "text",
    text: {
      body: input.text,
      preview_url: false,
    },
    ...(cleanString(input.sourceMessage.provider_message_id)
      ? {
          context: {
            message_id: cleanString(input.sourceMessage.provider_message_id),
          },
        }
      : {}),
  } as Record<string, JsonValue>;

  let response: Awaited<ReturnType<MetaGraphClient["sendTextMessage"]>>;
  try {
    response = await deps.graphClient.sendTextMessage({
      accessToken: input.accessToken,
      phoneNumberId: input.phoneNumberId,
      toWaId: ensureString(input.sourceMessage.contact_wa_id, "contact_wa_id", 409),
      textBody: input.text,
      replyToProviderMessageId: cleanString(input.sourceMessage.provider_message_id) || null,
    });
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    throw new AmbiguousSendStateError(
      `Falha ambígua ao enviar a resposta oficial do WhatsApp: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (!response.providerMessageId) {
    throw new AmbiguousSendStateError(
      "A Meta confirmou o envio, mas não retornou provider_message_id para a outbound."
    );
  }

  return {
    requestPayload,
    responsePayload: response.raw as JsonValue,
    providerMessageId: response.providerMessageId,
  };
}

export async function sendOfficialWhatsAppMessage(
  deps: AgentRuntimeDependencies,
  input: SendOfficialMessageInput
) {
  const sourceMessageId = ensureString(input.sourceMessageId, "sourceMessageId");
  const originJobId = ensureString(input.originJobId, "originJobId");
  const agentRunId = ensureString(input.agentRunId, "agentRunId");
  const normalizedText = normalizeTextContent(input.text);
  if (!normalizedText) {
    throw new HttpError(
      400,
      "text é obrigatório para o envio oficial da mensagem do WhatsApp."
    );
  }

  const sourceMessage = await deps.repository.getMessageById(sourceMessageId);
  if (!sourceMessage) {
    throw new HttpError(404, "Mensagem inbound do WhatsApp não encontrada.");
  }

  if (sourceMessage.from_me) {
    throw new HttpError(
      409,
      "O sender oficial do WhatsApp exige uma mensagem inbound como origem."
    );
  }

  const existingOutbound = await deps.repository.getOutboundByOriginJobId(
    originJobId
  );
  if (existingOutbound) {
    return existingOutbound;
  }

  const connection = await resolveConnectionForSend(
    deps,
    sourceMessage.connection_id
  );
  const credentials = await deps.repository.getConnectionCredentials(
    sourceMessage.connection_id
  );
  if (!credentials?.encrypted_access_token) {
    throw new HttpError(
      409,
      "A conexão WhatsApp não possui credenciais oficiais válidas para envio."
    );
  }

  const accessToken = deps.crypto.decrypt(credentials.encrypted_access_token);
  const occurredAt = deps.now().toISOString();
  const outboundDraft = await insertOutboundDraft(deps, {
    sourceMessage,
    originJobId,
    agentRunId,
    text: normalizedText,
    occurredAt,
  });

  if (!outboundDraft) {
    throw new HttpError(500, "Não foi possível preparar a outbound do WhatsApp.");
  }

  if (cleanString(outboundDraft.provider_message_id)) {
    return outboundDraft;
  }

  try {
    const metaResponse = await performMetaSend(deps, {
      sourceMessage,
      accessToken,
      phoneNumberId: ensureString(connection.phone_number_id, "phone_number_id", 409),
      text: normalizedText,
    });

    return deps.repository.upsertMessage({
      clinic_id: outboundDraft.clinic_id,
      connection_id: outboundDraft.connection_id,
      provider: "meta_cloud_api",
      provider_message_id: metaResponse.providerMessageId,
      contact_wa_id: outboundDraft.contact_wa_id,
      from_me: true,
      message_type: outboundDraft.message_type,
      text_body: outboundDraft.text_body,
      provider_message_status: "accepted",
      provider_timestamp: deps.now().toISOString(),
      conversation_category: outboundDraft.conversation_category,
      pricing_payload: outboundDraft.pricing_payload,
      error_code: null,
      error_message: null,
      raw_json: mergeJsonObject(outboundDraft.raw_json, {
        send_request: metaResponse.requestPayload as JsonValue,
        send_response: metaResponse.responsePayload,
      }),
      received_at: outboundDraft.received_at,
      created_at: outboundDraft.created_at,
      updated_at: deps.now().toISOString(),
      reply_to_message_id: outboundDraft.reply_to_message_id,
      origin_job_id: outboundDraft.origin_job_id,
      agent_run_id: outboundDraft.agent_run_id,
      send_state: "sent",
    });
  } catch (error) {
    if (error instanceof AmbiguousSendStateError) {
      const updated = await deps.repository.upsertMessage({
        clinic_id: outboundDraft.clinic_id,
        connection_id: outboundDraft.connection_id,
        provider: "meta_cloud_api",
        provider_message_id: outboundDraft.provider_message_id,
        contact_wa_id: outboundDraft.contact_wa_id,
        from_me: true,
        message_type: outboundDraft.message_type,
        text_body: outboundDraft.text_body,
        provider_message_status: (outboundDraft.provider_message_status ||
          null) as
          | "accepted"
          | "sent"
          | "delivered"
          | "read"
          | "failed"
          | null,
        provider_timestamp: outboundDraft.provider_timestamp,
        conversation_category: outboundDraft.conversation_category,
        pricing_payload: outboundDraft.pricing_payload,
        error_code: outboundDraft.error_code,
        error_message: outboundDraft.error_message,
        raw_json: mergeJsonObject(outboundDraft.raw_json, {
          send_error: {
            type: "ambiguous_provider_state",
            message: error.message,
          } as JsonValue,
        }),
        received_at: outboundDraft.received_at,
        created_at: outboundDraft.created_at,
        updated_at: deps.now().toISOString(),
        reply_to_message_id: outboundDraft.reply_to_message_id,
        origin_job_id: outboundDraft.origin_job_id,
        agent_run_id: outboundDraft.agent_run_id,
        send_state: "provider_ack_unknown",
      });

      throw new AmbiguousSendStateError(
        error.message,
        updated?.id || null
      );
    }

    if (error instanceof HttpError) {
      await deps.repository.upsertMessage({
        clinic_id: outboundDraft.clinic_id,
        connection_id: outboundDraft.connection_id,
        provider: "meta_cloud_api",
        provider_message_id: outboundDraft.provider_message_id,
        contact_wa_id: outboundDraft.contact_wa_id,
        from_me: true,
        message_type: outboundDraft.message_type,
        text_body: outboundDraft.text_body,
        provider_message_status: (outboundDraft.provider_message_status ||
          null) as
          | "accepted"
          | "sent"
          | "delivered"
          | "read"
          | "failed"
          | null,
        provider_timestamp: outboundDraft.provider_timestamp,
        conversation_category: outboundDraft.conversation_category,
        pricing_payload: outboundDraft.pricing_payload,
        error_code: outboundDraft.error_code,
        error_message: outboundDraft.error_message,
        raw_json: mergeJsonObject(outboundDraft.raw_json, {
          send_error: {
            type: "provider_rejected",
            message: error.message,
            diagnostic: (error.details || null) as JsonValue,
          } as JsonValue,
        }),
        received_at: outboundDraft.received_at,
        created_at: outboundDraft.created_at,
        updated_at: deps.now().toISOString(),
        reply_to_message_id: outboundDraft.reply_to_message_id,
        origin_job_id: outboundDraft.origin_job_id,
        agent_run_id: outboundDraft.agent_run_id,
        send_state: outboundDraft.send_state,
      });
    }

    throw error;
  }
}

async function processConversationJob(
  deps: AgentRuntimeDependencies,
  job: ConversationJobRow,
  occurredAt: string
) {
  const sourceMessage = await deps.repository.getMessageById(job.source_message_id);
  if (!sourceMessage) {
    throw new HttpError(
      404,
      "A mensagem inbound de origem do job conversacional não foi encontrada."
    );
  }

  const history = await deps.repository.listConversationHistory({
    clinicId: job.clinic_id,
    connectionId: job.connection_id,
    contactWaId: job.contact_wa_id,
    limit: deps.historyLimit,
  });
  const assistantPrompt = await deps.repository.getClinicAssistantPrompt(
    job.clinic_id
  );
  const initialRun = await deps.repository.createAgentRun({
    job_id: job.id,
    attempt_number: job.attempt_count,
    clinic_id: job.clinic_id,
    connection_id: job.connection_id,
    source_message_id: job.source_message_id,
    contact_wa_id: job.contact_wa_id,
    decision: "error",
    model_provider: "gemini",
    model_name: deps.agentModel,
    prompt_snapshot: assistantPrompt,
    history_snapshot: history as unknown as JsonValue,
    request_payload: null,
    response_payload: null,
    reply_text: null,
    handoff_reason: null,
    error_message: null,
    created_at: occurredAt,
    completed_at: null,
  });

  if (!assistantPrompt) {
    await deps.repository.updateAgentRun(initialRun.id, {
      decision: "ignore",
      response_payload: {
        reason: "assistant_prompt_missing",
      } as JsonValue,
      completed_at: deps.now().toISOString(),
    });
    await deps.repository.markConversationJobCompleted(
      job.id,
      deps.now().toISOString()
    );
    return;
  }

  const normalizedSourceText = normalizeTextContent(sourceMessage.text_body);
  if (!normalizedSourceText) {
    await deps.repository.updateAgentRun(initialRun.id, {
      decision: "ignore",
      response_payload: {
        reason: "source_message_without_text",
      } as JsonValue,
      completed_at: deps.now().toISOString(),
    });
    await deps.repository.markConversationJobCompleted(
      job.id,
      deps.now().toISOString()
    );
    return;
  }

  try {
    const geminiDecision = await callGeminiForDecision(deps, {
      prompt: assistantPrompt,
      sourceMessage,
      history,
    });

    await deps.repository.updateAgentRun(initialRun.id, {
      decision: geminiDecision.parsedDecision.decision,
      model_provider: "gemini",
      model_name: geminiDecision.modelName,
      request_payload: geminiDecision.requestPayload as JsonValue,
      response_payload: geminiDecision.responsePayload,
      reply_text:
        geminiDecision.parsedDecision.decision === "reply"
          ? geminiDecision.parsedDecision.replyText
          : null,
      handoff_reason:
        geminiDecision.parsedDecision.decision === "handoff"
          ? geminiDecision.parsedDecision.handoffReason
          : null,
      error_message:
        geminiDecision.parsedDecision.decision === "error"
          ? "O agente retornou decision=error."
          : null,
      completed_at: deps.now().toISOString(),
    });

    if (geminiDecision.parsedDecision.decision === "reply") {
      await sendOfficialWhatsAppMessage(deps, {
        sourceMessageId: sourceMessage.id,
        originJobId: job.id,
        agentRunId: initialRun.id,
        text: geminiDecision.parsedDecision.replyText,
      });
      await deps.repository.markConversationJobCompleted(
        job.id,
        deps.now().toISOString()
      );
      return;
    }

    if (
      geminiDecision.parsedDecision.decision === "handoff" ||
      geminiDecision.parsedDecision.decision === "ignore"
    ) {
      await deps.repository.markConversationJobCompleted(
        job.id,
        deps.now().toISOString()
      );
      return;
    }

    throw new Error("O agente retornou decision=error.");
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error || "unknown");
    await deps.repository.updateAgentRun(initialRun.id, {
      error_message: message,
      completed_at: deps.now().toISOString(),
    });
    throw error;
  }
}

export async function processQueuedConversationJobs(
  deps: AgentRuntimeDependencies,
  batchSize = 10
) {
  const workerId = `node-whatsapp-agent-${deps.randomUUID()}`;
  const rows = await deps.repository.claimConversationJobs(batchSize, workerId);

  for (const row of rows) {
    const occurredAt = deps.now().toISOString();
    try {
      await processConversationJob(deps, row, occurredAt);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error || "unknown");
      deps.log.warn(
        { jobId: row.id, sourceMessageId: row.source_message_id, message },
        "WhatsApp agent processing failed"
      );

      if (error instanceof AmbiguousSendStateError) {
        await deps.repository.markConversationJobCancelled(
          row.id,
          deps.now().toISOString(),
          message
        );
        continue;
      }

      await deps.repository.markConversationJobFailed(
        row.id,
        deps.now().toISOString(),
        message
      );
    }
  }

  return rows.length;
}

export type { AgentRuntimeDependencies, AgentRunRow };
