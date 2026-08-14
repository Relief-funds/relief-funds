/**
 * GET /api/disbursements/[id]  – fetch a single disbursement with full detail
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const disbursement = await db.disbursement.findUnique({
      where: { id: Number(id) },
      include: {
        program: { select: { id: true, name: true, region: true, tokenAddress: true } },
        recipients: {
          include: {
            recipient: {
              select: { id: true, name: true, walletAddress: true, status: true },
            },
          },
        },
      },
    });

    if (!disbursement) {
      return NextResponse.json({ error: "Disbursement not found" }, { status: 404 });
    }

    return NextResponse.json({ disbursement });
  } catch (err) {
    console.error("[GET /api/disbursements/[id]]", err);
    return NextResponse.json(
      { error: "Failed to fetch disbursement" },
      { status: 500 }
    );
  }
}
