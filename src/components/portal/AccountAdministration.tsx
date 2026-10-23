import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
type Staff = {
  id: number;
  email: string;
  role: string;
  status: string;
  permissions: string[];
  overrides: Record<string, boolean>;
  invitations: {
    purpose: string;
    delivery_state: string;
    expires_at: string;
    consumed_at: string | null;
    revoked_at: string | null;
  }[];
};
type Capability = { code: string; description: string; held: boolean; delegable: boolean };
async function api(path: string, body?: unknown, method = "POST") {
  const r = await fetch(
    path,
    body === undefined
      ? {}
      : {
          method,
          headers: { "Content-Type": "application/json", "X-Isave-Request": "1" },
          body: JSON.stringify(body),
        },
  );
  const data = await r.json();
  if (!r.ok) throw Error(data.error ?? "Unable to load records.");
  return data;
}
export function StaffAdministration({ capabilitiesOnly = false }: { capabilitiesOnly?: boolean }) {
  const auth = useAuth();
  const [items, setItems] = useState<Staff[]>([]),
    [catalog, setCatalog] = useState<Capability[]>([]),
    [q, setQ] = useState(""),
    [skip, setSkip] = useState(0),
    [total, setTotal] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const [email, setEmail] = useState(""),
    [role, setRole] = useState("staff"),
    [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const permitted =
    auth.identity?.workspace === "admin" &&
    ["users:read", "users:write", "roles:write"].every((c) =>
      auth.identity?.permissions.includes(c),
    );
  async function load(offset = skip) {
    setBusy(true);
    setError("");
    try {
      const [data, capabilities] = await Promise.all([
        api("/api/admin/staff?" + new URLSearchParams({ q, skip: String(offset), limit: "20" })),
        api("/api/admin/capabilities"),
      ]);
      setItems(data.items);
      setTotal(data.total);
      setCatalog(capabilities);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load staff.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (permitted) void load();
  }, [permitted, skip]);
  async function action(path: string, body: unknown, method = "POST") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = await api(path, body, method);
      setNotice(
        data.delivery_state
          ? "Invitation recorded: " +
              data.delivery_state +
              ". SMTP acceptance is not proof of inbox delivery."
          : "Change saved. Affected sessions are revoked.",
      );
      await load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save. Refresh before retrying.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  if (!permitted)
    return (
      <p role="alert">Security administrator access is required. No accounts have been changed.</p>
    );
  return (
    <div className="space-y-6">
      <p>
        Use existing capabilities to control operational access. Role restrictions still apply; a
        grant cannot bypass a disabled business workflow. You cannot change your own access or
        remove the last active administrator.
      </p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {busy && <p role="status">Loading…</p>}
      <Button variant="outline" disabled={busy} onClick={() => void load()}>
        Refresh staff
      </Button>
      {capabilitiesOnly && (
        <section className="rounded-xl border bg-card p-5">
          <h2 className="text-xl font-semibold">Roles & permissions</h2>
          <p>
            Member access is owned records only. Staff and Finance receive their existing role
            templates plus individual allow/deny overrides. Security administration cannot be
            delegated to operational roles. Effective access below includes role restrictions.
          </p>
          <ul className="mt-4 grid gap-3 md:grid-cols-2">
            {catalog.map((c) => (
              <li key={c.code}>
                <strong>{c.description}</strong>
                <p className="text-sm text-muted-foreground">
                  {c.delegable
                    ? "Assignable when supported by the target role"
                    : "Restricted or not held by you"}{" "}
                  · {c.code}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
      <form
        className="space-y-4 rounded-xl border bg-card p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await action("/api/admin/staff/invitations", { email, role, request_key: requestKey })
          ) {
            setEmail("");
            setRequestKey(crypto.randomUUID());
          }
        }}
      >
        <h2 className="text-xl font-semibold">Invite operational staff</h2>
        <p>
          No reusable password is created. Invitations expire after one hour. Local delivery is
          Mailpit capture; production sending remains unavailable.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            Email address
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setRequestKey(crypto.randomUUID());
              }}
            />
          </label>
          <label>
            Role
            <select
              className="mt-2 block w-full rounded border bg-background p-2"
              value={role}
              onChange={(e) => {
                setRole(e.target.value);
                setRequestKey(crypto.randomUUID());
              }}
            >
              <option value="staff">Staff</option>
              <option value="finance">Finance</option>
            </select>
          </label>
        </div>
        <Button disabled={busy}>Invite staff</Button>
      </form>
      <form
        className="flex flex-wrap gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setSkip(0);
          void load(0);
        }}
      >
        <label>
          Search staff email
          <Input value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <Button disabled={busy}>Search staff</Button>
      </form>
      {!busy && items.length === 0 && <p>No staff match this search.</p>}
      {items.map((user) => (
        <section key={user.id} className="space-y-4 rounded-xl border bg-card p-5">
          <h2 className="break-all text-xl font-semibold">{user.email}</h2>
          <p>
            {user.role} · {user.status}
          </p>
          <p className="break-words text-sm">
            Effective access: {user.permissions.join(", ") || "No operational capabilities"}
          </p>
          <Button
            disabled={busy || user.id === auth.identity?.user.id}
            variant="outline"
            onClick={() =>
              void action(
                `/api/admin/staff/${user.id}/status`,
                { active: user.status === "Suspended" },
                "PUT",
              )
            }
          >
            {user.status === "Suspended" ? "Restore active status" : "Suspend account"}
          </Button>
          {user.status === "Invited" && (
            <Button
              disabled={busy}
              variant="outline"
              onClick={() =>
                void action(`/api/admin/staff/${user.id}/invitation`, {
                  request_key: crypto.randomUUID(),
                })
              }
            >
              Replace invitation and revoke prior link
            </Button>
          )}
          <ul className="space-y-2 text-sm">
            {user.invitations.map((r, i) => (
              <li key={i}>
                {r.purpose} · {r.delivery_state} ·{" "}
                {r.consumed_at
                  ? "Used"
                  : r.revoked_at
                    ? "Revoked"
                    : "Expires " + new Date(r.expires_at).toLocaleString()}
              </li>
            ))}
          </ul>
          {user.role !== "administrator" && (
            <details>
              <summary className="cursor-pointer text-primary">Individual permissions</summary>
              <p className="my-3 text-sm">
                Allow or deny overrides the role template. Default removes the override. Saved
                changes revoke this staff member’s sessions. The effective list shows capabilities
                actually usable by their role.
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                {catalog
                  .filter((c) => c.delegable)
                  .map((c) => (
                    <label key={c.code} className="rounded border p-3">
                      {c.description}
                      <select
                        className="mt-2 block w-full rounded border bg-background p-2"
                        aria-label={`${user.email} ${c.code}`}
                        disabled={busy}
                        value={
                          user.overrides[c.code] === undefined
                            ? "default"
                            : String(user.overrides[c.code])
                        }
                        onChange={(e) =>
                          void action(
                            `/api/admin/staff/${user.id}/permissions/${c.code}`,
                            {
                              allowed:
                                e.target.value === "default" ? null : e.target.value === "true",
                            },
                            "PUT",
                          )
                        }
                      >
                        <option value="default">Role default</option>
                        <option value="true">Allow</option>
                        <option value="false">Deny</option>
                      </select>
                    </label>
                  ))}
              </div>
            </details>
          )}
        </section>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={busy || skip === 0} onClick={() => setSkip(Math.max(0, skip - 20))}>
          Previous
        </Button>
        <span>
          {total} accounts · Page {Math.floor(skip / 20) + 1}
        </span>
        <Button disabled={busy || skip + 20 >= total} onClick={() => setSkip(skip + 20)}>
          Next
        </Button>
      </div>
    </div>
  );
}

type Notice = {
  id: number;
  message: string;
  read: boolean;
  created_at: string;
  link: string | null;
};
export function NotificationCentre() {
  const [items, setItems] = useState<Notice[]>([]),
    [unread, setUnread] = useState(0),
    [total, setTotal] = useState(0),
    [skip, setSkip] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    setError("");
    try {
      const data = await api("/api/notifications?skip=" + skip);
      setItems(data.items);
      setUnread(data.unread);
      setTotal(data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load notifications.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, [skip]);
  return (
    <section className="space-y-5">
      <h2 className="text-xl font-semibold">{unread} unread notifications</h2>
      <p>
        Updates reflect recorded events. Approval is not payout. Pending contributions are not
        confirmed savings.
      </p>
      <Button variant="outline" disabled={busy} onClick={() => void load()}>
        Refresh notifications
      </Button>
      {busy && <p role="status">Loading…</p>}
      {error && <p role="alert">{error}</p>}
      {!busy && !error && !items.length && <p>No notifications yet.</p>}
      {items.map((n) => (
        <article className="space-y-3 rounded-xl border bg-card p-5" key={n.id}>
          <p className={n.read ? "text-muted-foreground" : "font-semibold"}>{n.message}</p>
          <p className="text-sm">
            {new Date(n.created_at).toLocaleString()} · {n.read ? "Read" : "Unread"}
          </p>
          {n.link && (
            <a className="block text-primary underline" href={n.link}>
              View supported records
            </a>
          )}
          <Button
            disabled={busy}
            variant="outline"
            onClick={async () => {
              setBusy(true);
              try {
                await api("/api/notifications/" + n.id, { read: !n.read }, "PUT");
                await load();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Unable to update.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Mark {n.read ? "unread" : "read"}
          </Button>
        </article>
      ))}
      <div className="flex gap-3">
        <Button disabled={busy || !skip} onClick={() => setSkip(Math.max(0, skip - 20))}>
          Previous
        </Button>
        <Button disabled={busy || skip + 20 >= total} onClick={() => setSkip(skip + 20)}>
          Next
        </Button>
      </div>
    </section>
  );
}

export function NotificationDelivery() {
  const [links,setLinks]=useState<{request_key:string;user_id:number;purpose:string;delivery_state:string;expires_at:string;consumed_at:string|null;revoked_at:string|null}[]>([]);
  const [notice,setNotice]=useState('');
  const [items, setItems] = useState<{ id: number; state: string; attempts: number }[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),[skip,setSkip]=useState(0),[total,setTotal]=useState(0);
  async function load() {
    setBusy(true);setError('');
    try {
      const data = await api("/api/admin/notification-deliveries?skip="+skip);
      setItems(data.items);
      setLinks(data.links??[]);setTotal(Math.max(data.total,data.link_total??0));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load.");
    }finally{setBusy(false);}
  }
  useEffect(() => {
    void load();
  }, [skip]);
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">Notification email capture</h2>
      <p>
        In-app events are saved transactionally. Email contains only a generic update. Mailpit
        acceptance is not inbox delivery. Uncertain attempts are not retried automatically, to avoid
        duplicate email; financial events are never repeated.
      </p>
      {error && <p role="alert">{error}</p>}
      {notice&&<p role="status">{notice}</p>}
      <Button variant="outline" disabled={busy} onClick={() => void load()}>
        Refresh delivery status
      </Button>
      {busy&&<p role="status">Loading delivery status…</p>}
      {!busy&&!error&&!items.length && <p>No notification delivery records.</p>}
      {items.map((r) => (
        <div key={r.id} className="flex flex-wrap items-center gap-4 rounded border bg-card p-4">
          <span>
            Notification {r.id} · {r.state} · {r.attempts} attempts
          </span>
          <Button
            disabled={busy || ["Mailpit accepted", "Sending", "Uncertain"].includes(r.state)}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await api(`/api/admin/notification-deliveries/${r.id}/retry`, {});
                await load();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Unable to capture.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Capture locally / retry unavailable delivery
          </Button>
        </div>
      ))}
      <h3 className="text-lg font-semibold">Private-link delivery history</h3>
      <p>Replacement retains history and revokes prior links. Passwords are set privately; no account access or financial record is changed by sending a link.</p>
      {!busy&&!links.length&&<p>No private-link delivery records.</p>}
      {links.map(r=><article key={r.request_key} className="space-y-3 rounded border bg-card p-4"><p>Account {r.user_id} · {r.purpose} · {r.delivery_state}</p><p>{r.consumed_at?'Used':r.revoked_at?'Revoked':'Expires '+new Date(r.expires_at).toLocaleString()}</p><Button disabled={busy||!!r.consumed_at||!!r.revoked_at} variant="outline" onClick={async()=>{setBusy(true);setError('');setNotice('');try{const data=await api(`/api/admin/account-links/${r.request_key}/replace`,{request_key:crypto.randomUUID()});setNotice('Replacement recorded: '+data.delivery_state+'. This does not confirm inbox delivery.');await load();}catch(e){setError(e instanceof Error?e.message:'Unable to replace link. Refresh before retrying.');}finally{setBusy(false);}}}>Replace private link</Button></article>)}
      <div className="flex gap-3"><Button disabled={busy||skip===0} onClick={()=>setSkip(Math.max(0,skip-20))}>Previous</Button><Button disabled={busy||skip+20>=total} onClick={()=>setSkip(skip+20)}>Next</Button></div>
    </section>
  );
}
