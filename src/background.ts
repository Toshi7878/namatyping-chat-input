import type {
  ChatResponse,
  RuntimeMessage,
  TargetInfo,
  TargetResponse,
  TwitchAuthResponse,
} from "./shared/messages";
import {
  authenticateTwitch,
  disconnectTwitch,
  isTwitchAuthenticated,
  sendTwitchChat,
} from "./twitch";

const YOUTUBE_LIVE_URL = /^https:\/\/(?:www\.)?youtube\.com\/watch\?/;
const TWITCH_CHANNEL_URL = /^https:\/\/(?:www\.)?twitch\.tv\/([^/?#]+)/;

chrome.action.onClicked.addListener(async (tab) => {
  if (
    tab.id === undefined ||
    !tab.url ||
    (!YOUTUBE_LIVE_URL.test(tab.url) && !TWITCH_CHANNEL_URL.test(tab.url))
  ) {
    if (tab.id !== undefined) {
      await showError(
        tab.id,
        "YouTube LiveまたはTwitchの配信ページで使用してください。",
      );
    } else {
      await setBadgeError("!");
    }
    return;
  }

  const { displayMode = "overlay" } =
    await chrome.storage.local.get("displayMode");

  if (displayMode === "popup") {
    try {
      await chrome.tabs.sendMessage(
        tab.id,
        { type: "CLOSE_CHAT_OVERLAY" } satisfies RuntimeMessage,
        { frameId: 0 },
      );
    } catch {
      // The overlay content script may not be ready yet; the popup can still open.
    }
    await chrome.windows.create({
      url: chrome.runtime.getURL(
        `src/window/index.html?tabId=${encodeURIComponent(tab.id)}&view=popup`,
      ),
      type: "popup",
      width: 580,
      height: 270,
      focused: true,
    });
    return;
  }

  try {
    await chrome.tabs.sendMessage(
      tab.id,
      { type: "TOGGLE_CHAT_OVERLAY", tabId: tab.id } satisfies RuntimeMessage,
      { frameId: 0 },
    );
  } catch {
    await showError(
      tab.id,
      "入力パネルを表示できません。ページを再読み込みしてから、もう一度お試しください。",
    );
  }
});

chrome.runtime.onMessage.addListener(
  (
    message: RuntimeMessage,
    _sender,
    sendResponse: (
      response: TargetResponse | ChatResponse | TwitchAuthResponse,
    ) => void,
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
        .then(async (response) => {
          if (!response.ok) await showError(message.tabId, response.error);
          sendResponse(response);
        })
        .catch((error: unknown) => {
          sendResponse({ ok: false, error: errorMessage(error) });
        });
      return true;
    }

    if (message.type === "GET_TWITCH_AUTH_STATUS") {
      isTwitchAuthenticated()
        .then((authenticated) => sendResponse({ ok: true, authenticated }))
        .catch((error: unknown) => {
          sendResponse({
            ok: false,
            authenticated: false,
            error: errorMessage(error),
          });
        });
      return true;
    }

    if (message.type === "AUTHENTICATE_TWITCH") {
      authenticateTwitch()
        .then(() => sendResponse({ ok: true, authenticated: true }))
        .catch((error: unknown) => {
          sendResponse({
            ok: false,
            authenticated: false,
            error: errorMessage(error),
          });
        });
      return true;
    }

    if (message.type === "DISCONNECT_TWITCH") {
      disconnectTwitch()
        .then(() => sendResponse({ ok: true, authenticated: false }))
        .catch((error: unknown) => {
          sendResponse({
            ok: false,
            authenticated: false,
            error: errorMessage(error),
          });
        });
      return true;
    }

    if (message.type === "UPDATE_TEXT_COUNT") {
      chrome.tabs
        .sendMessage(
          message.tabId,
          {
            type: "TEXT_COUNT_UPDATED",
            count: message.count,
            limit: message.limit,
          } satisfies RuntimeMessage,
          { frameId: 0 },
        )
        .catch(() => undefined);
      return false;
    }

    return false;
  },
);

async function getTarget(tabId: number): Promise<TargetInfo> {
  const tab = await chrome.tabs.get(tabId);
  if (tab.url && YOUTUBE_LIVE_URL.test(tab.url)) {
    return {
      title: tab.title ?? "YouTube Live",
      url: tab.url,
      platform: "youtube",
    };
  }
  if (tab.url && TWITCH_CHANNEL_URL.test(tab.url)) {
    return {
      title: tab.title ?? "Twitch",
      url: tab.url,
      platform: "twitch",
    };
  }
  throw new Error("対象タブは対応している配信ページではありません。");
}

async function sendChat(tabId: number, text: string): Promise<ChatResponse> {
  const target = await getTarget(tabId);
  const characterLimit = target.platform === "twitch" ? 500 : 200;
  if (Array.from(text).length > characterLimit) {
    return {
      ok: false,
      error: `文字数上限（${characterLimit}文字）を超えています。`,
    };
  }

  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: "メッセージを入力してください。" };

  if (target.platform === "twitch") {
    const channel = new URL(target.url).pathname.split("/").filter(Boolean)[0];
    if (!channel)
      return { ok: false, error: "Twitchチャンネルを特定できません。" };
    return sendTwitchChat(channel, trimmed);
  }
  const youtubeText = trimmed.replace(/\r\n|\r|\n/g, " ");
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
      args: [youtubeText],
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
      { type: "CHAT_SEND", text: youtubeText } satisfies RuntimeMessage,
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

async function showError(tabId: number, message: string): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId, frameIds: [0] },
      func: showToastInPage,
      args: [message],
    });
  } catch {
    await setBadgeError("!");
  }
}

function showToastInPage(message: string): void {
  const id = "nikotai-chat-error-toast";
  document.getElementById(id)?.remove();

  const host = document.createElement("div");
  host.id = id;
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = `
    .toast {
      position: fixed;
      top: 16px;
      right: 16px;
      z-index: 2147483647;
      display: flex;
      max-width: min(420px, calc(100vw - 32px));
      align-items: flex-start;
      gap: 12px;
      border: 1px solid #ff6b6b;
      border-radius: 10px;
      background: #211717;
      box-shadow: 0 10px 36px rgb(0 0 0 / 45%);
      padding: 12px 12px 12px 14px;
      color: #fff;
      font: 13px/1.5 system-ui, sans-serif;
    }
    .message { overflow-wrap: anywhere; }
    button {
      flex: 0 0 auto;
      border: 0;
      background: transparent;
      padding: 0;
      color: #aaa;
      font: 20px/1 system-ui, sans-serif;
      cursor: pointer;
    }
    button:hover { color: #fff; }
    @media (prefers-color-scheme: light) {
      .toast {
        border-color: #d93025;
        background: #fff4f2;
        box-shadow: 0 10px 36px rgb(0 0 0 / 22%);
        color: #202124;
      }
      button { color: #666; }
      button:hover { color: #111; }
    }
  `;
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.setAttribute("role", "alert");
  const text = document.createElement("span");
  text.className = "message";
  text.textContent = message;
  const close = document.createElement("button");
  close.type = "button";
  close.setAttribute("aria-label", "閉じる");
  close.textContent = "×";
  close.addEventListener("click", () => host.remove());
  toast.append(text, close);
  shadow.append(style, toast);
  document.documentElement.append(host);
  setTimeout(() => host.remove(), 6000);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
