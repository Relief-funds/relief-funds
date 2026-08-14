/**
 * GET  /api/disbursements               – list disbursements (filter by programId)
 * POST /api/disbursements               – create and execute a disbursement batch
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { disburseOnChain } from "@/lib/stellar";

// Local shape for recipients returned by the DB query
interface DbRecipient {
  id: number;
  walletAddress: string;
  name: string;
  status: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/disbursements?programId=1&limit=20
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const programId = searchParams.get("programId");
    const limit = Math.min(Number(searchParams.get("limit") ?? "50"), 100);

    const disbursements = await db.disbursement.findMany({
      where: programId ? { programId: Number(programId) } : undefined,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        program: { select: { id: true, name: true } },
        recipients: {
          include: { recipient: { select: { id: true, name: true, walletAddress: true } } },
        },
      },
    });

    return NextResponse.json({ disbursements });
  } catch (err) {
    console.error("[GET /api/disbursements]", err);
    return NextResponse.json(
      { error: "Failed to fetch disbursements" },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/disbursements
//
// Body:
//   programId   number    – DB program id
//   recipientIds number[] – DB recipient ids to include
//   amountEach  string    – token amount per recipient (as string to preserve precision)
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { programId, recipientIds, amountEach } = body;

    // ── Validate input ──────────────────────────────────────────────────────
    if (!programId || !recipientIds || !amountEach) {
      return NextResponse.json(
        { error: "programId, recipientIds, and amountEach are required" },
        { status: 400 }
      );
    }

    if (!Array.isArray(recipientIds) || recipientIds.length === 0) {
      return NextResponse.json(
        { error: "recipientIds must be a non-empty array" },
        { status: 400 }
      );
    }

    const amountEachBigInt = BigInt(amountEach);
    if (amountEachBigInt <= 0n) {
      return NextResponse.json(
        { error: "amountEach must be positive" },
        { status: 400 }
      );
    }

    // ── Load and validate program ───────────────────────────────────────────
    const program = await db.program.findUnique({ where: { id: Number(programId) } });
    if (!program) {
      return NextResponse.json({ error: "Program not found" }, { status: 404 });
    }
    if (program.status !== "Active") {
      return NextResponse.json(
        { error: "Program is not active — cannot disburse" },
        { status: 422 }
      );
    }

    const remaining = program.budget - program.disbursed;
    const total = amountEachBigInt * BigInt(recipientIds.length);
    if (total > remaining) {
      return NextResponse.json(
        {
          error: "Disbursement exceeds remaining budget",
          remaining: remaining.toString(),
          requested: total.toString(),
        },
        { status: 422 }
      );
    }

    // ── Load and validate recipients ────────────────────────────────────────
    const recipients: DbRecipient[] = await db.recipient.findMany({
      where: {
        id: { in: recipientIds.map(Number) },
        programId: Number(programId),
      },
    });

    if (recipients.length !== recipientIds.length) {
      return NextResponse.json(
        { error: "One or more recipient IDs not found in this program" },
        { status: 404 }
      );
    }

    const unverified = recipients.filter((r) => r.status !== "Verified");
    if (unverified.length > 0) {
      return NextResponse.json(
        {
          error: "All recipients must be Verified before disbursement",
          unverified: unverified.map((r) => ({ id: r.id, name: r.name, status: r.status })),
        },
        { status: 422 }
      );
    }

    // ── Create DB record (status: pending) ──────────────────────────────────
    const disbursement = await db.disbursement.create({
      data: {
        programId: Number(programId),
        amountEach: amountEachBigInt,
        recipientCount: recipients.length,
        txStatus: "pending",
        triggeredBy: program.adminAddress,
        recipients: {
          create: recipients.map((r) => ({ recipientId: r.id })),
        },
      },
      include: { recipients: true },
    });

    // ── Submit to Soroban ────────────────────────────────────────────────────
    let txStatus = "pending";
    let onchainSeq: number | null = null;
    let txHash: string | null = null;

    if (program.onchainId !== null) {
      try {
        const wallets = recipients.map((r) => r.walletAddress);
        const result = await disburseOnChain({
          programId: program.onchainId,
          wallets,
          amountEach: amountEachBigInt,
        });
        onchainSeq = result.seq;
        txHash = result.txHash ?? null;
        txStatus = "confirmed";
      } catch (chainErr) {
        console.error("[POST /api/disbursements] on-chain disburse failed:", chainErr);
        txStatus = "failed";
      }
    } else {
      // No on-chain id yet — mark as submitted (will be confirmed when program goes on-chain)
      txStatus = "submitted";
    }

    // ── Update DB with on-chain result ───────────────────────────────────────
    const [updatedDisbursement] = await db.$transaction([
      db.disbursement.update({
        where: { id: disbursement.id },
        data: {
          txStatus,
          onchainSeq,
          txHash,
          executedAt: txStatus === "confirmed" ? new Date() : null,
        },
      }),
      // Bump program.disbursed
      db.program.update({
        where: { id: Number(programId) },
        data: { disbursed: { increment: total } },
      }),
      // Update each recipient's total_received
      ...recipients.map((r) =>
        db.recipient.update({
          where: { id: r.id },
          data: { totalReceived: { increment: amountEachBigInt } },
        })
      ),
      db.auditLog.create({
        data: {
          action: "disbursement.executed",
          payload: JSON.stringify({
            disbursementId: disbursement.id,
            programId,
            recipientCount: recipients.length,
            amountEach: amountEach,
            total: total.toString(),
            txStatus,
            onchainSeq,
          }),
          actor: program.adminAddress,
        },
      }),
    ]);

    return NextResponse.json(
      {
        disbursement: updatedDisbursement,
        summary: {
          recipientCount: recipients.length,
          amountEach: amountEach,
          total: total.toString(),
          txStatus,
          onchainSeq,
          txHash,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[POST /api/disbursements]", err);
    return NextResponse.json(
      { error: "Failed to execute disbursement" },
      { status: 500 }
    );
  }
}
