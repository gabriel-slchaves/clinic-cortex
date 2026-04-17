import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

const workflowPath = resolve("workflow.json");
const previous = JSON.parse(readFileSync(workflowPath, "utf8"));

const aiAgentNode =
  previous.nodes.find(node => node.name === "AI Agent") || {
    parameters: {
      promptType: "define",
      text: "={{ $json.patientMessage }}",
      options: {
        systemMessage: "={{ $json.systemPrompt }}",
        maxIterations: 4,
      },
    },
    name: "AI Agent",
    type: "@n8n/n8n-nodes-langchain.agent",
    typeVersion: 3.1,
    credentials: undefined,
  };
const geminiNode =
  previous.nodes.find(node => node.name === "Google Gemini Chat Model") || {
    parameters: {
      options: {
        maxOutputTokens: 500,
        temperature: 0.4,
      },
    },
    name: "Google Gemini Chat Model",
    type: "@n8n/n8n-nodes-langchain.lmChatGoogleGemini",
    typeVersion: 1,
    credentials: undefined,
  };
const memoryNode =
  previous.nodes.find(node => node.name === "Simple Memory") || {
    parameters: {
      sessionIdType: "customKey",
      sessionKey:
        "={{ $('Build Inbound Context').first().json.clinicId + ':' + $('Build Inbound Context').first().json.connectionId + ':' + $('Build Inbound Context').first().json.contactWaId }}",
      contextWindowLength: 16,
    },
    name: "Simple Memory",
    type: "@n8n/n8n-nodes-langchain.memoryBufferWindow",
    typeVersion: 1.3,
    credentials: undefined,
  };

const nodes = [];
const connections = {};

function pushNode(node) {
  nodes.push({
    id: randomUUID(),
    ...node,
  });
  return node.name;
}

function connect(from, to, type = "main", output = 0, input = 0) {
  if (!connections[from]) connections[from] = {};
  if (!connections[from][type]) connections[from][type] = [];
  if (!connections[from][type][output]) connections[from][type][output] = [];
  connections[from][type][output].push({ node: to, type, index: input });
}

function ifNode(name, leftValue, rightValue, position) {
  return pushNode({
    name,
    type: "n8n-nodes-base.if",
    typeVersion: 2,
    position,
    parameters: {
      conditions: {
        options: {
          caseSensitive: false,
          leftValue: "",
          typeValidation: "loose",
        },
        conditions: [
          {
            id: randomUUID(),
            leftValue,
            rightValue,
            operator: {
              type: "string",
              operation: "equals",
            },
          },
        ],
        combinator: "and",
      },
      options: {},
    },
  });
}

function respondNode(name, responseCode, position, respondWith = "json", body) {
  const parameters = {
    options: {
      responseCode,
    },
  };

  if (respondWith === "json") {
    parameters.respondWith = "json";
    parameters.responseBody = body || "={{ JSON.stringify($json) }}";
  } else {
    parameters.respondWith = "text";
    parameters.responseBody = body || "={{ $json.challenge }}";
    parameters.options.responseHeaders = {
      entries: [
        {
          name: "Content-Type",
          value: "text/plain; charset=utf-8",
        },
      ],
    };
  }

  return pushNode({
    name,
    type: "n8n-nodes-base.respondToWebhook",
    typeVersion: 1.3,
    position,
    parameters,
  });
}

const workflowId =
  String(previous.id || "").trim() || randomUUID().replace(/-/g, "").slice(0, 16);

const serializeConnectionHelpersCode = String.raw`
function buildSeverity(operationalStatus, verificationStatus, lastError) {
  if (operationalStatus === "action_required" || verificationStatus === "failed") return "critical";
  if (operationalStatus === "onboarding" || verificationStatus === "pending" || lastError) return "warning";
  return "info";
}

function serializeConnection(connection) {
  return {
    connectionId: connection.id,
    clinicId: connection.clinic_id,
    provider: connection.provider || "meta_cloud_api",
    operationalStatus: connection.operational_status,
    onboardingStatus: connection.onboarding_status,
    verificationStatus: connection.verification_status,
    webhookStatus: connection.webhook_status,
    businessAccountId: connection.business_account_id || null,
    wabaId: connection.waba_id || null,
    phoneNumberId: connection.phone_number_id || null,
    displayPhoneNumber: connection.display_phone_number || null,
    verifiedName: connection.verified_name || null,
    lastError: connection.last_error || null,
    actionRequiredReason:
      connection.operational_status === "action_required"
        ? connection.last_event_code || null
        : null,
    lastEvent:
      connection.last_event_code || connection.last_event_message || connection.last_error
        ? {
            code: connection.last_event_code || "whatsapp_unknown",
            message:
              connection.last_event_message ||
              connection.last_error ||
              "Evento operacional do WhatsApp.",
            severity: buildSeverity(
              connection.operational_status,
              connection.verification_status,
              connection.last_error || null
            ),
            occurredAt: connection.last_event_at || null,
          }
        : null,
  };
}
`;

