/**
 * GET /api/reports  – aggregated summary for the Reports screen
 *
 * Returns three report objects matching the UI cards:
 *   1. Monthly disbursement summary
 *   2. Recipient verification audit
 *   3. Program budget utilization
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Local types matching the Prisma query shape
interface DbDisbursement {
  amountEach: bigint;
  recipientCount: number;
  program: { name: string };
}

interface DbProgram {
  id: number;
  name: string;
  region: string;
  status: string;
  budget: bigint;
  disbursed: bigint;
}

export async function GET() {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // ── 1. Monthly disbursement summary ─────────────────────────────────────
    const monthlyDisbursements: DbDisbursement[] = await db.disbursement.findMany({
      where: { createdAt: { gte: thirtyDaysAgo }, txStatus: "confirmed" },
      include: { program: { select: { name: true } } },
    });

    const monthlyTotal = monthlyDisbursements.reduce(
      (sum, d) => sum + d.amountEach * BigInt(d.recipientCount),
      0n
    );

    const monthlySummary = {
      id: "monthly-disbursement",
      title: "Monthly disbursement summary",
      period: "Last 30 days",
      totalDisbursed: monthlyTotal.toString(),
      transactionCount: monthlyDisbursements.length,
      recipientCount: monthlyDisbursements.reduce((s, d) => s + d.recipientCount, 0),
      byProgram: Object.entries(
        monthlyDisbursements.reduce<Record<string, { count: number; total: bigint }>>(
          (acc, d) => {
            const key = d.program.name;
            if (!acc[key]) acc[key] = { count: 0, total: 0n };
            acc[key].count += d.recipientCount;
            acc[key].total += d.amountEach * BigInt(d.recipientCount);
            return acc;
          },
          {}
        )
      ).map(([name, v]) => ({ program: name, recipients: v.count, total: v.total.toString() })),
    };

    // ── 2. Recipient verification audit ─────────────────────────────────────
    const [verified, pending, suspended, total] = await Promise.all([
      db.recipient.count({ where: { status: "Verified" } }),
      db.recipient.count({ where: { status: "PendingId" } }),
      db.recipient.count({ where: { status: "Suspended" } }),
      db.recipient.count(),
    ]);

    const recentlyVerified = await db.recipient.findMany({
      where: { status: "Verified", updatedAt: { gte: thirtyDaysAgo } },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { id: true, name: true, walletAddress: true, updatedAt: true },
    });

    const verificationAudit = {
      id: "recipient-verification",
      title: "Recipient verification audit",
      total,
      verified,
      pending,
      suspended,
      verificationRate: total > 0 ? Math.round((verified / total) * 100) : 0,
      recentlyVerified,
    };

    // ── 3. Program budget utilization ────────────────────────────────────────
    const programs: DbProgram[] = await db.program.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        region: true,
        status: true,
        budget: true,
        disbursed: true,
      },
    });

    const budgetUtilization = {
      id: "budget-utilization",
      title: "Program budget utilization",
      programs: programs.map((p) => ({
        id: p.id,
        name: p.name,
        region: p.region,
        status: p.status,
        budget: p.budget.toString(),
        disbursed: p.disbursed.toString(),
        utilizationPct:
          p.budget > 0n
            ? Math.round(Number((p.disbursed * 100n) / p.budget))
            : 0,
        remaining: (p.budget - p.disbursed).toString(),
      })),
    };

    return NextResponse.json({
      reports: [monthlySummary, verificationAudit, budgetUtilization],
      generatedAt: now.toISOString(),
    });
  } catch (err) {
    console.error("[GET /api/reports]", err);
    return NextResponse.json({ error: "Failed to generate reports" }, { status: 500 });
  }
}
