/**
 * GET   /api/recipients/[id]           – fetch a single recipient
 * PATCH /api/recipients/[id]           – update status (verify / suspend)
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyRecipientOnChain, suspendRecipientOnChain } from "@/lib/stellar";

type Params = { params: Promise<{ id: string }> };

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/recipients/[id]
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const recipient = await db.recipient.findUnique({
      where: { id: Number(id) },
      include: { program: { select: { id: true, name: true, onchainId: true } } },
    });

    if (!recipient) {
      return NextResponse.json({ error: "Recipient not found" }, { status: 404 });
    }

    return NextResponse.json({ recipient });
  } catch (err) {
    console.error("[GET /api/recipients/[id]]", err);
    return NextResponse.json({ error: "Failed to fetch recipient" }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/recipients/[id]
// ─────────────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { status, notes } = body;

    const recipient = await db.recipient.findUnique({
      where: { id: Number(id) },
      include: { program: true },
    });

    if (!recipient) {
      return NextResponse.json({ error: "Recipient not found" }, { status: 404 });
    }

    const validStatuses = ["PendingId", "Verified", "Suspended"];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `status must be one of: ${validStatuses.join(", ")}` },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (notes !== undefined) updateData.notes = notes;
    if (status) updateData.status = status;

    // Mirror KYC status on-chain
    if (status && status !== recipient.status && recipient.program.onchainId !== null) {
      try {
        if (status === "Verified") {
          await verifyRecipientOnChain(
            recipient.program.onchainId,
            recipient.walletAddress
          );
        } else if (status === "Suspended") {
          await suspendRecipientOnChain(
            recipient.program.onchainId,
            recipient.walletAddress
          );
        }
      } catch (chainErr) {
        console.error("[PATCH /api/recipients/[id]] on-chain update failed:", chainErr);
      }
    }

    await db.auditLog.create({
      data: {
        action: `recipient.${status?.toLowerCase() ?? "updated"}`,
        payload: JSON.stringify({
          recipientId: recipient.id,
          programId: recipient.programId,
          from: recipient.status,
          to: status,
        }),
        actor: recipient.program.adminAddress,
      },
    });

    const updated = await db.recipient.update({
      where: { id: Number(id) },
      data: updateData,
    });

    return NextResponse.json({ recipient: updated });
  } catch (err) {
    console.error("[PATCH /api/recipients/[id]]", err);
    return NextResponse.json({ error: "Failed to update recipient" }, { status: 500 });
  }
}