const webhookStart = pushNode({
  name: "Webhook - Start Embedded Signup",
  type: "n8n-nodes-base.webhook",
  typeVersion: 2,
  position: [-1840, -640],
  webhookId: randomUUID(),
  parameters: {
    httpMethod: "POST",
    path: "whatsapp/connections/onboarding/session",
    responseMode: "responseNode",
    options: {},
  },
});

const normalizeStart = pushNode({
  name: "Normalize Start Request",
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [-1620, -640],
  parameters: {
    jsCode: String.raw`
return items.map((item) => {
  const headers = item.json.headers || {};
  const authHeader = String(headers.authorization || headers.Authorization || "").trim();
  const clinicId = String(item.json.body?.clinicId || item.json.query?.clinicId || "").trim();
  const clinicName = String(item.json.body?.clinicName || "").trim() || null;

  if (!clinicId) {
    return { json: { ok: false, statusCode: 400, error: "clinicId é obrigatório." } };
  }

  if (!authHeader.startsWith("Bearer ")) {
    return { json: { ok: false, statusCode: 401, error: "Token de sessão não informado." } };
  }

  return { json: { ok: true, clinicId, clinicName, authHeader } };
});
`,
  },
});

const startValid = ifNode(
  "Start Request Valid?",
  "={{ String($json.ok) }}",
  "true",
  [-1400, -640]
);

const resolveStartAccess = pushNode({
  name: "Resolve Start Access",
  type: "n8n-nodes-base.httpRequest",
  typeVersion: 4.2,
  position: [-1180, -760],
  parameters: {
    method: "POST",
    url: '={{ ($env.TEAM_SERVICE_INTERNAL_URL || "http://team-service:3002").replace(/\\/$/, "") + "/team/internal/auth/resolve" }}',
    sendHeaders: true,
    headerParameters: {
      parameters: [
        { name: "Authorization", value: "={{ $('Normalize Start Request').first().json.authHeader }}" },
        { name: "Content-Type", value: "application/json" },
      ],
    },
    sendBody: true,
    specifyBody: "json",
    jsonBody:
      '={{ { "clinicId": $(\'Normalize Start Request\').first().json.clinicId, "requireManage": true } }}',
  },
});

const startAccessOk = ifNode(
  "Start Access OK?",
  "={{ String($json.ok) }}",
  "true",
  [-960, -760]
);

const getStartConnection = pushNode({
  name: "Get Start Connection",
  type: "n8n-nodes-base.httpRequest",
  typeVersion: 4.2,
  position: [-740, -760],
  parameters: {
    url: '={{ ($env.SUPABASE_URL || "").replace(/\\/$/, "") + "/rest/v1/whatsapp_connections?clinic_id=eq." + encodeURIComponent($(\'Normalize Start Request\').first().json.clinicId) + "&deleted_at=is.null&select=*&limit=1" }}',
    sendHeaders: true,
    headerParameters: {
      parameters: [
        { name: "apikey", value: "={{ $env.SUPABASE_SERVICE_ROLE_KEY }}" },
        { name: "Authorization", value: "={{ 'Bearer ' + $env.SUPABASE_SERVICE_ROLE_KEY }}" },
      ],
    },
    options: {
      response: {
        response: {
          fullResponse: true,
        },
      },
    },
  },
});

const ensureStartConnection = pushNode({
  name: "Ensure Start Connection",
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [-520, -760],
  parameters: {
    jsCode: String.raw`
let randomUUID;
try {
  ({ randomUUID } = require("node:crypto"));
} catch {
  try {
    ({ randomUUID } = require("crypto"));
  } catch {
    return [
      {
        json: {
          ok: false,
          errorCode: "meta_runtime_crypto_unavailable",
          error: "Não foi possível iniciar a conexão oficial do WhatsApp agora.",
          publicMessage:
            "Não foi possível iniciar a conexão oficial do WhatsApp agora. Tente novamente ou acione o suporte.",
          statusCode: 500,
        },
      },
    ];
  }
}

const rows = Array.isArray($json.body) ? $json.body : [];
const connection = rows[0] || null;

if (connection?.id) {
  return [{ json: { ok: true, connection } }];
}

return [
  {
    json: {
      ok: true,
      needsCreate: true,
      generatedId: randomUUID(),
    },
  },
];
`,
  },
});

