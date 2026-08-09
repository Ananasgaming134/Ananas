import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function maskUrl(url: string | undefined) {
  if (!url) return null;
  const masked = url.replace(/:[^:@]+@/, ":***@");
  return {
    length: url.length,
    json: JSON.stringify(masked),
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
