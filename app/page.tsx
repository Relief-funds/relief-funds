"use client";

import { useState, useEffect, useCallback } from "react";
import {
  HeartHandshake,
  LayoutDashboard,
  Users,
  Send,
  FileBarChart2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Plus,
  ChevronRight,
  ChevronLeft,
  ShieldCheck,
  Search,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens
// ─────────────────────────────────────────────────────────────────────────────

const tokens = {
  ink: "#1D2E2B",
  inkSoft: "#2B443F",
  paper: "#F8F5ED",
  surface: "#FFFFFF",
  border: "#E7E1D2",
  teal: "#3C7A6D",
  tealSoft: "#DCEAE6",
  amber: "#C97B2E",
  amberSoft: "#F3E0C4",
  brick: "#B84A3E",
  brickSoft: "#F3DBD7",
  textMuted: "#7C8983",
};

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Program {
  id: number;
  onchainId: number | null;
  name: string;
  region: string;
  status: string;
  budget: string;
  disbursed: string;
  adminAddress: string;
  _count?: { recipients: number; disbursements: number };
}

interface Recipient {
  id: number;
  programId: number;
  name: string;
  walletAddress: string;
  status: string;
  totalReceived: string;
  program?: { id: number; name: string };
}

interface Disbursement {
  id: number;
  programId: number;
  amountEach: string;
  recipientCount: number;
  txStatus: string;
  txHash: string | null;
  onchainSeq: number | null;
  createdAt: string;
  program?: { id: number; name: string };
}

interface Report {
  id: string;
  title: string;
  [key: string]: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared UI primitives
// ─────────────────────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string }> = {
    Active:      { bg: tokens.tealSoft,  fg: tokens.teal  },
    Planning:    { bg: tokens.amberSoft, fg: tokens.amber },
    Paused:      { bg: tokens.amberSoft, fg: tokens.amber },
    Closed:      { bg: tokens.border,    fg: tokens.textMuted },
    confirmed:   { bg: tokens.tealSoft,  fg: tokens.teal  },
    submitted:   { bg: tokens.amberSoft, fg: tokens.amber },
    pending:     { bg: tokens.amberSoft, fg: tokens.amber },
    failed:      { bg: tokens.brickSoft, fg: tokens.brick },
    Verified:    { bg: tokens.tealSoft,  fg: tokens.teal  },
    PendingId:   { bg: tokens.brickSoft, fg: tokens.brick },
    Suspended:   { bg: tokens.brickSoft, fg: tokens.brick },
    "Pending ID":{ bg: tokens.brickSoft, fg: tokens.brick },
  };
  const c = map[status] ?? { bg: tokens.border, fg: tokens.textMuted };
  const label = status === "PendingId" ? "Pending ID" : status === "confirmed" ? "Completed" : status;
  return (
    <span
      className="text-[11px] font-medium px-2.5 py-1 rounded-full"
      style={{ backgroundColor: c.bg, color: c.fg, fontFamily: "'Inter', sans-serif" }}
    >
      {label}
    </span>
  );
}