const needsCreateStart = ifNode(
  "Start Needs Create?",
  "={{ String(Boolean($json.needsCreate)) }}",
  "true",
  [-300, -760]
);

const createStartConnection = pushNode({
  name: "Create Start Connection",
  type: "n8n-nodes-base.httpRequest",
  typeVersion: 4.2,
  position: [-80, -900],
  parameters: {
    method: "POST",
    url: '={{ ($env.SUPABASE_URL || "").replace(/\\/$/, "") + "/rest/v1/whatsapp_connections" }}',
    sendHeaders: true,
    headerParameters: {
      parameters: [
        { name: "apikey", value: "={{ $env.SUPABASE_SERVICE_ROLE_KEY }}" },
        { name: "Authorization", value: "={{ 'Bearer ' + $env.SUPABASE_SERVICE_ROLE_KEY }}" },
        { name: "Content-Type", value: "application/json" },
        { name: "Prefer", value: "return=representation" },
      ],
    },
    sendBody: true,
    specifyBody: "json",
    jsonBody:
      '={{ { "id": $(\'Ensure Start Connection\').first().json.generatedId, "clinic_id": $(\'Normalize Start Request\').first().json.clinicId, "provider": "meta_cloud_api", "operational_status": "not_connected", "onboarding_status": "not_started", "verification_status": "unknown", "webhook_status": "not_configured" } }}',
    options: {
      response: {
        response: {
          fullResponse: true,
        },
      },
    },
  },
});

const prepareStartResponse = pushNode({
  name: "Prepare Start Session Response",
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [140, -760],
  parameters: {
    jsCode: String.raw`
${serializeConnectionHelpersCode}

let randomUUID;
try {
  ({ randomUUID } = require("node:crypto"));
} catch {
  try {
    ({ randomUUID } = require("crypto"));
  } catch {
    return [{
      json: {
        ok: false,
        errorCode: "meta_runtime_crypto_unavailable",
        error: "Não foi possível iniciar a conexão oficial do WhatsApp agora.",
        statusCode: 500
      }
    }];
  }
}

const source = $json.connection ? $json : { connection: (Array.isArray($json.body) ? $json.body[0] : null) };
if (!source.connection?.id) {
  return [{
    json: {
      ok: false,
      errorCode: "meta_connection_create_failed",
      error: "Não foi possível iniciar a conexão oficial do WhatsApp agora.",
      publicMessage: "Não foi possível iniciar a conexão oficial do WhatsApp agora. Tente novamente ou acione o suporte.",
      statusCode: 500
    }
  }];
}

const appId = String($env.META_APP_ID || "").trim();
const configId = String($env.META_EMBEDDED_SIGNUP_CONFIG_ID || "").trim();
const redirectUri = String($env.META_EMBEDDED_SIGNUP_REDIRECT_URI || "").trim();
if (!appId || !configId || !redirectUri) {
  return [{
    json: {
      ok: false,
      errorCode: "meta_embedded_signup_config_missing",
      error: "Não foi possível iniciar a conexão oficial do WhatsApp agora.",
      publicMessage: "Não foi possível iniciar a conexão oficial do WhatsApp agora. Tente novamente ou acione o suporte.",
      statusCode: 503,
      missingFields: [
        !appId ? "META_APP_ID" : null,
        !configId ? "META_EMBEDDED_SIGNUP_CONFIG_ID" : null,
        !redirectUri ? "META_EMBEDDED_SIGNUP_REDIRECT_URI" : null,
      ].filter(Boolean)
    }
}];
}

try {
  const state = randomUUID();
  const graphVersion = String($env.META_GRAPH_VERSION || "v23.0").trim();
  const scopeText = String($env.META_EMBEDDED_SIGNUP_SCOPES || "business_management,whatsapp_business_management,whatsapp_business_messaging");
  const scopes = scopeText.split(",").map((scope) => scope.trim()).filter(Boolean);
  const clinicName = String($('Normalize Start Request').first().json.clinicName || "").trim();
  const extras = {
    feature: "whatsapp_embedded_signup",
    sessionInfoVersion: "3",
    setup: clinicName ? { business: { name: clinicName } } : {},
  };
  const launchParams = [
    ["client_id", appId],
    ["redirect_uri", redirectUri],
    ["state", state],
    ["config_id", configId],
    ["response_type", "code"],
    ["override_default_response_type", "true"],
    ["scope", scopeText],
    ["extras", JSON.stringify(extras)],
  ];
  const launchUrl =
    "https://www.facebook.com/" +
    graphVersion +
    "/dialog/oauth?" +
    launchParams
      .map(([key, value]) => encodeURIComponent(String(key)) + "=" + encodeURIComponent(String(value)))
      .join("&");

  return [{
    json: {
      ok: true,
      connection: serializeConnection({
        ...source.connection,
        operational_status: "onboarding",
        onboarding_status: "embedded_signup_started",
        webhook_status: String($env.META_WEBHOOK_VERIFY_TOKEN || "").trim() ? "verify_pending" : "not_configured",
        onboarding_state: state,
        onboarding_started_at: new Date().toISOString(),
        last_error: null,
        last_event_code: "meta_embedded_signup_started",
        last_event_message: "Aguardando autorização oficial da Meta para conectar o WhatsApp.",
        last_event_at: new Date().toISOString(),
      }),
      state,
      redirectUri,
      launchUrl,
      appId,
      configId,
      graphVersion,
      scopes,
      extras,
    }
  }];
} catch (error) {
  return [{
    json: {
      ok: false,
      errorCode: "meta_embedded_signup_session_prepare_failed",
      error: "Não foi possível iniciar a conexão oficial do WhatsApp agora.",
      publicMessage: "Não foi possível iniciar a conexão oficial do WhatsApp agora. Tente novamente ou acione o suporte.",
      statusCode: 500,
      diagnostic: {
        stage: "prepare_start_session_response",
        message: error instanceof Error ? error.message : String(error),
      },
    }
  }];
}
`,
  },
});

