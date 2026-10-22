import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { RegistrationEvidence } from "@/components/auth/RegistrationEvidence";
import { MemberPlans, PlanOffers, MemberPlanSummary } from "@/components/portal/MemberPlans";
import { ApplicationDocuments } from "@/components/portal/ApplicationDocuments";
import { PlanPublication } from "@/components/portal/PlanPublication";
import { PlanApplicationReview } from '@/components/portal/PlanApplicationReview';
import { handleAuthentication } from "@/lib/auth-server";

const state = vi.hoisted(() => ({ permissions: ["plans:own"], refresh: vi.fn() }));
it('shows readable enrolment separators and a clear loading message',async()=>{
 let resolve!:(value:Response)=>void;
 vi.stubGlobal('fetch',vi.fn(()=>new Promise<Response>(done=>{resolve=done})));
 render(<MemberPlanSummary/>);
 expect(screen.getByRole('status')).toHaveTextContent('Loading enrolment summary...');
 resolve(Response.json({items:[{id:1,terms:{category:'education'},status:'Active',weekly_target:'10.00',currency:'USD',enrolment:{start_date:'2026-10-21',end_date:'2027-06-21'}}]}));
 await screen.findByText('education · Active · Weekly target 10.00 USD');
 expect(screen.getByText('Start 2026-10-21 · Programme completion 2027-06-21')).toBeInTheDocument();
 expect(document.body.textContent).not.toContain(' ? ');
});
vi.mock("@/components/auth/AuthProvider", () => ({
  useAuth: () => ({ identity: { permissions: state.permissions }, refresh: state.refresh }),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  state.permissions = ["plans:own"];
  state.refresh.mockClear();
});
const requirements = {
  require_national_id: true,
  require_residence_evidence: true,
  require_income_evidence: true,
  require_evidence_acceptance: true,
  uploads_available: true,
  document_retention_days: null,
  consent_text: "Synthetic evidence authorisation",
  consent_version: "registration-evidence-v1",
  purpose: "Private membership review only.",
  production_notice: "Production retention unconfigured",
};
const offer = {
  draft_id: 1,
  version_id: 4,
  version: 2,
  terms: {
    category: "education",
    description: "Synthetic published terms",
    currency: "USD",
    minimum_amount: "1.00",
    maximum_amount: null,
    duration_months: 8,
    missed_contributions: "No automatic consequences",
    extra_contributions: "Voluntary, separately verified",
  },
  acknowledgement: "I have read these synthetic terms.",
  acknowledgement_version: "plan-application-v1",
  withdrawal_access:
    "After completion and at least two weeks’ notice plus authorised review. Processing unavailable.",
  missed_target_policy: "No automatic penalties, deductions, debt or suspension.",
  notice: "No financial posting",
};

it("loads configurable private requirements, unticked consent and alternative self-employment evidence", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async () => Response.json(requirements)),
  );
  render(<RegistrationEvidence />);
  const id = await screen.findByLabelText("National ID number (required)");
  expect(id).toBeRequired();
  expect(screen.getByRole("checkbox")).not.toBeChecked();
  fireEvent.change(screen.getByLabelText("Source of income (required)"), {
    target: { value: "self_employed" },
  });
  expect(
    screen.getByLabelText("Alternative income evidence for self-employment (required)"),
  ).toHaveAttribute("accept", "image/png,image/jpeg");
  expect(screen.getByRole("checkbox")).toBeRequired();
  expect(screen.getByText(/retention period has not been approved/)).toBeInTheDocument();
});
it("keeps unavailable scanning explicit and does not offer enabled file inputs", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockImplementation(async () => Response.json({ ...requirements, uploads_available: false })),
  );
  render(<RegistrationEvidence />);
  await screen.findByText(/Private uploads are currently unavailable/);
  expect(screen.getByLabelText("Proof of residence (required)")).toBeDisabled();
});
it("shows only returned effective offers with complete boundaries and no invented plans", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async () => Response.json({ items: [] })),
  );
  render(<PlanOffers />);
  await screen.findByText(/No effective published plans/);
  expect(screen.queryByRole("button", { name: "Submit plan application" })).not.toBeInTheDocument();
});
it("preserves exact application retry payload, consent and member-chosen target without sending member or actor IDs", async () => {
  let attempts = 0;
  const bodies: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async (path: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        bodies.push(String(init.body));
        attempts++;
        if (attempts === 1) throw Error("Synthetic lost response");
        return Response.json({ id: 5, status: "Pending" }, { status: 201 });
      }
      return Response.json({ items: path.includes("/public/") ? [offer] : [] });
    }),
  );
  render(<MemberPlans />);
  const checkbox = await screen.findByRole("checkbox");
  expect(checkbox).not.toBeChecked();
  fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "12.50" } });
  fireEvent.click(checkbox);
  fireEvent.click(screen.getByRole("button", { name: "Submit plan application" }));
  await screen.findByRole("alert");
  expect(screen.getByRole("spinbutton")).toHaveValue(12.5);
  expect(checkbox).toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "Retry same plan application" }));
  await screen.findByText(/Plan application recorded/);
  expect(bodies[0]).toBe(bodies[1]);
  const body = JSON.parse(bodies[0]!);
  expect(body.version_id).toBe(4);
  expect(body).not.toHaveProperty("member_id");
  expect(body).not.toHaveProperty("actor_id");
});
it("does not request private evidence without the dedicated view permission", () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  render(<ApplicationDocuments id={1} onChange={() => {}} />);
  expect(screen.getByText(/separate document-view permission/)).toBeInTheDocument();
  expect(fetcher).not.toHaveBeenCalled();
});

