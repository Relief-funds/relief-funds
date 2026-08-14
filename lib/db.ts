/**
 * Prisma client singleton — Prisma 7 + @prisma/adapter-libsql (pure JS).
 * No native compilation required — works on Windows without Build Tools.
 *
 * Run `pnpm db:generate` then `pnpm db:push` once before starting.
 */

import path from "node:path";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

function resolveDbUrl(): string {
  const raw = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
  // @libsql/client on Windows needs an absolute path inside file: URLs
  if (raw.startsWith("file:")) {
    const rel = raw.replace(/^file:/, "");
    const abs = path.resolve(process.cwd(), rel);
    // Use forward slashes — libsql expects POSIX-style even on Windows
    return "file:" + abs.replace(/\\/g, "/");
  }
  // Remote libsql / Turso URL — use as-is
  return raw;
}

function makeClient(): PrismaClient {
  const url = resolveDbUrl();
  const adapter = new PrismaLibSql({ url });
  return new PrismaClient({
    // @ts-expect-error — adapter accepted at runtime by Prisma 7
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["warn", "error"],
  });
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const db: PrismaClient = globalForPrisma.prisma ?? makeClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
