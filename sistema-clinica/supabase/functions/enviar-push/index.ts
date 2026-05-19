import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const PROJECT_ID = Deno.env.get("FIREBASE_PROJECT_ID") || "";
const CLIENT_EMAIL = Deno.env.get("FIREBASE_CLIENT_EMAIL") || "";
const PRIVATE_KEY = (Deno.env.get("FIREBASE_PRIVATE_KEY") || "").replace(/\\n/g, "\n");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function base64Url(input: ArrayBuffer | string) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function privateKeyToArrayBuffer(pem: string) {
  const clean = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");

  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes.buffer;
}

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);

  const header = {
    alg: "RS256",
    typ: "JWT",
  };

  const payload = {
    iss: CLIENT_EMAIL,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    privateKeyToArrayBuffer(PRIVATE_KEY),
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsignedToken)
  );

  const jwt = `${unsignedToken}.${base64Url(signature)}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(JSON.stringify(data));
  }

  return data.access_token;
}

async function enviarPush(token: string, title: string, body: string, data = {}) {
  const accessToken = await getAccessToken();

  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token,
          notification: {
            title,
            body,
          },
          webpush: {
            notification: {
              icon: "/icon-192.png",
              badge: "/icon-192.png",
              requireInteraction: true,
            },
            fcm_options: {
              link: "/",
            },
          },
          data,
        },
      }),
    }
  );

  const result = await response.json();

  if (!response.ok) {
    throw new Error(JSON.stringify(result));
  }

  return result;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    const tokens = Array.isArray(body.tokens)
      ? body.tokens
      : body.token
      ? [body.token]
      : [];

    const title = body.title || "Nueva notificación";
    const message = body.message || "Hay una nueva actualización.";
    const data = body.data || {};

    if (tokens.length === 0) {
      return new Response(
        JSON.stringify({ error: "No se recibieron tokens" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resultados = [];

    for (const token of tokens) {
      try {
        const resultado = await enviarPush(token, title, message, data);
        resultados.push({ token, ok: true, resultado });
      } catch (error) {
        resultados.push({ token, ok: false, error: error instanceof Error ? error.message : String(error), });
      }
    }

    return new Response(JSON.stringify({ ok: true, resultados }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});