const respondStartError = respondNode(
  "Respond Start Error",
  "={{ $json.statusCode || 400 }}",
  [-1180, -500]
);
const startSessionPrepared = ifNode(
  "Start Session Prepared?",
  "={{ String($json.ok) }}",
  "true",
  [360, -760]
);
const respondStartSuccess = respondNode(
  "Respond Start Success",
  200,
  [580, -760]
);

const webhookStatus = pushNode({
  name: "Webhook - Connection Status",
  type: "n8n-nodes-base.webhook",
  typeVersion: 2,
  position: [-1840, -40],
  webhookId: randomUUID(),
  parameters: {
    httpMethod: "GET",
    path: "whatsapp/connections/status",
    responseMode: "responseNode",
    options: {},
  },
});

const normalizeStatus = pushNode({
  name: "Normalize Status Request",
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [-1620, -40],
  parameters: {
    jsCode: String.raw`
return items.map((item) => {
  const headers = item.json.headers || {};
  const authHeader = String(headers.authorization || headers.Authorization || "").trim();
  const clinicId = String(item.json.query?.clinicId || item.json.body?.clinicId || "").trim();

  if (!clinicId) {
    return { json: { ok: false, statusCode: 400, error: "clinicId é obrigatório." } };
  }

  if (!authHeader.startsWith("Bearer ")) {
    return { json: { ok: false, statusCode: 401, error: "Token de sessão não informado." } };
  }

  return { json: { ok: true, clinicId, authHeader } };
});
`,
  },
});

const statusValid = ifNode(
  "Status Request Valid?",
  "={{ String($json.ok) }}",
  "true",
  [-1400, -40]
);

const resolveStatusAccess = pushNode({
  name: "Resolve Status Access",
  type: "n8n-nodes-base.httpRequest",
  typeVersion: 4.2,
  position: [-1180, -160],
  parameters: {
    method: "POST",
    url: '={{ ($env.TEAM_SERVICE_INTERNAL_URL || "http://team-service:3002").replace(/\\/$/, "") + "/team/internal/auth/resolve" }}',
    sendHeaders: true,
    headerParameters: {
      parameters: [
        { name: "Authorization", value: "={{ $('Normalize Status Request').first().json.authHeader }}" },
        { name: "Content-Type", value: "application/json" },
      ],
    },
    sendBody: true,
    specifyBody: "json",
    jsonBody:
      '={{ { "clinicId": $(\'Normalize Status Request\').first().json.clinicId, "requireManage": false } }}',
  },
});

