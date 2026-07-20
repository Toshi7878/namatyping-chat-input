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
  | { type: "GET_TWITCH_AUTH_STATUS" }
  | { type: "AUTHENTICATE_TWITCH" };
