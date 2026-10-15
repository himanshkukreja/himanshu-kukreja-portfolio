"use client";

/**
 * Welcome: the one-time email every new account gets after its first sign-in
 * (POST /api/send-welcome-email, once per account via user_profiles.welcome_email_sent).
 * Sandboxed preview (HTML at desktop / phone width + plain text), "preview as name", and a test
 * send to the signed-in admin (console transport outside production: nothing leaves the machine).
 */
import { useEffect, useState } from "react";
import { Badge, Card, LABEL, useAdminClient } from "../ui";
import { Field, Segmented, btnCls, inputCls, type useFlash } from "./common";
import { WELCOME_PREHEADER, WELCOME_SUBJECT } from "@/lib/email/welcome";

type Say = ReturnType<typeof useFlash>["say"];
type Rendered = { key: string; html: string; text: string } | { key: string; error: string };

export default function WelcomeTab({ say }: { say: Say }) {
  const client = useAdminClient();
  const [nameInput, setNameInput] = useState("");
  const [name, setName] = useState(""); // the name the current preview is rendered for
  const [rendered, setRendered] = useState<Rendered | null>(null);
  const [view, setView] = useState<"html" | "text">("html");
  const [width, setWidth] = useState<"desktop" | "phone">("desktop");
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    let live = true;
    const q = name ? `&name=${encodeURIComponent(name)}` : "";
    Promise.all([client.text(`/api/admin/welcome/preview?format=html${q}`), client.text(`/api/admin/welcome/preview?format=text${q}`)])
      .then(([html, text]) => live && setRendered({ key: name, html, text }))
      .catch((e: Error) => live && setRendered({ key: name, error: e.message }));
    return () => {
      live = false;
    };
  }, [client, name]);

  const loading = !rendered || rendered.key !== name;

  const sendTest = async () => {
    setTesting(true);
    try {
      const r = await client.json<{ to: string; transport: string }>("/api/admin/welcome/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name || undefined }),
      });
      say(r.transport === "console" ? `Test rendered to the server console (not sent) for ${r.to}` : `Test sent to ${r.to}`);
    } catch (e) {
      say(`Test failed: ${(e as Error).message}`, "bad");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card label="email · welcome" title={WELCOME_SUBJECT} action={<Badge tone="muted">sent once per new account</Badge>}>
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="flex min-w-0 flex-col gap-1">
              <span className={LABEL}>subject</span>
              <p className="m-0 break-words text-sm text-fg">{WELCOME_SUBJECT}</p>
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <span className={LABEL}>preheader</span>
              <p className="m-0 break-words text-sm text-fg-2">{WELCOME_PREHEADER}</p>
            </div>
          </div>
          <p className="m-0 text-sm text-fg-3">
            Goes out after a new account&apos;s first sign-in, greeting them by the first name on their profile or Google account (otherwise a neutral “Hi,”). Replies go to your inbox; the footer links to the
            newsletter unsubscribe and the message carries a List-Unsubscribe header.
          </p>
          <form
            className="flex flex-col gap-2 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              setName(nameInput.trim().slice(0, 80));
            }}
          >
            <div className="min-w-0 flex-1">
              <Field label="Preview as name (optional)">
                <input className={inputCls} value={nameInput} onChange={(e) => setNameInput(e.target.value)} placeholder="Priya Sharma" maxLength={80} />
              </Field>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="submit" className={btnCls} disabled={loading}>
                {loading ? "rendering…" : "↻ render"}
              </button>
              <button type="button" onClick={sendTest} disabled={testing} className={btnCls}>
                {testing ? "sending…" : "✉ send test to me"}
              </button>
            </div>
          </form>
        </div>
      </Card>

      <Card
        label="preview"
        action={
          <span className="flex flex-wrap items-center gap-2">
            {view === "html" && (
              <Segmented
                label="Preview width"
                value={width}
                onChange={setWidth}
                options={[
                  { id: "desktop", label: "600px" },
                  { id: "phone", label: "390px" },
                ]}
              />
            )}
            <Segmented
              label="Preview format"
              value={view}
              onChange={setView}
              options={[
                { id: "html", label: "html" },
                { id: "text", label: "plain text" },
              ]}
            />
          </span>
        }
      >
        {rendered && "error" in rendered ? (
          <p className="m-0 text-sm text-bad-text">Preview failed: {rendered.error}</p>
        ) : !rendered ? (
          <div className="h-[60dvh] w-full animate-pulse border border-line bg-surface-2" aria-label="Rendering preview" />
        ) : view === "html" ? (
          <div className="overflow-x-auto">
            {/* sandbox with no permissions: no scripts, no same-origin, no top navigation */}
            <iframe
              title="Welcome email preview"
              sandbox=""
              srcDoc={rendered.html}
              className={`mx-auto block h-[75dvh] border border-line bg-white ${width === "phone" ? "w-[390px] max-w-full" : "w-full max-w-[680px]"} ${loading ? "opacity-60" : ""}`}
            />
          </div>
        ) : (
          <pre className="m-0 max-h-[75dvh] overflow-auto whitespace-pre-wrap break-words border border-line bg-bg p-3 font-mono text-xs leading-relaxed text-fg-2">{rendered.text}</pre>
        )}
      </Card>
    </div>
  );
}