const statusAccessOk = ifNode(
  "Status Access OK?",
  "={{ String($json.ok) }}",
  "true",
  [-960, -160]
);

const getStatusConnection = pushNode({
  name: "Get Status Connection",
  type: "n8n-nodes-base.httpRequest",
  typeVersion: 4.2,
  position: [-740, -160],
  parameters: {
    url: '={{ ($env.SUPABASE_URL || "").replace(/\\/$/, "") + "/rest/v1/whatsapp_connections?clinic_id=eq." + encodeURIComponent($(\'Normalize Status Request\').first().json.clinicId) + "&deleted_at=is.null&select=*&limit=1" }}',
    sendHeaders: true,
    headerParameters: {
      parameters: [
        { name: "apikey", value: "={{ $env.SUPABASE_SERVICE_ROLE_KEY }}" },
        { name: "Authorization", value: "={{ 'Bearer ' + $env.SUPABASE_SERVICE_ROLE_KEY }}" },
      ],
    },
    options: {
      response: {
        response: {
          fullResponse: true,
        },
      },
    },
  },
});

const serializeStatusResponse = pushNode({
  name: "Serialize Status Response",
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [-520, -160],
  parameters: {
    jsCode: String.raw`
${serializeConnectionHelpersCode}

return items.map((item) => {
  const connection = item.json.connection || item.json.body?.[0] || null;
  if (!connection?.id) {
    return {
      json: {
        error: "Nenhuma conexão WhatsApp encontrada para esta clínica.",
        statusCode: 404,
      },
    };
  }

  return {
    json: serializeConnection(connection),
  };
});
`,
  },
});

const respondStatusError = respondNode(
  "Respond Status Error",
  "={{ $json.statusCode || 400 }}",
  [-1180, 100]
);
const respondStatusSuccess = respondNode(
  "Respond Status Success",
  200,
  [-300, -160]
);

const webhookComplete = pushNode({
  name: "Webhook - Complete Embedded Signup",
  type: "n8n-nodes-base.webhook",
  typeVersion: 2,
  position: [-1840, 560],
  webhookId: randomUUID(),
  parameters: {
    httpMethod: "POST",
    path: "whatsapp/connections/onboarding/complete",
    responseMode: "responseNode",
    options: {},
  },
});

const normalizeComplete = pushNode({
  name: "Normalize Complete Request",
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [-1620, 560],
  parameters: {
    jsCode: String.raw`
return items.map((item) => {
  const headers = item.json.headers || {};
  const authHeader = String(headers.authorization || headers.Authorization || "").trim();
  const connectionId = String(item.json.body?.connectionId || "").trim();
  const body = item.json.body || {};

  if (!connectionId) {
    return { json: { ok: false, statusCode: 400, error: "connectionId é obrigatório." } };
  }

  if (!authHeader.startsWith("Bearer ")) {
    return { json: { ok: false, statusCode: 401, error: "Token de sessão não informado." } };
  }

  if (!String(body.state || "").trim()) {
    return { json: { ok: false, statusCode: 400, error: "state é obrigatório para concluir o onboarding oficial." } };
  }

  if (!String(body.authorizationCode || "").trim() && !String(body.accessToken || "").trim()) {
    return { json: { ok: false, statusCode: 400, error: "A Meta não retornou um authorization code ou access token válido." } };
  }

  return { json: { ok: true, connectionId, authHeader, body } };
});
`,
  },
});

const completeValid = ifNode(
  "Complete Request Valid?",
  "={{ String($json.ok) }}",
  "true",
  [-1400, 560]
);

const getCompleteConnection = pushNode({
  name: "Get Complete Connection",
  type: "n8n-nodes-base.httpRequest",
  typeVersion: 4.2,
  position: [-1180, 440],
  parameters: {
    url: '={{ ($env.SUPABASE_URL || "").replace(/\\/$/, "") + "/rest/v1/whatsapp_connections?id=eq." + encodeURIComponent($(\'Normalize Complete Request\').first().json.connectionId) + "&deleted_at=is.null&select=*&limit=1" }}',
    sendHeaders: true,
    headerParameters: {
      parameters: [
        { name: "apikey", value: "={{ $env.SUPABASE_SERVICE_ROLE_KEY }}" },
        { name: "Authorization", value: "={{ 'Bearer ' + $env.SUPABASE_SERVICE_ROLE_KEY }}" },
      ],
    },
    options: {
      response: {
        response: {
          fullResponse: true,
        },
      },
    },
  },
});

