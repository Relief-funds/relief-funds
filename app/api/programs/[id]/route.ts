/**
 * GET   /api/programs/[id]              – fetch a single program
 * PATCH /api/programs/[id]              – update status or metadata
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { activateProgramOnChain, setProgramStatusOnChain } from "@/lib/stellar";

type Params = { params: Promise<{ id: string }> };

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/programs/[id]
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const program = await db.program.findUnique({
      where: { id: Number(id) },
      include: {
        recipients: { orderBy: { createdAt: "desc" } },
        disbursements: { orderBy: { createdAt: "desc" }, take: 10 },
        _count: { select: { recipients: true, disbursements: true } },
      },
    });

    if (!program) {
      return NextResponse.json({ error: "Program not found" }, { status: 404 });
    }

    return NextResponse.json({ program });
  } catch (err) {
    console.error("[GET /api/programs/[id]]", err);
    return NextResponse.json({ error: "Failed to fetch program" }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/programs/[id]
// ─────────────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { status, notes } = body;

    const program = await db.program.findUnique({ where: { id: Number(id) } });
    if (!program) {
      return NextResponse.json({ error: "Program not found" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (notes !== undefined) updateData.notes = notes;

    // Handle status transition
    if (status && status !== program.status) {
      updateData.status = status;

      // Mirror status change on-chain if we have an onchain id
      if (program.onchainId !== null) {
        try {
          if (status === "Active" && program.status === "Planning") {
            await activateProgramOnChain(program.onchainId);
          } else if (status === "Active" || status === "Paused") {
            await setProgramStatusOnChain(program.onchainId, status === "Active");
          }
        } catch (chainErr) {
          console.error("[PATCH /api/programs/[id]] on-chain update failed:", chainErr);
        }
      }

      await db.auditLog.create({
        data: {
          action: `program.status_changed`,
          payload: JSON.stringify({
            programId: program.id,
            from: program.status,
            to: status,
          }),
          actor: program.adminAddress,
        },
      });
    }

    const updated = await db.program.update({
      where: { id: Number(id) },
      data: updateData,
    });

    return NextResponse.json({ program: updated });
  } catch (err) {
    console.error("[PATCH /api/programs/[id]]", err);
    return NextResponse.json({ error: "Failed to update program" }, { status: 500 });
  }
}
