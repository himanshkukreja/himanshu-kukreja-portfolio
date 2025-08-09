"use client";
import { useEffect, useMemo, useState, useCallback } from "react";
import { Download, Eye, Mail, Users, Check, X, Search, Filter } from "lucide-react";

type SubRow = { email: string; created_at: string; city?: string | null; region?: string | null; country?: string | null; timezone?: string | null; unsubscribed?: boolean | null };

type Story = { slug: string; title: string; excerpt?: string };

export default function AdminPanel() {
  const [token, setToken] = useState<string>("");
  const [verified, setVerified] = useState<boolean>(false);
  const [subs, setSubs] = useState<SubRow[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [logs, setLogs] = useState<{ email: string; status: string; detail?: string; created_at: string }[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([]);
  const [subject, setSubject] = useState<string>("🚀 Your Weekly Dose of Engineering Stories is Here!");
  const [selectAllEmails, setSelectAllEmails] = useState<boolean>(false);
  const [headerTitle, setHeaderTitle] = useState<string>("Latest from Himanshu Kukreja");

  // Search & filter state
  const [storyQuery, setStoryQuery] = useState<string>("");
  const [subscriberQuery, setSubscriberQuery] = useState<string>("");
  const [showActiveOnly, setShowActiveOnly] = useState<boolean>(true);

  // Confirmation modal
  const [confirmOpen, setConfirmOpen] = useState<boolean>(false);

  // Helper: verify token against a protected API
  const verifyToken = useCallback(async (t: string): Promise<boolean> => {
    if (!t) return false;
    try {
      const r = await fetch("/api/admin/logs?limit=1", { headers: { "x-admin-token": t }, cache: "no-store" });
      return r.ok;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    const t = sessionStorage.getItem("adminToken") || "";
    if (!t) return;
    setToken(t);
    verifyToken(t).then((ok) => {
      if (ok) setVerified(true);
      else {
        sessionStorage.removeItem("adminToken");
        setToken("");
        setVerified(false);
      }
    });
  }, [verifyToken]);

  const canCall = useMemo(() => !!token && verified, [token, verified]);

  const handleUnauthorized = useCallback(() => {
    sessionStorage.removeItem("adminToken");
    setVerified(false);
    setToken("");
  }, []);

  const fetchSubs = useCallback(async () => {
    if (!canCall) return;
    const r = await fetch("/api/admin/subscribers", { headers: { "x-admin-token": token }, cache: "no-store" });
    if (r.status === 401) return handleUnauthorized();
    if (r.ok) {
      const data: SubRow[] = await r.json();
      setSubs(data);
    }
  }, [canCall, token, handleUnauthorized]);

  const fetchLogs = useCallback(async () => {
    if (!canCall) return;
    const r = await fetch("/api/admin/logs?limit=100", { headers: { "x-admin-token": token }, cache: "no-store" });
    if (r.status === 401) return handleUnauthorized();
    if (r.ok) setLogs(await r.json());
  }, [canCall, token, handleUnauthorized]);

  const fetchStories = useCallback(async () => {
    if (!canCall) return;
    const r = await fetch("/api/stories", { cache: "no-store" });
    if (r.ok) {
      type RawStory = { slug: string; title: string; excerpt?: string };
      const j: { stories?: RawStory[] } = await r.json();
      const data: Story[] = (j?.stories || []).map((s) => ({ slug: s.slug, title: s.title, excerpt: s.excerpt }));
      setStories(data);
    }
  }, [canCall]);

  // Fetch after auth
  useEffect(() => {
    if (!canCall) return;
    fetchStories();
  }, [canCall, fetchStories]);

  useEffect(() => {
    if (!canCall) return;
    setLoading(true);
    Promise.all([fetchSubs(), fetchLogs()]).finally(() => setLoading(false));
  }, [canCall, fetchSubs, fetchLogs]);

  const filteredStories = useMemo(() => {
    const q = storyQuery.trim().toLowerCase();
    if (!q) return stories;
    return stories.filter((s) =>
      s.title.toLowerCase().includes(q) ||
      (s.excerpt ? s.excerpt.toLowerCase().includes(q) : false) ||
      s.slug.toLowerCase().includes(q)
    );
  }, [stories, storyQuery]);

  const filteredSubs = useMemo(() => {
    const q = subscriberQuery.trim().toLowerCase();
    let base = subs;
    if (showActiveOnly) base = base.filter((s) => !s.unsubscribed);
    if (!q) return base;
    return base.filter((s) =>
      s.email.toLowerCase().includes(q) ||
      (s.city ? s.city.toLowerCase().includes(q) : false) ||
      (s.region ? s.region.toLowerCase().includes(q) : false) ||
      (s.country ? s.country.toLowerCase().includes(q) : false) ||
      (s.timezone ? s.timezone.toLowerCase().includes(q) : false)
    );
  }, [subs, subscriberQuery, showActiveOnly]);

  const activeSubscribers = useMemo(() => subs.filter(s => !s.unsubscribed), [subs]);
  const visibleActiveSubscribers = useMemo(() => filteredSubs.filter(s => !s.unsubscribed), [filteredSubs]);

  const allSelectableEmails = useMemo(() => visibleActiveSubscribers.map((s) => s.email), [visibleActiveSubscribers]);
  const allSelectableSlugs = useMemo(() => stories.map((s) => s.slug), [stories]);

  // Handle select all emails (acts on visible, active subscribers)
  useEffect(() => {
    if (selectAllEmails) {
      setSelectedEmails(allSelectableEmails);
    } else {
      setSelectedEmails([]);
    }
  }, [selectAllEmails, allSelectableEmails]);

  const previewHtml = useMemo(() => {
    const chosen = stories.filter((s) => selectedSlugs.length ? selectedSlugs.includes(s.slug) : true).slice(0, 5);
    return `${chosen.length} stor${chosen.length === 1 ? "y" : "ies"} selected: ${chosen.map(s => s.title).join(", ")}`;
  }, [stories, selectedSlugs]);

  const performSend = async () => {
    if (!canCall) return alert("Enter token first");
    const emails = selectedEmails.length ? selectedEmails : allSelectableEmails;
    const slugs = selectedSlugs.length ? selectedSlugs : allSelectableSlugs;
    if (emails.length === 0) return alert("No subscribers selected");
    if (slugs.length === 0) return alert("No stories selected");
    setLoading(true);
    try {
      const res = await fetch("/api/newsletter/send-latest", {
        method: "POST",
        headers: { "x-admin-token": token, "Content-Type": "application/json" },
        body: JSON.stringify({ emails, slugs, subject: subject || undefined, headerTitle: headerTitle || undefined }),
      });
      const json = await res.json();
      alert(JSON.stringify(json));
      await fetchLogs();
    } catch (e: unknown) {
      alert(String(e instanceof Error ? e.message : e));
    } finally {
      setLoading(false);
    }
  };

  const sendCustom = () => {
    if (!canCall) return alert("Enter token first");
    const emails = (selectedEmails.length ? selectedEmails : allSelectableEmails).length;
    const slugs = (selectedSlugs.length ? selectedSlugs : allSelectableSlugs).length;
    if (emails === 0) return alert("No subscribers selected");
    if (slugs === 0) return alert("No stories selected");
    setConfirmOpen(true);
  };

  const openPreview = () => {
    if (!canCall) return alert("Enter token first");
    const slugs = selectedSlugs.length ? selectedSlugs : allSelectableSlugs;
    const url = new URL("/api/admin/preview-email", window.location.origin);
    
    // Open preview in new window
    const previewWindow = window.open("", "_blank", "width=800,height=900,scrollbars=yes");
    if (!previewWindow) return alert("Popup blocked - please allow popups");
    
    fetch(url, {
      method: "POST",
      headers: { "x-admin-token": token, "Content-Type": "application/json" },
      body: JSON.stringify({ slugs, subject, headerTitle })
    })
    .then(r => r.text())
    .then(html => {
      previewWindow.document.write(html);
      previewWindow.document.close();
    })
    .catch((e: unknown) => alert("Preview failed: " + String(e instanceof Error ? e.message : e)));
  };

  const downloadCsv = async () => {
    if (!canCall) return alert("Enter token first");
    try {
      const res = await fetch("/api/admin/export-csv", { 
        headers: { "x-admin-token": token },
        method: "GET"
      });
      if (!res.ok) throw new Error("Export failed");
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `subscribers-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (e: unknown) {
      alert("Export failed: " + String(e instanceof Error ? e.message : e));
    }
  };

  const toggleEmail = (email: string) => {
    setSelectedEmails((prev) => (prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email]));
  };
  const toggleSlug = (slug: string) => {
    setSelectedSlugs((prev) => (prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]));
  };

  const onSaveToken = async () => {
    if (!token) return;
    const ok = await verifyToken(token);
    if (!ok) {
      alert("Invalid admin token");
      sessionStorage.removeItem("adminToken");
      setVerified(false);
      return;
    }
    sessionStorage.setItem("adminToken", token);
    setVerified(true);
  };

  const selectedStoryObjects = useMemo(() => {
    const slugs = selectedSlugs.length ? selectedSlugs : allSelectableSlugs;
    const map = new Set(slugs);
    return stories.filter(s => map.has(s.slug));
  }, [selectedSlugs, allSelectableSlugs, stories]);

  const selectedEmailsEffective = useMemo(() => (selectedEmails.length ? selectedEmails : allSelectableEmails), [selectedEmails, allSelectableEmails]);
  const selectedEmailCount = selectedEmailsEffective.length;
  const sampleRecipients = useMemo(() => selectedEmailsEffective.slice(0, 10), [selectedEmailsEffective]);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/90">
      <details className="mb-6" open={!verified}>
        <summary className="cursor-pointer text-sm text-white/80">Auth</summary>
        <div className="mt-3 space-y-2">
          <p className="text-xs text-white/60">Enter your admin token to access protected actions. Stored only in this browser session.</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="password"
              placeholder="Admin token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="flex-1 rounded-xl bg-white/5 border border-white/10 px-4 py-2 text-sm text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
            />
            <button type="button" onClick={onSaveToken} className="mt-2 sm:mt-0 rounded-xl px-4 py-2 text-sm font-medium text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12),0_10px_30px_-12px_rgba(59,130,246,0.6)] bg-[linear-gradient(110deg,rgba(99,102,241,0.95),rgba(59,130,246,0.95),rgba(147,51,234,0.95))]">
              Save token
            </button>
          </div>
        </div>
      </details>

      {/* Render the rest of the admin UI only when authenticated */}
      {canCall && (
        <>
          {/* Quick actions bar */}
          <div className="mb-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={downloadCsv}
              disabled={!canCall || loading}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)] bg-white/5 hover:bg-white/10 disabled:opacity-60"
            >
              <Download className="h-4 w-4" /> Export CSV
            </button>
            <button
              type="button"
              onClick={openPreview}
              disabled={!canCall || loading}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)] bg-white/5 hover:bg-white/10 disabled:opacity-60"
            >
              <Eye className="h-4 w-4" /> Preview Email
            </button>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-white text-lg font-semibold">Stories</h3>
                <div className="relative w-60">
                  <Search className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50" />
                  <input
                    type="text"
                    value={storyQuery}
                    onChange={(e) => setStoryQuery(e.target.value)}
                    placeholder="Search stories..."
                    className="w-full rounded-xl bg-white/5 border border-white/10 pl-8 pr-3 py-1.5 text-xs text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                  />
                </div>
              </div>
              <div className="space-y-2 max-h-72 overflow-auto rounded-xl border border-white/10 p-3 bg-black/10">
                {filteredStories.map((s) => (
                  <label key={s.slug} className="flex items-start gap-3 text-sm cursor-pointer hover:bg-white/5 p-2 rounded-lg">
                    <input type="checkbox" checked={selectedSlugs.includes(s.slug)} onChange={() => toggleSlug(s.slug)} />
                    <div>
                      <div className="font-medium">{s.title}</div>
                      {s.excerpt && <div className="text-white/70 text-xs line-clamp-2">{s.excerpt}</div>}
                    </div>
                  </label>
                ))}
                {filteredStories.length === 0 && (
                  <div className="text-xs text-white/60">No stories match your search.</div>
                )}
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2 gap-3">
                <h3 className="text-white text-lg font-semibold">Subscribers</h3>
                <div className="flex items-center gap-3">
                  <div className="relative w-56">
                    <Search className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50" />
                    <input
                      type="text"
                      value={subscriberQuery}
                      onChange={(e) => setSubscriberQuery(e.target.value)}
                      placeholder="Search email, city, region..."
                      className="w-full rounded-xl bg-white/5 border border-white/10 pl-8 pr-3 py-1.5 text-xs text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={showActiveOnly}
                      onChange={(e) => setShowActiveOnly(e.target.checked)}
                    />
                    <Filter className="h-4 w-4" />
                    Active only
                  </label>
                  <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                    <input 
                      type="checkbox" 
                      checked={selectAllEmails}
                      onChange={(e) => setSelectAllEmails(e.target.checked)}
                    />
                    <Users className="h-4 w-4" />
                    All ({visibleActiveSubscribers.length})
                  </label>
                </div>
              </div>
              <div className="space-y-2 max-h-72 overflow-auto rounded-xl border border-white/10 p-3 bg-black/10">
                {filteredSubs.map((s) => (
                  <label key={s.email} className="flex items-start gap-3 text-sm cursor-pointer hover:bg-white/5 p-2 rounded-lg">
                    <input 
                      type="checkbox" 
                      checked={selectedEmails.includes(s.email)} 
                      onChange={() => toggleEmail(s.email)} 
                      disabled={!!s.unsubscribed} 
                    />
                    <div className="flex-1">
                      <div className="font-medium flex items-center gap-2">
                        <span>{s.email}</span>
                        {s.unsubscribed ? 
                          <span className="inline-flex items-center gap-1 text-[10px] rounded px-1.5 py-0.5 bg-red-500/20 text-red-300">
                            <X className="h-3 w-3" /> unsubscribed
                          </span> : 
                          <span className="inline-flex items-center gap-1 text-[10px] rounded px-1.5 py-0.5 bg-green-500/20 text-green-300">
                            <Check className="h-3 w-3" /> active
                          </span>
                        }
                      </div>
                      <div className="text-white/70 text-xs">
                        {s.city ? `${s.city}, ` : ""}{s.region ? `${s.region}, ` : ""}{s.country || ""} {s.timezone ? `— ${s.timezone}` : ""}
                      </div>
                    </div>
                  </label>
                ))}
                {filteredSubs.length === 0 && (
                  <div className="text-xs text-white/60">No subscribers match your search/filters.</div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm text-white/80">Subject Line</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="rounded-xl bg-white/5 border border-white/10 px-4 py-2 text-sm text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              />
            </div>
            {/* New: Header title separate from subject */}
            <div className="flex flex-col gap-2">
              <label className="text-sm text-white/80">Email Header Title (top line)</label>
              <input
                type="text"
                value={headerTitle}
                onChange={(e) => setHeaderTitle(e.target.value)}
                placeholder="e.g., Latest from Himanshu Kukreja"
                className="rounded-xl bg-white/5 border border-white/10 px-4 py-2 text-sm text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              />
            </div>
            <div className="rounded-xl border border-white/10 p-4 text-sm bg-black/10">
              <div className="text-white/70 mb-2">Email preview summary</div>
              <div className="text-white/90">{previewHtml}</div>
              <div className="text-white/80 mt-2">
                You are about to send <strong>{selectedStoryObjects.length}</strong> stor{selectedStoryObjects.length === 1 ? "y" : "ies"} to <strong>{selectedEmailCount}</strong> subscriber{selectedEmailCount === 1 ? "" : "s"}.
                {selectedEmailCount > 0 && (
                  <>
                    <span className="block mt-1 text-white/70">Recipients: {sampleRecipients.join(", ")}{selectedEmailCount > sampleRecipients.length ? `, and ${selectedEmailCount - sampleRecipients.length} more` : ""}</span>
                  </>
                )}
              </div>
            </div>
            <div>
              <button
                type="button"
                onClick={sendCustom}
                disabled={!canCall || loading}
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12),0_10px_30px_-12px_rgba(59,130,246,0.6)] bg-[linear-gradient(110deg,rgba(99,102,241,0.95),rgba(59,130,246,0.95),rgba(147,51,234,0.95))] disabled:opacity-60"
              >
                <Mail className="h-4 w-4" />
                {loading ? "Sending..." : "Send Newsletter"}
              </button>
            </div>
          </div>

          {/* Confirm dialog */}
          {confirmOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
              <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0b1020] text-white shadow-xl">
                <div className="border-b border-white/10 p-4">
                  <h4 className="text-base font-semibold">Confirm Send</h4>
                  <p className="text-xs text-white/70 mt-1">Please confirm the recipients and stories before sending.</p>
                </div>
                <div className="p-4 space-y-4 max-h-[70vh] overflow-auto">
                  <div>
                    <div className="text-sm text-white/80">Subject</div>
                    <div className="text-sm">{subject || "(no subject)"}</div>
                  </div>
                  <div>
                    <div className="text-sm text-white/80">Header Title</div>
                    <div className="text-sm">{headerTitle || "(no header title)"}</div>
                  </div>
                  <div>
                    <div className="text-sm text-white/80 mb-1">Recipients ({selectedEmailCount})</div>
                    <ul className="list-disc pl-5 text-sm space-y-1 break-words">
                      {selectedEmailsEffective.slice(0, 100).map((e) => (
                        <li key={e}>{e}</li>
                      ))}
                      {selectedEmailCount > 100 && (
                        <li className="text-white/70">...and {selectedEmailCount - 100} more</li>
                      )}
                    </ul>
                  </div>
                  <div>
                    <div className="text-sm text-white/80 mb-1">Stories ({selectedStoryObjects.length})</div>
                    <ul className="list-disc pl-5 text-sm space-y-1">
                      {selectedStoryObjects.slice(0, 20).map((s) => (
                        <li key={s.slug}>{s.title}</li>
                      ))}
                      {selectedStoryObjects.length > 20 && (
                        <li className="text-white/70">...and {selectedStoryObjects.length - 20} more</li>
                      )}
                    </ul>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 border-t border-white/10 p-4">
                  <button
                    type="button"
                    onClick={() => setConfirmOpen(false)}
                    className="rounded-xl px-3 py-1.5 text-sm bg-white/5 hover:bg-white/10 border border-white/10"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={async () => { setConfirmOpen(false); await performSend(); }}
                    className="rounded-xl px-3 py-1.5 text-sm text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12),0_10px_30px_-12px_rgba(59,130,246,0.6)] bg-[linear-gradient(110deg,rgba(99,102,241,0.95),rgba(59,130,246,0.95),rgba(147,51,234,0.95))]"
                  >
                    Confirm & Send
                  </button>
                </div>
              </div>
            </div>
          )}

          <details className="mt-8">
            <summary className="cursor-pointer text-sm text-white/80">Recent send logs ({logs.length})</summary>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-white/70">
                    <th className="text-left py-2 pr-4">Time</th>
                    <th className="text-left py-2 pr-4">Email</th>
                    <th className="text-left py-2 pr-4">Status</th>
                    <th className="text-left py-2">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l, idx) => (
                    <tr key={`${l.email}-${idx}-${l.created_at}`} className="border-t border-white/10">
                      <td className="py-2 pr-4">{new Date(l.created_at).toLocaleString()}</td>
                      <td className="py-2 pr-4">{l.email}</td>
                      <td className="py-2 pr-4">
                        <span className={`inline-flex items-center gap-1 text-xs rounded px-2 py-1 ${
                          l.status === 'sent' ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'
                        }`}>
                          {l.status === 'sent' ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                          {l.status}
                        </span>
                      </td>
                      <td className="py-2 text-xs">{l.detail || ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </div>
  );
}
