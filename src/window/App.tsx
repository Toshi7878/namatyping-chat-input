import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import type {
  ChatResponse,
  TargetInfo,
  TargetResponse,
} from "../shared/messages";

const searchParams = new URLSearchParams(location.search);
const tabId = Number(searchParams.get("tabId"));
const isPopup = searchParams.get("view") === "popup";
const SEND_WITH_ENTER_KEY = "sendWithEnter";
const FONT_SIZE_KEY = "fontSize";

export default function App() {
  const [target, setTarget] = useState<TargetInfo | null>(null);
  const [text, setText] = useState("");
  const [status, setStatus] = useState("接続中…");
  const [sending, setSending] = useState(false);
  const [sendWithEnter, setSendWithEnter] = useState(false);
  const [fontSize, setFontSize] = useState(18);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!Number.isInteger(tabId)) {
      setStatus("送信先が指定されていません。");
      return;
    }

    chrome.runtime
      .sendMessage({ type: "GET_TARGET", tabId })
      .then((response: TargetResponse) => {
        if (!response.ok) {
          setStatus(response.error);
          return;
        }
        setTarget(response.target);
        setStatus("");
        inputRef.current?.focus();
      })
      .catch((error: unknown) => setStatus(errorMessage(error)));
  }, []);

  useEffect(() => {
    chrome.storage.local
      .get([SEND_WITH_ENTER_KEY, FONT_SIZE_KEY])
      .then((stored) => {
        setSendWithEnter(stored[SEND_WITH_ENTER_KEY] === true);
        const storedFontSize = stored[FONT_SIZE_KEY];
        if (typeof storedFontSize === "number") setFontSize(storedFontSize);
      });

    const onChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
    ) => {
      const change = changes[SEND_WITH_ENTER_KEY];
      if (change) setSendWithEnter(change.newValue === true);
      const fontSizeChange = changes[FONT_SIZE_KEY];
      if (typeof fontSizeChange?.newValue === "number") {
        setFontSize(fontSizeChange.newValue);
      }
    };
    chrome.storage.local.onChanged.addListener(onChanged);
    return () => chrome.storage.local.onChanged.removeListener(onChanged);
  }, []);

  async function send(): Promise<void> {
    const outgoingText = text.trim();
    if (sending || !target || !outgoingText) return;

    setSending(true);
    setText("");
    setStatus("送信中…");
    requestAnimationFrame(() => inputRef.current?.focus());

    try {
      const response: ChatResponse = await chrome.runtime.sendMessage({
        type: "SEND_CHAT",
        tabId,
        text: outgoingText,
      });
      if (!response.ok) {
        setStatus(response.error);
        setText((currentText) => currentText || outgoingText);
        return;
      }
      setStatus("");
    } catch (error) {
      setStatus(errorMessage(error));
      setText((currentText) => currentText || outgoingText);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.nativeEvent.isComposing) return;
    const shouldSend = sendWithEnter
      ? event.key === "Enter" && !event.shiftKey
      : event.key === "Enter" && (event.ctrlKey || event.metaKey);
    if (shouldSend) {
      event.preventDefault();
      void send();
    }
  }

  function changeSendMode(enabled: boolean): void {
    void chrome.storage.local.set({ [SEND_WITH_ENTER_KEY]: enabled });
    inputRef.current?.focus();
  }

  function changeFontSize(delta: number): void {
    const nextSize = Math.min(Math.max(fontSize + delta, 12), 32);
    void chrome.storage.local.set({ [FONT_SIZE_KEY]: nextSize });
    inputRef.current?.focus();
  }

  return (
    <main className={isPopup ? "popup-view" : "overlay-view"}>
      <div>
        <textarea
          id="message"
          aria-label="チャットメッセージ"
          style={{ fontSize: `${fontSize}px` }}
          ref={inputRef}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="メッセージを入力"
          rows={3}
          disabled={!target}
        />
        {isPopup && (
          <div className="popup-settings">
            <fieldset className="font-counter" aria-label="文字サイズ">
              <button
                type="button"
                aria-label="文字を小さくする"
                disabled={fontSize <= 12}
                onClick={() => changeFontSize(-1)}
              >
                −
              </button>
              <span>{fontSize}</span>
              <button
                type="button"
                aria-label="文字を大きくする"
                disabled={fontSize >= 32}
                onClick={() => changeFontSize(1)}
              >
                +
              </button>
            </fieldset>
            <label className="send-switch">
              <span>{sendWithEnter ? "Enter" : "Ctrl+Enter"}</span>
              <input
                type="checkbox"
                role="switch"
                aria-checked={sendWithEnter}
                checked={sendWithEnter}
                onChange={(event) => changeSendMode(event.target.checked)}
              />
              <span className="switch-visual" aria-hidden="true" />
            </label>
          </div>
        )}
        {status && (
          <p className="status" role="status">
            {status}
          </p>
        )}
      </div>
    </main>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
