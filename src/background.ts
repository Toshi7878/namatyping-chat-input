import type {
  ChatResponse,
  RuntimeMessage,
  TargetInfo,
  TargetResponse,
} from "./shared/messages";

const YOUTUBE_LIVE_URL = /^https:\/\/(?:www\.)?youtube\.com\/watch\?/;

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id === undefined || !tab.url || !YOUTUBE_LIVE_URL.test(tab.url)) {
    await setBadgeError("LIVE");
    return;
  }

  try {
    await chrome.tabs.sendMessage(
      tab.id,
      { type: "TOGGLE_CHAT_OVERLAY", tabId: tab.id } satisfies RuntimeMessage,
      { frameId: 0 },
    );
  } catch {
    await setBadgeError("RELOAD");
  }
});

chrome.runtime.onMessage.addListener(
  (
    message: RuntimeMessage,
    _sender,
    sendResponse: (response: TargetResponse | ChatResponse) => void,
  ) => {
    if (message.type === "GET_TARGET") {
      getTarget(message.tabId)
        .then((target) => sendResponse({ ok: true, target }))
        .catch((error: unknown) => {
          sendResponse({ ok: false, error: errorMessage(error) });
        });
      return true;
    }

    if (message.type === "SEND_CHAT") {
      sendChat(message.tabId, message.text)
        .then(sendResponse)
        .catch((error: unknown) => {
          sendResponse({ ok: false, error: errorMessage(error) });
        });
      return true;
    }

    return false;
  },
);

async function getTarget(tabId: number): Promise<TargetInfo> {
  const tab = await chrome.tabs.get(tabId);
  if (!tab.url || !YOUTUBE_LIVE_URL.test(tab.url)) {
    throw new Error("対象タブは YouTube の視聴ページではありません。");
  }
  return { title: tab.title ?? "YouTube Live", url: tab.url };
}

async function sendChat(tabId: number, text: string): Promise<ChatResponse> {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: "メッセージを入力してください。" };

  await getTarget(tabId);
  const frames = (await chrome.webNavigation.getAllFrames({ tabId })) ?? [];
  const chatFrame = frames.find(({ url }) => {
    try {
      const parsed = new URL(url);
      return (
        parsed.hostname === "www.youtube.com" &&
        (parsed.pathname === "/live_chat" ||
          parsed.pathname === "/live_chat_replay")
      );
    } catch {
      return false;
    }
  });

  if (!chatFrame) {
    return {
      ok: false,
      error:
        "チャットが見つかりません。視聴ページでチャット欄を表示してください。",
    };
  }

  let apiResponse: ChatResponse | undefined;
  try {
    const apiResult = await chrome.scripting.executeScript({
      target: { tabId, frameIds: [chatFrame.frameId] },
      world: "MAIN",
      func: sendViaInnertube,
      args: [trimmed],
    });
    apiResponse = apiResult[0]?.result as ChatResponse | undefined;
  } catch (error) {
    apiResponse = {
      ok: false,
      error: `非公開APIの実行に失敗しました: ${errorMessage(error)}`,
    };
  }
  if (apiResponse?.ok) return apiResponse;

  try {
    const domResponse: ChatResponse = await chrome.tabs.sendMessage(
      tabId,
      { type: "CHAT_SEND", text: trimmed } satisfies RuntimeMessage,
      { frameId: chatFrame.frameId },
    );
    if (domResponse.ok) return domResponse;
    return {
      ok: false,
      error: `${apiResponse?.error ?? "非公開APIを利用できません。"} / DOM送信: ${domResponse.error}`,
    };
  } catch {
    return {
      ok: false,
      error:
        apiResponse?.error ??
        "チャットとの接続に失敗しました。ページを再読み込みしてください。",
    };
  }
}

