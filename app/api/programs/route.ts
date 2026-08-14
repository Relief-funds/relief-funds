/**
 * GET  /api/programs        – list all programs (DB)
 * POST /api/programs        – create a new program (DB + on-chain)
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createProgramOnChain, activateProgramOnChain } from "@/lib/stellar";

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/programs
// ─────────────────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const programs = await db.program.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { recipients: true, disbursements: true } },
      },
    });

    return NextResponse.json({ programs });
  } catch (err) {
    console.error("[GET /api/programs]", err);
    return NextResponse.json(
      { error: "Failed to fetch programs" },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/programs
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, region, tokenAddress, budget, adminAddress, notes, activateNow } = body;

    // Basic validation
    if (!name || !region || !tokenAddress || !budget || !adminAddress) {
      return NextResponse.json(
        { error: "name, region, tokenAddress, budget, and adminAddress are required" },
        { status: 400 }
      );
    }

    const budgetBigInt = BigInt(budget);
    if (budgetBigInt <= 0n) {
      return NextResponse.json({ error: "budget must be positive" }, { status: 400 });
    }

    // 1. Persist to DB first (optimistic, status = Planning)
    const program = await db.program.create({
      data: {
        name,
        region,
        tokenAddress,
        budget: budgetBigInt,
        adminAddress,
        notes: notes ?? null,
        status: "Planning",
      },
    });

    await db.auditLog.create({
      data: {
        action: "program.created",
        payload: JSON.stringify({ programId: program.id, name, region }),
        actor: adminAddress,
      },
    });

    // 2. Submit to Soroban (best-effort — don't fail the whole request)
    let onchainId: number | null = null;
    try {
      onchainId = await createProgramOnChain({
        name,
        region,
        tokenAddress,
        budget: budgetBigInt,
        programAdmin: adminAddress,
      });

      await db.program.update({
        where: { id: program.id },
        data: { onchainId },
      });

      // Optionally activate immediately on-chain
      if (activateNow && onchainId) {
        await activateProgramOnChain(onchainId);
        await db.program.update({
          where: { id: program.id },
          data: { status: "Active" },
        });

        await db.auditLog.create({
          data: {
            action: "program.activated",
            payload: JSON.stringify({ programId: program.id, onchainId }),
            actor: adminAddress,
          },
        });
      }
    } catch (chainErr) {
      // Log but don't fail — operator can retry activation later
      console.error("[POST /api/programs] on-chain submission failed:", chainErr);
    }

    return NextResponse.json(
      { program: { ...program, onchainId }, onchainId },
      { status: 201 }
    );
  } catch (err) {
    console.error("[POST /api/programs]", err);
    return NextResponse.json(
      { error: "Failed to create program" },
      { status: 500 }
    );
  }
}