function Spinner() {
  return <Loader2 size={18} className="animate-spin" style={{ color: tokens.teal }} />;
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm mb-4"
      style={{ backgroundColor: tokens.brickSoft, color: tokens.brick, fontFamily: "'Inter', sans-serif" }}
    >
      <AlertCircle size={15} />
      {message}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <p className="text-sm px-1 py-6 text-center" style={{ color: tokens.textMuted, fontFamily: "'Inter', sans-serif" }}>
      {message}
    </p>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout chrome
// ─────────────────────────────────────────────────────────────────────────────

function Sidebar({ active, setActive }: { active: string; setActive: (id: string) => void }) {
  const items = [
    { id: "overview",    icon: LayoutDashboard, label: "Overview" },
    { id: "programs",    icon: HeartHandshake,  label: "Programs" },
    { id: "recipients",  icon: Users,           label: "Recipients" },
    { id: "disburse",    icon: Send,            label: "New disbursement" },
    { id: "reports",     icon: FileBarChart2,   label: "Reports" },
  ];
  return (
    <div className="w-56 flex-shrink-0 flex flex-col py-6 px-4" style={{ backgroundColor: tokens.ink }}>
      <div className="flex items-center gap-2 px-2 mb-8">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: tokens.teal }}>
          <HeartHandshake size={16} color={tokens.paper} />
        </div>
        <span className="text-sm font-semibold" style={{ color: tokens.paper, fontFamily: "'Space Grotesk', sans-serif" }}>
          Relief Funds
        </span>
      </div>
      <div className="flex flex-col gap-1">
        {items.map((it) => {
          const isActive = active === it.id;
          const Icon = it.icon;
          return (
            <button
              key={it.id}
              onClick={() => setActive(it.id)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-left"
              style={{ backgroundColor: isActive ? tokens.inkSoft : "transparent" }}
            >
              <Icon size={16} style={{ color: isActive ? tokens.paper : "#8FA39D" }} />
              <span
                className="text-[13px]"
                style={{
                  color: isActive ? tokens.paper : "#8FA39D",
                  fontFamily: "'Inter', sans-serif",
                  fontWeight: isActive ? 600 : 500,
                }}
              >
                {it.label}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-auto px-3 pt-6">
        <div className="flex items-center gap-2 text-[11px]" style={{ color: "#8FA39D", fontFamily: "'Inter', sans-serif" }}>
          <ShieldCheck size={13} />
          Stellar · Soroban
        </div>
      </div>
    </div>
  );
}

function TopBar({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex items-center justify-between px-8 pt-7 pb-5">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: tokens.ink, fontFamily: "'Space Grotesk', sans-serif" }}>
          {title}
        </h1>
        {subtitle && (
          <p className="text-xs mt-1" style={{ color: tokens.textMuted, fontFamily: "'Inter', sans-serif" }}>
            {subtitle}
          </p>
        )}
      </div>
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-xl"
        style={{ backgroundColor: tokens.surface, border: `1px solid ${tokens.border}` }}
      >
        <Search size={13} style={{ color: tokens.textMuted }} />
        <span className="text-xs" style={{ color: tokens.textMuted, fontFamily: "'Inter', sans-serif" }}>
          Search recipients, programs…
        </span>
      </div>
    </div>
  );
}

function KPICard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl p-5 flex-1" style={{ backgroundColor: tokens.surface, border: `1px solid ${tokens.border}` }}>
      <p className="text-[11px] mb-2" style={{ color: tokens.textMuted, fontFamily: "'Inter', sans-serif" }}>
        {label}
      </p>
      <p className="text-2xl font-semibold" style={{ color: tokens.ink, fontFamily: "'Space Grotesk', sans-serif" }}>
        {value}
      </p>
      {sub && (
        <p className="text-[11px] mt-1" style={{ color: tokens.teal, fontFamily: "'Inter', sans-serif" }}>
          {sub}
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Overview
// ─────────────────────────────────────────────────────────────────────────────

function OverviewScreen() {
  const [programs, setPrograms]           = useState<Program[]>([]);
  const [disbursements, setDisbursements] = useState<Disbursement[]>([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState("");

  useEffect(() => {
    async function load() {
      try {
        const [pRes, dRes] = await Promise.all([
          fetch("/api/programs"),
          fetch("/api/disbursements?limit=5"),
        ]);
        if (!pRes.ok || !dRes.ok) throw new Error("Failed to load data");
        const [pData, dData] = await Promise.all([pRes.json(), dRes.json()]);
        setPrograms(pData.programs ?? []);
        setDisbursements(dData.disbursements ?? []);
      } catch {
        setError("Could not load overview. Is the database set up?");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Derive KPIs from live data — use number arithmetic (amounts fit in JS doubles for display)
  const totalDisbursedNum = programs.reduce((s, p) => s + Number(p.disbursed ?? 0), 0);
  const totalRecipients   = programs.reduce((s, p) => s + (p._count?.recipients ?? 0), 0);
  const activeCount       = programs.filter((p) => p.status === "Active").length;
  const planningCount     = programs.filter((p) => p.status === "Planning").length;

  function fmtAmount(n: number): string {
    const whole = n / 1e7;
    if (whole >= 1_000_000) return `₦${(whole / 1_000_000).toFixed(1)}M`;
    if (whole >= 1_000)     return `₦${(whole / 1_000).toFixed(1)}K`;
    return `₦${whole.toLocaleString()}`;
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <TopBar title="Overview" subtitle="All programs, last 30 days" />
      <div className="px-8 pb-8">
        {error && <ErrorBanner message={error} />}

        <div className="flex gap-4 mb-6">
          {loading ? (
            <div className="flex-1 flex items-center justify-center py-8"><Spinner /></div>
          ) : (
            <>
              <KPICard label="Total disbursed"   value={fmtAmount(totalDisbursedNum)} />
              <KPICard label="Active recipients" value={totalRecipients.toLocaleString()} />
              <KPICard label="Active programs"   value={String(activeCount)} sub={planningCount > 0 ? `${planningCount} in planning` : undefined} />
              <KPICard label="Programs total"    value={String(programs.length)} />
            </>
          )}
        </div>

        {/* Active programs table */}
        <div className="rounded-2xl mb-6" style={{ backgroundColor: tokens.surface, border: `1px solid ${tokens.border}` }}>
          <div className="px-5 pt-4 pb-3">
            <span className="text-sm font-semibold" style={{ color: tokens.ink, fontFamily: "'Space Grotesk', sans-serif" }}>
              Active programs
            </span>
          </div>
          {loading ? (
            <div className="flex justify-center py-6"><Spinner /></div>
          ) : programs.length === 0 ? (
            <EmptyState message="No programs yet. Create one in the Programs tab." />
          ) : (
            programs.map((p) => {
              const budget   = Number(BigInt(p.budget   ?? 0));
              const disbursed = Number(BigInt(p.disbursed ?? 0));
              const pct = budget > 0 ? Math.round((disbursed / budget) * 100) : 0;
              return (
                <div key={p.id} className="flex items-center justify-between px-5 py-3.5 border-t" style={{ borderColor: tokens.border }}>
                  <div>
                    <p className="text-sm font-medium" style={{ color: tokens.ink, fontFamily: "'Inter', sans-serif" }}>
                      {p.name}
                    </p>
                    <p className="text-[11px] mt-0.5" style={{ color: tokens.textMuted, fontFamily: "'Inter', sans-serif" }}>
                      {p.region} · {p._count?.recipients ?? 0} recipients
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-32 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: tokens.border }}>
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: tokens.teal }} />
                    </div>
                    <span className="text-[11px] w-9 text-right" style={{ color: tokens.textMuted, fontFamily: "'Inter', sans-serif" }}>
                      {pct}%
                    </span>
                    <StatusPill status={p.status} />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Recent disbursements */}
        <div className="rounded-2xl" style={{ backgroundColor: tokens.surface, border: `1px solid ${tokens.border}` }}>
          <div className="px-5 pt-4 pb-3">
            <span className="text-sm font-semibold" style={{ color: tokens.ink, fontFamily: "'Space Grotesk', sans-serif" }}>
              Recent disbursements
            </span>
          </div>
          {loading ? (
            <div className="flex justify-center py-6"><Spinner /></div>
          ) : disbursements.length === 0 ? (
            <EmptyState message="No disbursements yet." />
          ) : (
            disbursements.map((d) => {
              const amountEach  = Number(BigInt(d.amountEach ?? 0)) / 1e7;
              const total       = amountEach * d.recipientCount;
              const dateStr     = new Date(d.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
              return (
                <div key={d.id} className="flex items-center justify-between px-5 py-3.5 border-t" style={{ borderColor: tokens.border }}>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: tokens.tealSoft }}>
                      <Send size={13} style={{ color: tokens.teal }} />
                    </div>
                    <div>
                      <p className="text-sm" style={{ color: tokens.ink, fontFamily: "'Inter', sans-serif" }}>
                        {d.program?.name ?? "—"} · {d.recipientCount} recipients
                      </p>
                      <p className="text-[11px]" style={{ color: tokens.textMuted, fontFamily: "'Inter', sans-serif" }}>
                        {dateStr}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-medium" style={{ color: tokens.ink, fontFamily: "'Inter', sans-serif" }}>
                      ₦{total.toLocaleString()}
                    </span>
                    <StatusPill status={d.txStatus} />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Programs
// ─────────────────────────────────────────────────────────────────────────────

function ProgramsScreen() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/programs");
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setPrograms(data.programs ?? []);
    } catch {
      setError("Could not load programs.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex-1 overflow-y-auto">
      <TopBar title="Programs" subtitle="Relief programs across all regions" />
      <div className="px-8 pb-8 space-y-3">
        {error && <ErrorBanner message={error} />}
        {loading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : programs.length === 0 ? (
          <EmptyState message="No programs created yet." />
        ) : (
          programs.map((p) => {
            const budget    = Number(BigInt(p.budget   ?? 0));
            const disbursed = Number(BigInt(p.disbursed ?? 0));
            const pct = budget > 0 ? Math.round((disbursed / budget) * 100) : 0;
            const budgetDisplay    = (budget    / 1e7).toLocaleString();
            const disbursedDisplay = (disbursed / 1e7).toLocaleString();
            return (
              <div key={p.id} className="rounded-2xl p-5" style={{ backgroundColor: tokens.surface, border: `1px solid ${tokens.border}` }}>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: tokens.ink, fontFamily: "'Space Grotesk', sans-serif" }}>
                      {p.name}
                    </p>
                    <p className="text-[11px] mt-1" style={{ color: tokens.textMuted, fontFamily: "'Inter', sans-serif" }}>
                      {p.region}
                    </p>
                  </div>
                  <StatusPill status={p.status} />
                </div>
                <div className="flex items-center gap-4 mb-2">
                  <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: tokens.border }}>
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: tokens.teal }} />
                  </div>
                  <span className="text-[11px]" style={{ color: tokens.textMuted, fontFamily: "'Inter', sans-serif" }}>
                    ₦{disbursedDisplay} of ₦{budgetDisplay}
                  </span>
                </div>
                <p className="text-[11px]" style={{ color: tokens.textMuted, fontFamily: "'Inter', sans-serif" }}>
                  {p._count?.recipients ?? 0} recipients enrolled
                </p>
              </div>
            );
          })
        )}
        <button
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border-2 border-dashed"
          style={{ borderColor: tokens.amberSoft, color: tokens.ink, fontFamily: "'Space Grotesk', sans-serif" }}
          onClick={() => alert("Create program — connect to /api/programs POST")}
        >
          <Plus size={16} />
          <span className="text-sm font-medium">New relief program</span>
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Recipients
// ─────────────────────────────────────────────────────────────────────────────

function RecipientsScreen() {
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/recipients");
        if (!res.ok) throw new Error("Failed to load");
        const data = await res.json();
        setRecipients(data.recipients ?? []);
      } catch {
        setError("Could not load recipients.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const shortWallet = (addr: string) =>
    addr.length > 10 ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : addr;

  return (
    <div className="flex-1 overflow-y-auto">
      <TopBar
        title="Recipients"
        subtitle={loading ? "Loading…" : `${recipients.length} enrolled across all programs`}
      />
      <div className="px-8 pb-8">
        {error && <ErrorBanner message={error} />}
        <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: tokens.surface, border: `1px solid ${tokens.border}` }}>
          <div
            className="grid grid-cols-5 px-5 py-3 text-[11px]"
            style={{ backgroundColor: tokens.paper, color: tokens.textMuted, fontFamily: "'Inter', sans-serif" }}
          >
            <span>Name</span>
            <span>Program</span>
            <span>Status</span>
            <span>Wallet</span>
            <span>Total received</span>
          </div>
          {loading ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : recipients.length === 0 ? (
            <EmptyState message="No recipients enrolled yet." />
          ) : (
            recipients.map((r) => {
              const received = (Number(BigInt(r.totalReceived ?? 0)) / 1e7).toLocaleString();
              return (
                <div key={r.id} className="grid grid-cols-5 px-5 py-3.5 items-center border-t" style={{ borderColor: tokens.border }}>
                  <span className="text-sm" style={{ color: tokens.ink, fontFamily: "'Inter', sans-serif" }}>{r.name}</span>
                  <span className="text-sm" style={{ color: tokens.textMuted, fontFamily: "'Inter', sans-serif" }}>
                    {r.program?.name ?? "—"}
                  </span>
                  <span><StatusPill status={r.status} /></span>
                  <span className="text-xs" style={{ color: tokens.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>
                    {shortWallet(r.walletAddress)}
                  </span>
                  <span className="text-sm" style={{ color: tokens.ink, fontFamily: "'Inter', sans-serif" }}>
                    {Number(r.totalReceived ?? 0) > 0 ? `₦${received}` : "—"}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Disburse
// ─────────────────────────────────────────────────────────────────────────────

function DisburseScreen() {
  const [step, setStep]         = useState(0);
  const [program, setProgram]   = useState<Program | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [amount, setAmount]     = useState("");

  // Remote data
  const [programs, setPrograms]       = useState<Program[]>([]);
  const [recipients, setRecipients]   = useState<Recipient[]>([]);
  const [loadingPrograms, setLoadingPrograms] = useState(true);
  const [loadingRecipients, setLoadingRecipients] = useState(false);

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [txResult, setTxResult] = useState<{ recipientCount: number; total: string; txStatus: string; onchainSeq: number | null } | null>(null);

  // Load programs on mount
  useEffect(() => {
    fetch("/api/programs")
      .then((r) => r.json())
      .then((d) => setPrograms(d.programs ?? []))
      .catch(() => {})
      .finally(() => setLoadingPrograms(false));
  }, []);

  // Load recipients whenever a program is selected
  useEffect(() => {
    if (!program) { setRecipients([]); return; }
    setLoadingRecipients(true);
    fetch(`/api/recipients?programId=${program.id}`)
      .then((r) => r.json())
      .then((d) => setRecipients(d.recipients ?? []))
      .catch(() => {})
      .finally(() => setLoadingRecipients(false));
  }, [program]);

  const eligible = recipients.filter((r) => r.status === "Verified");

  const toggle = (id: number) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const steps = ["Program", "Recipients", "Amount", "Review"];

  async function handleConfirm() {
    if (!program || selected.length === 0 || !amount) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      // Convert NGN display amount → stroops (× 10^7)
      const amountEachStroops = (BigInt(amount) * BigInt(1e7)).toString();

      const res = await fetch("/api/disbursements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          programId:    program.id,
          recipientIds: selected,
          amountEach:   amountEachStroops,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setSubmitError(data.error ?? "Disbursement failed. Please try again.");
        return;
      }

      setTxResult({
        recipientCount: data.summary.recipientCount,
        total:          data.summary.total,
        txStatus:       data.summary.txStatus,
        onchainSeq:     data.summary.onchainSeq,
      });
      setStep(4);
    } catch {
      setSubmitError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Success screen ──────────────────────────────────────────────────────────
  if (step === 4 && txResult) {
    const totalDisplay = (Number(BigInt(txResult.total)) / 1e7).toLocaleString();
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mb-5" style={{ backgroundColor: tokens.teal }}>
          <CheckCircle2 size={26} color={tokens.paper} />
        </div>
        <p className="text-lg font-semibold mb-1" style={{ color: tokens.ink, fontFamily: "'Space Grotesk', sans-serif" }}>
          Disbursement {txResult.txStatus === "confirmed" ? "confirmed" : "queued"}
        </p>
        <p className="text-sm mb-2" style={{ color: tokens.textMuted, fontFamily: "'Inter', sans-serif" }}>
          {txResult.recipientCount} recipients · ₦{(Number(amount)).toLocaleString()} each · settling on Stellar
        </p>
        {txResult.onchainSeq && (
          <p className="text-xs mb-8" style={{ color: tokens.teal, fontFamily: "'JetBrains Mono', monospace" }}>
            on-chain seq #{txResult.onchainSeq}
          </p>
        )}
        <button
          onClick={() => { setStep(0); setProgram(null); setSelected([]); setAmount(""); setTxResult(null); }}
          className="text-sm font-semibold px-6 py-3 rounded-full"
          style={{ backgroundColor: tokens.ink, color: tokens.paper, fontFamily: "'Space Grotesk', sans-serif" }}
        >
          New disbursement
        </button>
      </div>
    );
  }

  // ── Wizard ──────────────────────────────────────────────────────────────────
  const continueDisabled =
    (step === 0 && !program) ||
    (step === 1 && selected.length === 0) ||
    (step === 2 && !amount);

  return (
    <div className="flex-1 overflow-y-auto">
      <TopBar title="New disbursement" subtitle={steps[step]} />
      <div className="px-8 pb-8">
        {/* Step indicators */}
        <div className="flex items-center gap-2 mb-6">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[11px]"
                style={{
                  backgroundColor: i <= step ? tokens.teal : tokens.border,
                  color: i <= step ? tokens.paper : tokens.textMuted,
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                {i + 1}
              </div>
              {i < steps.length - 1 && <div className="w-8 h-px" style={{ backgroundColor: tokens.border }} />}
            </div>
          ))}
        </div>

        {/* Step 0 — choose program */}
        {step === 0 && (
          <div className="space-y-2">
            {loadingPrograms ? (
              <div className="flex justify-center py-8"><Spinner /></div>
            ) : programs.length === 0 ? (
              <EmptyState message="No active programs found." />
            ) : (
              programs.filter((p) => p.status === "Active").map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setProgram(p); setSelected([]); }}
                  className="w-full text-left rounded-2xl p-4 flex items-center justify-between"
                  style={{
                    backgroundColor: tokens.surface,
                    border: `1px solid ${program?.id === p.id ? tokens.teal : tokens.border}`,
                  }}
                >
                  <div>
                    <p className="text-sm font-medium" style={{ color: tokens.ink, fontFamily: "'Inter', sans-serif" }}>{p.name}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: tokens.textMuted, fontFamily: "'Inter', sans-serif" }}>{p.region}</p>
                  </div>
                  <ChevronRight size={16} style={{ color: tokens.textMuted }} />
                </button>
              ))
            )}
          </div>
        )}

        {/* Step 1 — choose recipients */}
        {step === 1 && (
          <div className="space-y-1">
            {loadingRecipients ? (
              <div className="flex justify-center py-8"><Spinner /></div>
            ) : eligible.length === 0 ? (
              <EmptyState message="No verified recipients enrolled in this program yet." />
            ) : (
              eligible.map((r) => (
                <button
                  key={r.id}
                  onClick={() => toggle(r.id)}
                  className="w-full flex items-center justify-between py-3 px-2 rounded-xl"
                  style={{ backgroundColor: selected.includes(r.id) ? tokens.tealSoft : "transparent" }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-5 h-5 rounded-md flex items-center justify-center border-2"
                      style={{
                        borderColor: selected.includes(r.id) ? tokens.teal : tokens.border,
                        backgroundColor: selected.includes(r.id) ? tokens.teal : "transparent",
                      }}
                    >
                      {selected.includes(r.id) && <CheckCircle2 size={12} color={tokens.paper} />}
                    </div>
                    <span className="text-sm" style={{ color: tokens.ink, fontFamily: "'Inter', sans-serif" }}>{r.name}</span>
                  </div>
                  <StatusPill status={r.status} />
                </button>
              ))
            )}
          </div>
        )}

        {/* Step 2 — enter amount */}
        {step === 2 && (
          <div>
            <p className="text-xs mb-2" style={{ color: tokens.textMuted, fontFamily: "'Inter', sans-serif" }}>
              Amount per recipient ({selected.length} selected)
            </p>
            <div className="flex items-baseline gap-2 mb-6 border-b pb-3" style={{ borderColor: tokens.border }}>
              <span className="text-2xl" style={{ color: tokens.ink, fontFamily: "'Space Grotesk', sans-serif" }}>₦</span>
              <input
                type="text"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
                placeholder="0"
                className="text-3xl bg-transparent outline-none flex-1"
                style={{ color: tokens.ink, fontFamily: "'Space Grotesk', sans-serif" }}
              />
            </div>
            <p className="text-xs" style={{ color: tokens.textMuted, fontFamily: "'Inter', sans-serif" }}>
              Total: ₦{(Number(amount || 0) * selected.length).toLocaleString()}
            </p>
          </div>
        )}

        {/* Step 3 — review */}
        {step === 3 && (
          <div>
            {submitError && <ErrorBanner message={submitError} />}
            <div className="rounded-2xl p-5" style={{ backgroundColor: tokens.surface, border: `1px solid ${tokens.border}` }}>
              {[
                ["Program",       program?.name ?? "—"],
                ["Recipients",    String(selected.length)],
                ["Amount each",   `₦${Number(amount || 0).toLocaleString()}`],
                ["Total",         `₦${(Number(amount || 0) * selected.length).toLocaleString()}`],
              ].map(([label, value], i) => (
                <div
                  key={label}
                  className={`flex justify-between py-2 text-sm${i > 0 ? " border-t" : ""}`}
                  style={{ borderColor: tokens.border, fontFamily: "'Inter', sans-serif", fontWeight: i === 3 ? 600 : 400 }}
                >
                  <span style={{ color: i === 3 ? tokens.ink : tokens.textMuted }}>{label}</span>
                  <span style={{ color: tokens.ink }}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center gap-3 mt-6">
          {step > 0 && (
            <button
              onClick={() => { setSubmitError(""); setStep(step - 1); }}
              disabled={submitting}
              className="flex items-center gap-1 text-sm px-4 py-3 rounded-2xl"
              style={{ color: tokens.textMuted, fontFamily: "'Inter', sans-serif" }}
            >
              <ChevronLeft size={14} /> Back
            </button>
          )}
          <button
            disabled={continueDisabled || submitting}
            onClick={step === 3 ? handleConfirm : () => setStep(step + 1)}
            className="flex-1 py-3.5 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2"
            style={{
              backgroundColor: tokens.ink,
              color: tokens.paper,
              fontFamily: "'Space Grotesk', sans-serif",
              opacity: continueDisabled || submitting ? 0.4 : 1,
            }}
          >
            {submitting && <Loader2 size={15} className="animate-spin" />}
            {step === 3 ? (submitting ? "Sending…" : "Confirm & send") : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Reports
// ─────────────────────────────────────────────────────────────────────────────

function ReportsScreen() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/reports")
      .then((r) => r.json())
      .then((d) => setReports(d.reports ?? []))
      .catch(() => setError("Could not load reports."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex-1 overflow-y-auto">
      <TopBar title="Reports" subtitle="Export-ready summaries for donors and auditors" />
      <div className="px-8 pb-8 space-y-3">
        {error && <ErrorBanner message={error} />}
        {loading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : reports.length === 0 ? (
          <EmptyState message="No report data yet." />
        ) : (
          reports.map((r) => (
            <div
              key={r.id}
              className="rounded-2xl overflow-hidden"
              style={{ backgroundColor: tokens.surface, border: `1px solid ${tokens.border}` }}
            >
              <button
                className="w-full flex items-center justify-between p-4"
                onClick={() => setExpanded(expanded === r.id ? null : r.id)}
              >
                <div className="flex items-center gap-3">
                  <FileBarChart2 size={16} style={{ color: tokens.teal }} />
                  <span className="text-sm" style={{ color: tokens.ink, fontFamily: "'Inter', sans-serif" }}>
                    {r.title}
                  </span>
                </div>
                <ChevronRight
                  size={16}
                  style={{
                    color: tokens.textMuted,
                    transform: expanded === r.id ? "rotate(90deg)" : "none",
                    transition: "transform 0.15s",
                  }}
                />
              </button>
              {expanded === r.id && (
                <div className="px-4 pb-4 border-t" style={{ borderColor: tokens.border }}>
                  <pre
                    className="text-[11px] overflow-x-auto mt-3 p-3 rounded-xl"
                    style={{
                      backgroundColor: tokens.paper,
                      color: tokens.ink,
                      fontFamily: "'JetBrains Mono', monospace",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {JSON.stringify(r, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Root
// ─────────────────────────────────────────────────────────────────────────────

export default function ReliefFundsApp() {
  const [tab, setTab] = useState("overview");
  return (
    <div className="min-h-screen w-full flex items-center justify-center py-10" style={{ backgroundColor: "#EEE9DA" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600&family=Inter:wght@400;500;600&family=JetBrains+Mono&display=swap');
      `}</style>
      <div
        className="w-[1080px] h-[720px] rounded-2xl overflow-hidden flex shadow-2xl"
        style={{ backgroundColor: tokens.paper, border: `1px solid ${tokens.border}` }}
      >
        <Sidebar active={tab} setActive={setTab} />
        {tab === "overview"    && <OverviewScreen />}
        {tab === "programs"    && <ProgramsScreen />}
        {tab === "recipients"  && <RecipientsScreen />}
        {tab === "disburse"    && <DisburseScreen />}
        {tab === "reports"     && <ReportsScreen />}
      </div>
    </div>
  );
}