async function sendViaInnertube(text: string): Promise<ChatResponse> {
  type YouTubeConfig = {
    get: (key: string) => unknown;
  };
  type YouTubeWindow = Window &
    typeof globalThis & {
      ytcfg?: YouTubeConfig;
      ytInitialData?: unknown;
    };

  const page = window as YouTubeWindow;
  const config = page.ytcfg;
  if (!config) {
    return { ok: false, error: "YouTube設定（ytcfg）を取得できません。" };
  }

  const apiKey = config.get("INNERTUBE_API_KEY");
  const context = config.get("INNERTUBE_CONTEXT");
  if (typeof apiKey !== "string" || !context || typeof context !== "object") {
    return { ok: false, error: "YouTube API設定を取得できません。" };
  }

  function findSendParams(root: unknown): string | null {
    const visited = new WeakSet<object>();
    const queue: unknown[] = [root];
    let inspected = 0;

    while (queue.length > 0 && inspected < 20000) {
      const value = queue.shift();
      if (!value || typeof value !== "object" || visited.has(value)) continue;
      visited.add(value);
      inspected += 1;

      const record = value as Record<string, unknown>;
      const endpoint = record.sendLiveChatMessageEndpoint;
      if (endpoint && typeof endpoint === "object") {
        const params = (endpoint as Record<string, unknown>).params;
        if (typeof params === "string") return params;
      }

      for (const child of Object.values(record)) {
        if (child && typeof child === "object") queue.push(child);
      }
    }
    return null;
  }

  let params = findSendParams(page.ytInitialData);
  if (!params) {
    const renderers = document.querySelectorAll(
      "yt-live-chat-message-input-renderer, yt-live-chat-text-input-field-renderer, yt-live-chat-renderer",
    );
    for (const renderer of renderers) {
      params = findSendParams(renderer);
      if (params) break;
    }
  }
  if (!params) {
    return { ok: false, error: "チャット送信用paramsを取得できません。" };
  }

  const cookie = Object.fromEntries(
    document.cookie.split("; ").map((entry) => {
      const separator = entry.indexOf("=");
      return separator < 0
        ? [entry, ""]
        : [entry.slice(0, separator), entry.slice(separator + 1)];
    }),
  );
  const authCookie = cookie.SAPISID
    ? { scheme: "SAPISIDHASH", value: cookie.SAPISID }
    : cookie["__Secure-3PAPISID"]
      ? { scheme: "SAPISID3PHASH", value: cookie["__Secure-3PAPISID"] }
      : cookie["__Secure-1PAPISID"]
        ? { scheme: "SAPISID1PHASH", value: cookie["__Secure-1PAPISID"] }
        : null;
  if (!authCookie) {
    return {
      ok: false,
      error: "YouTubeログイン認証情報を参照できません。",
    };
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const origin = location.origin;
  const bytes = new TextEncoder().encode(
    `${timestamp} ${authCookie.value} ${origin}`,
  );
  const digest = await crypto.subtle.digest("SHA-1", bytes);
  const hash = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  const clientName = String(config.get("INNERTUBE_CONTEXT_CLIENT_NAME") ?? "1");
  const clientVersion = String(
    config.get("INNERTUBE_CONTEXT_CLIENT_VERSION") ?? "",
  );
  const sessionIndex = String(config.get("SESSION_INDEX") ?? "0");

  try {
    const response = await fetch(
      `/youtubei/v1/live_chat/send_message?key=${encodeURIComponent(apiKey)}&prettyPrint=false`,
      {
        method: "POST",
        credentials: "include",
        headers: {
          Authorization: `${authCookie.scheme} ${timestamp}_${hash}`,
          "Content-Type": "application/json",
          "X-Goog-AuthUser": sessionIndex,
          "X-Origin": origin,
          "X-Youtube-Bootstrap-Logged-In": "true",
          "X-Youtube-Client-Name": clientName,
          "X-Youtube-Client-Version": clientVersion,
        },
        body: JSON.stringify({
          context,
          params,
          richMessage: { textSegments: [{ text }] },
        }),
      },
    );

    if (!response.ok) {
      const details = (await response.text()).slice(0, 300);
      return {
        ok: false,
        error: `YouTube非公開API: HTTP ${response.status} ${details}`,
      };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: `YouTube非公開API: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function setBadgeError(text: string): Promise<void> {
  await chrome.action.setBadgeBackgroundColor({ color: "#cc0000" });
  await chrome.action.setBadgeText({ text });
  setTimeout(() => void chrome.action.setBadgeText({ text: "" }), 2500);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
