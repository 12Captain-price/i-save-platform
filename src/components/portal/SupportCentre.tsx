import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { contentSupportApi as api, harareDate } from "@/lib/content-support-api";

type Ticket = {
  id: number;
  number: string;
  subject: string;
  category: string;
  status: string;
  revision: number;
  assigned_to?: number | null;
  messages?: { id: number; internal: boolean; body: string; actor: string; recorded_at: string }[];
  history?: {
    id: number;
    action: string;
    status: string;
    reason: string;
    actor: string;
    recorded_at: string;
  }[];
};
const statuses = ["Open", "In progress", "Waiting for member", "Resolved"];
const field = "mt-2 w-full rounded-md border border-border bg-background p-3";
export function SupportCentre({ member }: { member: boolean }) {
  const auth = useAuth(),
    caps = auth.identity?.permissions ?? [];
  const [items, setItems] = useState<Ticket[]>([]),
    [ticket, setTicket] = useState<Ticket | null>(null),
    [total, setTotal] = useState(0),
    [skip, setSkip] = useState(0),
    [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [assignees, setAssignees] = useState<{ id: number; email: string }[]>([]);
  const [category, setCategory] = useState("Other"),
    [subject, setSubject] = useState(""),
    [message, setMessage] = useState(""),
    [key, setKey] = useState(crypto.randomUUID()),
    [action, setAction] = useState("reply"),
    [reason, setReason] = useState(""),
    [nextStatus, setNextStatus] = useState("In progress"),
    [assignee, setAssignee] = useState("");
  async function load() {
    setBusy(true);
    setError("");
    try {
      const r = await api(
        "/api/support?" +
          new URLSearchParams({ q: search, status, skip: String(skip), limit: "20" }),
      );
      setItems(r.items);
      setTotal(r.total);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, [skip, search, status]);
  useEffect(() => {
    if (!member && caps.includes("support:assign"))
      void api("/api/support/assignees")
        .then(setAssignees)
        .catch(() => setAssignees([]));
  }, [member, caps.join(",")]);
  async function open(id: number) {
    setBusy(true);
    setError("");
    try {
      setTicket(await api("/api/support/" + id));
      setMessage("");
      setReason("");
      setAction("reply");
      setKey(crypto.randomUUID());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api(
        "/api/support" + (ticket ? "/" + ticket.id : ""),
        ticket
          ? {
              action,
              base_revision: ticket.revision,
              message,
              reason,
              status: action === "status" ? nextStatus : null,
              assignee_id: action === "assign" && assignee ? Number(assignee) : null,
              request_key: key,
            }
          : { category, subject, message, request_key: key },
      );
      setTicket(result);
      setMessage("");
      setReason("");
      setSubject("");
      setKey(crypto.randomUUID());
      setNotice("Saved. No response deadline is promised.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const actions = member
    ? ["reply", "reopen"]
    : [
        ...(caps.includes("support:reply") ? ["reply", "reopen"] : []),
        ...(caps.includes("support:internal") ? ["internal_note"] : []),
        ...(caps.includes("support:assign") ? ["assign"] : []),
        ...(caps.includes("support:resolve") ? ["status"] : []),
      ];
  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm text-muted-foreground">
        Ask about your recorded information. Never send passwords, setup links or private document
        contents. Attachments are unavailable. No guaranteed response deadline or automatic closure
        applies.
      </p>
      {error && (
        <div role="alert">
          <p>{error}</p>
          <Button variant="outline" onClick={() => (ticket ? void open(ticket.id) : void load())}>
            Refresh current record
          </Button>
          <p className="mt-2 text-sm">
            Your entered details remain available. If a response was lost, retry the same action
            before editing it.
          </p>
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
      {busy && <p role="status">Loading support…</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSkip(0);
          setSearch(query);
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <label className="min-w-48 flex-1">
          Search subject or reference
          <input
            className={field}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            maxLength={100}
          />
        </label>
        <label>
          Status
          <select
            className={field}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setSkip(0);
            }}
          >
            <option value="">All statuses</option>
            {statuses.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <Button disabled={busy}>Search tickets</Button>
      </form>
      {!busy && !items.length && <p>No support tickets match this page.</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {items.map((t) => (
          <button
            key={t.id}
            className="rounded-xl border border-border bg-card p-5 text-left hover:border-primary"
            onClick={() => void open(t.id)}
          >
            <span className="text-sm text-primary">
              {t.number} · {t.status}
            </span>
            <h2 className="mt-2 break-words font-semibold">{t.subject}</h2>
            <p className="mt-2 text-sm">{t.category}</p>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        <Button
          variant="outline"
          disabled={busy || skip === 0}
          onClick={() => setSkip(Math.max(0, skip - 20))}
        >
          Previous
        </Button>
        <span>
          {total} tickets · Page {skip / 20 + 1}
        </span>
        <Button
          variant="outline"
          disabled={busy || skip + 20 >= total}
          onClick={() => setSkip(skip + 20)}
        >
          Next
        </Button>
        {member && (
          <Button
            onClick={() => {
              setTicket(null);
              setMessage("");
              setSubject("");
              setKey(crypto.randomUUID());
            }}
          >
            New support ticket
          </Button>
        )}
      </div>
      {(ticket || member) && (
        <section className="rounded-xl border border-border bg-card p-5 sm:p-7">
          <h2 className="text-xl font-semibold">
            {ticket ? ticket.number + " · " + ticket.status : "New support ticket"}
          </h2>
          {ticket && (
            <>
              <h3 className="mt-3 font-semibold">{ticket.subject}</h3>
              <ol className="my-5 space-y-4" aria-label="Conversation">
                {ticket.messages?.map((m) => (
                  <li key={m.id} className="rounded-lg border border-border p-4">
                    <p className="text-sm text-primary">
                      {m.internal ? "Internal note · " : ""}
                      {m.actor} · {harareDate(m.recorded_at)}
                    </p>
                    <p className="mt-3 whitespace-pre-wrap break-words">{m.body}</p>
                  </li>
                ))}
              </ol>
              <details className="mb-5">
                <summary>Ticket history</summary>
                {ticket.history?.map((h) => (
                  <p className="mt-3 text-sm" key={h.id}>
                    {h.action} · {h.status} · {h.actor} · {harareDate(h.recorded_at)}
                    {h.reason ? " · " + h.reason : ""}
                  </p>
                ))}
              </details>
            </>
          )}
          <form onSubmit={submit} className="space-y-4">
            {!ticket ? (
              <>
                <label className="block">
                  Category
                  <select
                    className={field}
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    {["Account", "Membership", "Savings", "Fees", "Technical", "Other"].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  Subject
                  <input
                    required
                    maxLength={200}
                    className={field}
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                  />
                </label>
              </>
            ) : (
              <label className="block">
                Explicit action
                <select
                  className={field}
                  value={action}
                  onChange={(e) => {
                    setAction(e.target.value);
                    setKey(crypto.randomUUID());
                  }}
                >
                  {actions.map((a) => (
                    <option key={a} value={a}>
                      {
                        {
                          reply: "Reply",
                          internal_note: "Internal note — office only",
                          assign: "Assign authorised staff",
                          status: "Change status",
                          reopen: "Reopen resolved ticket",
                        }[a]
                      }
                    </option>
                  ))}
                </select>
              </label>
            )}
            {(!ticket || ["reply", "internal_note"].includes(action)) && (
              <label className="block">
                {action === "internal_note" && ticket
                  ? "Internal note — never visible to the member"
                  : "Message"}
                <textarea
                  required
                  maxLength={6000}
                  rows={5}
                  className={field}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </label>
            )}
            {ticket && action === "assign" && (
              <label className="block">
                Assign to
                <select
                  className={field}
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                >
                  <option value="">Unassigned</option>
                  {assignees.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.email}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {ticket && action === "status" && (
              <label className="block">
                New status
                <select
                  className={field}
                  value={nextStatus}
                  onChange={(e) => setNextStatus(e.target.value)}
                >
                  {statuses.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
            )}
            {ticket && ["assign", "status", "reopen"].includes(action) && (
              <label className="block">
                Reason
                <textarea
                  required
                  maxLength={1000}
                  className={field}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
            )}
            <Button disabled={busy || (!!ticket && !actions.includes(action))}>
              {ticket ? "Save support action" : "Create support ticket"}
            </Button>
          </form>
        </section>
      )}
    </div>
  );
}
