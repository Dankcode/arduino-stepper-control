import { NextResponse } from 'next/server';
import { db, initDb } from '@/lib/db';
import { routines } from '@/lib/schema';
import { desc } from 'drizzle-orm';

export async function GET() {
  try {
    initDb();
    const allRoutines = await db.query.routines.findMany({
      orderBy: [desc(routines.createdAt)],
      with: {
        wells: true,
      }
    });
    
    // Format to match the previous API structure if possible
    return NextResponse.json({ 
      success: true, 
      all_routines: allRoutines.map(r => ({
        ...r,
        name: r.name,
        totalRuntime: r.wells?.reduce((acc, w) => acc + (w.stepAmount || 0) + (w.delayBetweenStep || 0) + (w.lightTime || 0) + (w.exposureTime / 1000 || 0), 0) || 0
      })),
      active_routines: allRoutines.filter(r => r.status === 'running' || r.repeatInterval !== 'once').map(r => ({
        name: r.name,
        time: r.startTime,
        day: 0, // Placeholder
      }))
    });
  } catch (error) {
    console.error('Error listing routines:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