const prepareCompleteContext = pushNode({
  name: "Prepare Complete Context",
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [-960, 440],
  parameters: {
    jsCode: String.raw`
const rows = Array.isArray($json.body) ? $json.body : [];
const connection = rows[0] || null;
if (!connection?.id) {
  return [{ json: { ok: false, statusCode: 404, error: "Conexão WhatsApp não encontrada." } }];
}

const request = $("Normalize Complete Request").first().json;
if (String(request.body.state || "").trim() !== String(connection.onboarding_state || "").trim()) {
  return [{ json: { ok: false, statusCode: 400, error: "O retorno do Embedded Signup não corresponde ao onboarding iniciado." } }];
}

return [{ json: { ok: true, connection, request } }];
`,
  },
});

const completeContextOk = ifNode(
  "Complete Context OK?",
  "={{ String($json.ok) }}",
  "true",
  [-740, 440]
);

const resolveCompleteAccess = pushNode({
  name: "Resolve Complete Access",
  type: "n8n-nodes-base.httpRequest",
  typeVersion: 4.2,
  position: [-520, 320],
  parameters: {
    method: "POST",
    url: '={{ ($env.TEAM_SERVICE_INTERNAL_URL || "http://team-service:3002").replace(/\\/$/, "") + "/team/internal/auth/resolve" }}',
    sendHeaders: true,
    headerParameters: {
      parameters: [
        { name: "Authorization", value: "={{ $('Normalize Complete Request').first().json.authHeader }}" },
        { name: "Content-Type", value: "application/json" },
      ],
    },
    sendBody: true,
    specifyBody: "json",
    jsonBody:
      '={{ { "clinicId": $(\'Prepare Complete Context\').first().json.connection.clinic_id, "requireManage": true } }}',
  },
});

const completeAccessOk = ifNode(
  "Complete Access OK?",
  "={{ String($json.ok) }}",
  "true",
  [-300, 320]
);

const exchangeCompleteToken = pushNode({
  name: "Exchange Complete Token",
  type: "n8n-nodes-base.httpRequest",
  typeVersion: 4.2,
  position: [-80, 320],
  parameters: {
    url: '={{ "https://graph.facebook.com/" + ($env.META_GRAPH_VERSION || "v23.0") + "/oauth/access_token?client_id=" + encodeURIComponent($env.META_APP_ID || "") + "&client_secret=" + encodeURIComponent($env.META_APP_SECRET || "") + "&redirect_uri=" + encodeURIComponent($env.META_EMBEDDED_SIGNUP_REDIRECT_URI || "") + "&code=" + encodeURIComponent($(\'Normalize Complete Request\').first().json.body.authorizationCode || "") }}',
    options: {
      response: {
        response: {
          fullResponse: true,
          neverError: true,
        },
      },
    },
  },
});

