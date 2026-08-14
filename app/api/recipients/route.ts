/**
 * GET  /api/recipients                  – list recipients (optionally filter by programId)
 * POST /api/recipients                  – enroll a new recipient
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { addRecipientOnChain } from "@/lib/stellar";

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/recipients?programId=1
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const programId = searchParams.get("programId");

    const recipients = await db.recipient.findMany({
      where: programId ? { programId: Number(programId) } : undefined,
      orderBy: { createdAt: "desc" },
      include: { program: { select: { id: true, name: true } } },
    });

    return NextResponse.json({ recipients });
  } catch (err) {
    console.error("[GET /api/recipients]", err);
    return NextResponse.json(
      { error: "Failed to fetch recipients" },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/recipients
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { programId, walletAddress, name, idHash, notes } = body;

    if (!programId || !walletAddress || !name) {
      return NextResponse.json(
        { error: "programId, walletAddress, and name are required" },
        { status: 400 }
      );
    }

    // Validate Stellar address format (G-address, 56 chars)
    if (!/^G[A-Z2-7]{55}$/.test(walletAddress)) {
      return NextResponse.json(
        { error: "walletAddress must be a valid Stellar G-address" },
        { status: 400 }
      );
    }

    const program = await db.program.findUnique({ where: { id: Number(programId) } });
    if (!program) {
      return NextResponse.json({ error: "Program not found" }, { status: 404 });
    }

    // Check for duplicates
    const existing = await db.recipient.findUnique({
      where: { programId_walletAddress: { programId: Number(programId), walletAddress } },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Recipient is already enrolled in this program" },
        { status: 409 }
      );
    }

    // 1. Write to DB
    const recipient = await db.recipient.create({
      data: {
        programId: Number(programId),
        walletAddress,
        name,
        idHash: idHash ?? null,
        notes: notes ?? null,
        status: "PendingId",
      },
    });

    await db.auditLog.create({
      data: {
        action: "recipient.enrolled",
        payload: JSON.stringify({ recipientId: recipient.id, programId, walletAddress, name }),
        actor: program.adminAddress,
      },
    });

    // 2. Mirror on-chain if program has an onchainId
    if (program.onchainId !== null) {
      try {
        await addRecipientOnChain({
          programId: program.onchainId,
          wallet: walletAddress,
          name,
        });
      } catch (chainErr) {
        console.error("[POST /api/recipients] on-chain add_recipient failed:", chainErr);
      }
    }

    return NextResponse.json({ recipient }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/recipients]", err);
    return NextResponse.json(
      { error: "Failed to enroll recipient" },
      { status: 500 }
    );
  }
}
