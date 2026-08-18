export async function validateTelegramInitData(initData, botToken, maxAgeSeconds = 86400) {
  try {
    if (!initData || !botToken) return { ok: false, error: "AUTH_MISSING" };
    const params = new URLSearchParams(initData);
    const receivedHash = params.get("hash");
    if (!receivedHash) return { ok: false, error: "HASH_MISSING" };

    const authDate = Number(params.get("auth_date"));
    if (!authDate) return { ok: false, error: "AUTH_DATE_MISSING" };
    const now = Math.floor(Date.now() / 1000);
    if (authDate > now + 60 || now - authDate > maxAgeSeconds) {
      return { ok: false, error: "INIT_DATA_EXPIRED" };
    }

    params.delete("hash");
    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");

    const encoder = new TextEncoder();
    const secret = await hmacSha256(
      encoder.encode("WebAppData"),
      encoder.encode(botToken)
    );
    const calculated = await hmacSha256(secret, encoder.encode(dataCheckString));
    const received = hexToBytes(receivedHash);
    if (!safeEqual(calculated, received)) {
      return { ok: false, error: "INVALID_SIGNATURE" };
    }

    const userRaw = params.get("user");
    if (!userRaw) return { ok: false, error: "USER_MISSING" };
    const user = JSON.parse(userRaw);
    if (!user?.id) return { ok: false, error: "USER_ID_MISSING" };
    return { ok: true, user, queryId: params.get("query_id") || null };
  } catch (error) {
    console.error("telegram auth", error);
    return { ok: false, error: "AUTH_FAILED" };
  }
}

async function hmacSha256(keyBytes, dataBytes) {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, dataBytes));
}

function hexToBytes(hex) {
  if (!hex || hex.length % 2) return new Uint8Array();
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function authenticateJsonRequest(request, env) {
  try {
    const body = await request.clone().json();
    const auth = await validateTelegramInitData(body?.initData, env.TELEGRAM_BOT_TOKEN);
    return { ...auth, body };
  } catch {
    return { ok: false, error: "BAD_JSON" };
  }
}