const finalizeCompleteResponse = pushNode({
  name: "Finalize Complete Response",
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [140, 440],
  parameters: {
    jsCode: String.raw`
const request = $("Normalize Complete Request").first().json;
const context = $("Prepare Complete Context").first().json;
const authResult = $("Resolve Complete Access").first().json;
if (!authResult.ok) {
  return [{ json: authResult }];
}

const accessToken = String(request.body.accessToken || "").trim() || String($("Exchange Complete Token").first().json.body?.access_token || "").trim();
if (!accessToken) {
  return [{ json: { error: "A Meta não retornou um access token válido para o WhatsApp.", statusCode: 502 } }];
}

if (!String(request.body.wabaId || "").trim() || !String(request.body.phoneNumberId || "").trim()) {
  return [{ json: { error: "O callback da Meta precisa retornar wabaId e phoneNumberId para concluir o onboarding oficial.", statusCode: 400 } }];
}

const secret = String($env.WHATSAPP_TOKEN_ENCRYPTION_KEY || "").trim();
if (!secret) {
  return [{ json: { error: "A chave de criptografia das credenciais oficiais do WhatsApp não está configurada.", statusCode: 503 } }];
}

function toKeyBuffer(value) {
  try {
    const decoded = Buffer.from(value, "base64");
    if (decoded.length === 32) return decoded;
  } catch {}
  return require("crypto").createHash("sha256").update(value, "utf8").digest();
}

const nodeCrypto = require("crypto");
const iv = nodeCrypto.randomBytes(12);
const cipher = nodeCrypto.createCipheriv("aes-256-gcm", toKeyBuffer(secret), iv);
const encrypted = Buffer.concat([cipher.update(accessToken, "utf8"), cipher.final()]);
const tag = cipher.getAuthTag();
const encryptedAccessToken = "v1." + iv.toString("base64url") + "." + tag.toString("base64url") + "." + encrypted.toString("base64url");

return [{
  json: {
    credentialPayload: {
      connection_id: context.connection.id,
      encrypted_access_token: encryptedAccessToken,
      granted_scopes:
        Array.isArray(request.body.grantedScopes) && request.body.grantedScopes.length
          ? request.body.grantedScopes
          : String($env.META_EMBEDDED_SIGNUP_SCOPES || "business_management,whatsapp_business_management,whatsapp_business_messaging").split(","),
      token_obtained_at: new Date().toISOString(),
      token_expires_at:
        typeof request.body.tokenExpiresAt === "string" && request.body.tokenExpiresAt.trim()
          ? request.body.tokenExpiresAt.trim()
          : null,
      metadata:
        request.body.metadata && typeof request.body.metadata === "object"
          ? request.body.metadata
          : null,
    },
    connectionPayload: {
      provider: "meta_cloud_api",
      operational_status: "active",
      onboarding_status: "completed",
      verification_status: "verified",
      webhook_status: "subscribed",
      business_account_id: request.body.businessAccountId || null,
      waba_id: request.body.wabaId,
      phone_number_id: request.body.phoneNumberId,
      display_phone_number: request.body.displayPhoneNumber || null,
      verified_name: request.body.verifiedName || null,
      onboarding_state: null,
      last_error: null,
      last_event_code: "meta_whatsapp_connected",
      last_event_message: "WhatsApp conectado com sucesso via Meta Cloud API.",
      last_event_at: new Date().toISOString()
    }
  }
}];
`,
  },
});

const persistCompleteCredentials = pushNode({
  name: "Persist Complete Credentials",
  type: "n8n-nodes-base.httpRequest",
  typeVersion: 4.2,
  position: [360, 320],
  parameters: {
    method: "POST",
    url: '={{ ($env.SUPABASE_URL || "").replace(/\\/$/, "") + "/rest/v1/whatsapp_connection_credentials?on_conflict=connection_id" }}',
    sendHeaders: true,
    headerParameters: {
      parameters: [
        { name: "apikey", value: "={{ $env.SUPABASE_SERVICE_ROLE_KEY }}" },
        { name: "Authorization", value: "={{ 'Bearer ' + $env.SUPABASE_SERVICE_ROLE_KEY }}" },
        { name: "Content-Type", value: "application/json" },
        { name: "Prefer", value: "resolution=merge-duplicates,return=representation" }
      ]
    },
    sendBody: true,
    specifyBody: "json",
    jsonBody: "={{ $('Finalize Complete Response').first().json.credentialPayload }}"
  }
});

const persistCompleteConnection = pushNode({
  name: "Persist Complete Connection",
  type: "n8n-nodes-base.httpRequest",
  typeVersion: 4.2,
  position: [580, 320],
  parameters: {
    method: "PATCH",
    url: '={{ ($env.SUPABASE_URL || "").replace(/\\/$/, "") + "/rest/v1/whatsapp_connections?id=eq." + encodeURIComponent($(\'Prepare Complete Context\').first().json.connection.id) + "&select=*" }}',
    sendHeaders: true,
    headerParameters: {
      parameters: [
        { name: "apikey", value: "={{ $env.SUPABASE_SERVICE_ROLE_KEY }}" },
        { name: "Authorization", value: "={{ 'Bearer ' + $env.SUPABASE_SERVICE_ROLE_KEY }}" },
        { name: "Content-Type", value: "application/json" },
        { name: "Prefer", value: "return=representation" }
      ]
    },
    sendBody: true,
    specifyBody: "json",
    jsonBody: "={{ $('Finalize Complete Response').first().json.connectionPayload }}",
    options: {
      response: {
        response: {
          fullResponse: true
        }
      }
    }
  }
});