it('gives the plan decision a stable accessible name and requires an explicit selection',async()=>{
  state.permissions=['plan-applications:review'];
  const record={...offer,id:7,member_id:2,status:'Pending',weekly_target:'2.00',currency:'USD',acknowledged_at:'2026-10-22T00:00:00Z',enrolment:null,history:[],member_name:'Synthetic review member',member_number:'SYNTHETIC'};
  vi.stubGlobal('fetch',vi.fn().mockImplementation(async()=>Response.json({items:[record],total:1})));
  render(<PlanApplicationReview/>);
  const decision=await screen.findByLabelText('Decision',{exact:true});expect(decision).toBeRequired();expect(decision).toHaveValue('');
});
it("keeps publication disabled for incomplete terms and an unticked acknowledgement", async () => {
  state.permissions = ["plans:approve", "plans:publish"];
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockImplementation(async () =>
        Response.json({
          latest: { version: 1 },
          publication_preview: {
            blockers: ["Missing decision: currency"],
            approved_by: null,
            published_by: null,
            withdrawal_access: "Unavailable",
            missed_target_policy: "No penalties",
            impact: "Future applications only",
          },
          publication_history: [],
        }),
      ),
  );
  render(<PlanPublication id={1} onChange={() => {}} />);
  await screen.findByText("Missing decision: currency");
  expect(screen.getByRole("checkbox")).not.toBeChecked();
  fireEvent.click(screen.getByRole("checkbox"));
  expect(screen.getByRole("button", { name: "Approve saved terms" })).toBeDisabled();
});
it("protects new bridge writes with CSRF/session and downloads with cookie-derived identity only", async () => {
  const token = "b".repeat(43);
  const origin = "http://isave.test";
  const base = {
    method: "POST",
    headers: { origin, "content-type": "application/json", "x-isave-request": "1" },
    body: "{}",
  };
  expect(
    (await handleAuthentication(new Request(origin + "/api/member/plan-applications", base)))
      ?.status,
  ).toBe(401);
  expect(
    (
      await handleAuthentication(
        new Request(origin + "/api/admin/plan-drafts/1/publish", {
          ...base,
          headers: {
            ...base.headers,
            cookie: "isave_session=" + token,
            origin: "https://attacker.test",
          },
        }),
      )
    )?.status,
  ).toBe(403);
  const fetcher = vi
    .fn()
    .mockImplementation(
      async () =>
        new Response(new Uint8Array([1, 2, 3]), {
          headers: {
            "Content-Type": "image/png",
            "Content-Disposition": 'attachment; filename="evidence-2.png"',
          },
        }),
    );
  vi.stubGlobal("fetch", fetcher);
  const response = await handleAuthentication(
    new Request(origin + "/api/application-documents/1/2/download", {
      headers: { cookie: "isave_session=" + token, Authorization: "Bearer caller-forgery" },
    }),
  );
  expect(response?.headers.get("content-disposition")).toContain("evidence-2.png");
  expect(response?.headers.get("cache-control")).toBe("no-store");
  expect(fetcher.mock.calls[0]![1].headers.Authorization).toBe("Bearer " + token);
});
