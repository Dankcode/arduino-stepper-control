import { NextResponse } from 'next/server';
import { db, initDb } from '@/lib/db';
import { routines, wells } from '@/lib/schema';
import { eq } from 'drizzle-orm';

export async function POST(req) {
  try {
    initDb(); // Ensure tables exist
    const data = await req.json();
    const { filename, well_data, repeatCount, startTime, repeatInterval } = data;

    if (!filename || !well_data) {
      return NextResponse.json({ error: 'Filename and well data are required' }, { status: 400 });
    }

    // Upsert routine
    let routineRecord = await db.query.routines.findFirst({
      where: eq(routines.name, filename),
    });

    if (routineRecord) {
      // Clear old wells if routine exists
      await db.delete(wells).where(eq(wells.routineId, routineRecord.id));
      // Update routine params
      await db.update(routines)
        .set({ repeatCount, startTime, repeatInterval, status: 'idle' })
        .where(eq(routines.id, routineRecord.id));
    } else {
      const result = await db.insert(routines).values({
        name: filename,
        repeatCount,
        startTime,
        repeatInterval,
        status: 'idle',
      }).returning();
      routineRecord = result[0];
    }

    // Insert wells
    const wellsToInsert = well_data.map(well => ({
      routineId: routineRecord.id,
      plateNumber: well.plateNumber,
      wellId: well.wellId,
      stepAmount: parseInt(well.stepAmount) || 0,
      delayBetweenStep: parseInt(well.delayBetweenStep) || 0,
      lightTime: parseFloat(well.lightTime) || 0,
      exposureTime: parseInt(well.exposureTime) || 50000,
      switchPlate: !!well.switchPlate,
      processed: false,
    }));

    if (wellsToInsert.length > 0) {
      await db.insert(wells).values(wellsToInsert);
    }

    return NextResponse.json({ success: true, message: `Routine '${filename}' saved successfully to Dashboard SQL.` });
  } catch (error) {
    console.error('Error saving routine:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
