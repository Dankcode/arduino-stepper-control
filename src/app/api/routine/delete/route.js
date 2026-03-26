import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { routines } from '@/lib/schema';
import { eq } from 'drizzle-orm';

export async function POST(req) {
  try {
    const { filename } = await req.json();
    if (!filename) return NextResponse.json({ error: 'Filename is required' }, { status: 400 });

    await db.delete(routines).where(eq(routines.name, filename));

    return NextResponse.json({ success: true, message: `Routine '${filename}' deleted from Dashboard SQL.` });
  } catch (error) {
    console.error('Error deleting routine:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