const serializeCompletePersistedConnection = pushNode({
  name: "Serialize Complete Persisted Connection",
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [800, 320],
  parameters: {
    jsCode: String.raw`
${serializeConnectionHelpersCode}

return items.map((item) => {
  const connection = item.json.connection || item.json.body?.[0] || null;
  if (!connection?.id) {
    return {
      json: {
        error: "Nenhuma conexão WhatsApp encontrada para esta clínica.",
        statusCode: 404,
      },
    };
  }

  return {
    json: serializeConnection(connection),
  };
});
`
  }
});

const respondCompleteError = respondNode(
  "Respond Complete Error",
  "={{ $json.statusCode || 400 }}",
  [-1180, 760]
);
const respondCompleteSuccess = respondNode(
  "Respond Complete Success",
  200,
  [380, 440]
);

const webhookIngestMeta = pushNode({
  name: "Webhook - Meta Ingest",
  type: "n8n-nodes-base.webhook",
  typeVersion: 2,
  position: [-1840, 1520],
  webhookId: randomUUID(),
  parameters: {
    httpMethod: "POST",
    path: "whatsapp/meta/webhook",
    responseMode: "responseNode",
    options: {},
  },
});

const respondIngestMeta = respondNode(
  "Respond Meta Ingest",
  200,
  [-1620, 1520]
);

const workflow = {
  id: workflowId,
  name: "ClinicCortex - WhatsApp Cloud API (n8n-only)",
  active: false,
  nodes,
  connections,
  settings: {
    executionOrder: "v1",
  },
  staticData: null,
  pinData: {},
  versionId: randomUUID(),
  activeVersionId: randomUUID(),
  versionCounter: 1,
  triggerCount: 5,
  tags: [],
};

connect(webhookStart, normalizeStart);
connect(normalizeStart, startValid);
connect(startValid, resolveStartAccess, "main", 0);
connect(startValid, respondStartError, "main", 1);
connect(resolveStartAccess, startAccessOk);
connect(startAccessOk, getStartConnection, "main", 0);
connect(startAccessOk, respondStartError, "main", 1);
connect(getStartConnection, ensureStartConnection);
connect(ensureStartConnection, needsCreateStart);
connect(needsCreateStart, createStartConnection, "main", 0);
connect(needsCreateStart, prepareStartResponse, "main", 1);
connect(createStartConnection, prepareStartResponse);
connect(prepareStartResponse, startSessionPrepared);
connect(startSessionPrepared, respondStartSuccess, "main", 0);
connect(startSessionPrepared, respondStartError, "main", 1);

connect(webhookStatus, normalizeStatus);
connect(normalizeStatus, statusValid);
connect(statusValid, resolveStatusAccess, "main", 0);
connect(statusValid, respondStatusError, "main", 1);
connect(resolveStatusAccess, statusAccessOk);
connect(statusAccessOk, getStatusConnection, "main", 0);
connect(statusAccessOk, respondStatusError, "main", 1);
connect(getStatusConnection, serializeStatusResponse);
connect(serializeStatusResponse, respondStatusSuccess);

connect(webhookComplete, normalizeComplete);
connect(normalizeComplete, completeValid);
connect(completeValid, getCompleteConnection, "main", 0);
connect(completeValid, respondCompleteError, "main", 1);
connect(getCompleteConnection, prepareCompleteContext);
connect(prepareCompleteContext, completeContextOk);
connect(completeContextOk, resolveCompleteAccess, "main", 0);
connect(completeContextOk, respondCompleteError, "main", 1);
connect(resolveCompleteAccess, completeAccessOk);
connect(completeAccessOk, exchangeCompleteToken, "main", 0);
connect(completeAccessOk, respondCompleteError, "main", 1);
connect(exchangeCompleteToken, finalizeCompleteResponse);
connect(finalizeCompleteResponse, persistCompleteCredentials);
connect(persistCompleteCredentials, persistCompleteConnection);
connect(persistCompleteConnection, serializeCompletePersistedConnection);
connect(serializeCompletePersistedConnection, respondCompleteSuccess);

connect(webhookIngestMeta, respondIngestMeta);

nodes.push(
  {
    ...aiAgentNode,
    id: randomUUID(),
    position: [980, 660],
  },
  {
    ...geminiNode,
    id: randomUUID(),
    position: [980, 900],
  },
  {
    ...memoryNode,
    id: randomUUID(),
    position: [1140, 900],
  }
);

writeFileSync(workflowPath, `${JSON.stringify(workflow, null, 2)}\n`, "utf8");
console.log(`Generated ${workflowPath}`);
