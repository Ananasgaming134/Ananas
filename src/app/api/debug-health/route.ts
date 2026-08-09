import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function maskUrl(url: string | undefined) {
  if (!url) return null;
  return {
    length: url.length,
    start: url.slice(0, 20),
    end: url.slice(-15),
    hasNewline: /[\r\n]/.test(url),
    hasSpace: /\s/.test(url),
  };
}

export async function GET() {
  try {
    const count = await prisma.member.count();
    return NextResponse.json({ ok: true, memberCount: count, dbUrl: maskUrl(process.env.DATABASE_URL) });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      name: err instanceof Error ? err.name : typeof err,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      dbUrl: maskUrl(process.env.DATABASE_URL),
    });
  }
}
