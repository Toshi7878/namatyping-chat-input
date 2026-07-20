import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import type {
  ChatResponse,
  TargetInfo,
  TargetResponse,
} from "../shared/messages";

const tabId = Number(new URLSearchParams(location.search).get("tabId"));

export default function App() {
  const [target, setTarget] = useState<TargetInfo | null>(null);
  const [text, setText] = useState("");
  const [status, setStatus] = useState("接続中…");
  const [sending, setSending] = useState(false);
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
        setStatus("送信できます");
        inputRef.current?.focus();
      })
      .catch((error: unknown) => setStatus(errorMessage(error)));
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
      setStatus("送信しました");
    } catch (error) {
      setStatus(errorMessage(error));
      setText((currentText) => currentText || outgoingText);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  function onSubmit(event: FormEvent): void {
    event.preventDefault();
    void send();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void send();
    }
  }

  return (
    <main>
      <header>
        <span className="live-dot" aria-hidden="true" />
        <div>
          <p className="eyebrow">送信先</p>
          <p className="title" title={target?.title}>
            {target?.title ?? "YouTube Live"}
          </p>
        </div>
      </header>
      <form onSubmit={onSubmit}>
        <label htmlFor="message">チャットメッセージ</label>
        <textarea
          id="message"
          ref={inputRef}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="メッセージを入力"
          rows={5}
          disabled={!target}
        />
        <div className="footer">
          <p className="status" role="status">
            {status}
          </p>
          <button type="submit" disabled={!target || sending || !text.trim()}>
            {sending ? "送信中" : "送信"}
          </button>
        </div>
        <p className="hint">Ctrl / ⌘ + Enter で送信</p>
      </form>
    </main>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
