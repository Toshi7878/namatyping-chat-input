import type { ChatResponse } from "./shared/messages";

const CLIENT_ID = import.meta.env.VITE_TWITCH_CLIENT_ID;
if (!CLIENT_ID) {
  throw new Error("VITE_TWITCH_CLIENT_ID が設定されていません。");
}
const TOKEN_KEY = "twitchAuth";
const REQUIRED_SCOPE = "user:write:chat";

type StoredAuth = {
  accessToken: string;
  refreshToken?: string;
};

type TokenInfo = {
  accessToken: string;
  userId: string;
};

export async function sendTwitchChat(
  channelLogin: string,
  message: string,
): Promise<ChatResponse> {
  try {
    const token = await getToken();
    const broadcaster = await twitchGet<{ data: Array<{ id: string }> }>(
      `/helix/users?login=${encodeURIComponent(channelLogin)}`,
      token.accessToken,
    );
    const broadcasterId = broadcaster.data[0]?.id;
    if (!broadcasterId) throw new Error("Twitchチャンネルが見つかりません。");

    const response = await fetch("https://api.twitch.tv/helix/chat/messages", {
      method: "POST",
      headers: headers(token.accessToken),
      body: JSON.stringify({
        broadcaster_id: broadcasterId,
        sender_id: token.userId,
        message,
      }),
    });
    const result = (await response.json()) as {
      data?: Array<{
        is_sent: boolean;
        drop_reason?: { message?: string };
      }>;
      message?: string;
    };
    if (!response.ok)
      throw new Error(result.message ?? `HTTP ${response.status}`);
    const sent = result.data?.[0];
    if (!sent?.is_sent) {
      throw new Error(
        sent?.drop_reason?.message ?? "Twitchが送信を拒否しました。",
      );
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: `Twitch: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function isTwitchAuthenticated(): Promise<boolean> {
  const stored = (await chrome.storage.local.get(TOKEN_KEY))[TOKEN_KEY] as
    | StoredAuth
    | undefined;
  if (!stored?.accessToken) return false;
  return (await validate(stored.accessToken)) !== null;
}

export async function authenticateTwitch(): Promise<void> {
  await getToken();
}

export async function disconnectTwitch(): Promise<void> {
  const stored = (await chrome.storage.local.get(TOKEN_KEY))[TOKEN_KEY] as
    | StoredAuth
    | undefined;
  if (stored?.accessToken) {
    await fetch("https://id.twitch.tv/oauth2/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        token: stored.accessToken,
      }),
    }).catch(() => undefined);
    await chrome.storage.local.remove(TOKEN_KEY);
    return;
  }
  await chrome.storage.local.remove(TOKEN_KEY);
}

async function getToken(): Promise<TokenInfo> {
  const stored = (await chrome.storage.local.get(TOKEN_KEY))[TOKEN_KEY] as
    | StoredAuth
    | undefined;
  if (stored?.accessToken) {
    const validated = await validate(stored.accessToken);
    if (validated) return validated;
    if (stored.refreshToken) {
      try {
        const refreshed = await requestToken(
          new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: stored.refreshToken,
            client_id: CLIENT_ID,
          }),
        );
        await saveToken(refreshed);
        const info = await validate(refreshed.access_token);
        if (info) return info;
      } catch {
        await chrome.storage.local.remove(TOKEN_KEY);
      }
    }
  }
  return authorizeDevice();
}

async function authorizeDevice(): Promise<TokenInfo> {
  const response = await fetch("https://id.twitch.tv/oauth2/device", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      scopes: REQUIRED_SCOPE,
    }),
  });
  if (!response.ok)
    throw new Error(`認証開始に失敗しました（${response.status}）。`);
  const device = (await response.json()) as {
    device_code: string;
    user_code: string;
    verification_uri: string;
    expires_in: number;
    interval: number;
  };
  const verificationUrl = new URL(device.verification_uri);
  if (!verificationUrl.searchParams.has("device-code")) {
    verificationUrl.searchParams.set("device-code", device.user_code);
    verificationUrl.searchParams.set("public", "true");
  }
  await chrome.tabs.create({ url: verificationUrl.href });

  const expiresAt = Date.now() + device.expires_in * 1000;
  while (Date.now() < expiresAt) {
    await delay(Math.max(device.interval, 1) * 1000);
    try {
      const token = await requestToken(
        new URLSearchParams({
          client_id: CLIENT_ID,
          scopes: REQUIRED_SCOPE,
          device_code: device.device_code,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        }),
      );
      await saveToken(token);
      const info = await validate(token.access_token);
      if (info) return info;
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !error.message.includes("authorization_pending")
      ) {
        throw error;
      }
    }
  }
  throw new Error("Twitch認証がタイムアウトしました。");
}

async function requestToken(params: URLSearchParams): Promise<{
  access_token: string;
  refresh_token?: string;
}> {
  const response = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const result = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    message?: string;
  };
  if (!response.ok || !result.access_token) {
    throw new Error(
      result.message ?? `トークン取得エラー（${response.status}）`,
    );
  }
  return {
    access_token: result.access_token,
    refresh_token: result.refresh_token,
  };
}

async function validate(accessToken: string): Promise<TokenInfo | null> {
  const response = await fetch("https://id.twitch.tv/oauth2/validate", {
    headers: { Authorization: `OAuth ${accessToken}` },
  });
  if (!response.ok) return null;
  const result = (await response.json()) as {
    user_id?: string;
    scopes?: string[];
  };
  if (!result.user_id || !result.scopes?.includes(REQUIRED_SCOPE)) return null;
  return { accessToken, userId: result.user_id };
}

async function saveToken(token: {
  access_token: string;
  refresh_token?: string;
}): Promise<void> {
  await chrome.storage.local.set({
    [TOKEN_KEY]: {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
    } satisfies StoredAuth,
  });
}

async function twitchGet<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`https://api.twitch.tv${path}`, {
    headers: headers(token),
  });
  if (!response.ok) throw new Error(`Twitch API: HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Client-Id": CLIENT_ID,
    "Content-Type": "application/json",
  };
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
