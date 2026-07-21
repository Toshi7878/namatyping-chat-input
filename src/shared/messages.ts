export type TargetInfo = {
  title: string;
  url: string;
  platform: "youtube" | "twitch";
};

export type TargetResponse =
  | { ok: true; target: TargetInfo }
  | { ok: false; error: string };

export type ChatResponse = { ok: true } | { ok: false; error: string };

export type TwitchAuthResponse =
  | { ok: true; authenticated: boolean }
  | { ok: false; authenticated: false; error: string };

export type RuntimeMessage =
  | { type: "GET_TARGET"; tabId: number }
  | { type: "SEND_CHAT"; tabId: number; text: string }
  | { type: "CHAT_SEND"; text: string }
  | { type: "TOGGLE_CHAT_OVERLAY"; tabId: number }
  | { type: "CLOSE_CHAT_OVERLAY" }
  | { type: "UPDATE_TEXT_COUNT"; tabId: number; count: number; limit: number }
  | { type: "TEXT_COUNT_UPDATED"; count: number; limit: number }
  | { type: "GET_TWITCH_AUTH_STATUS" }
  | { type: "AUTHENTICATE_TWITCH" }
  | { type: "DISCONNECT_TWITCH" };
