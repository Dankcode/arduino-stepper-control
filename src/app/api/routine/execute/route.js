import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { routines, wells, downloads } from '@/lib/schema';
import { eq, and, asc } from 'drizzle-orm';
import axios from 'axios';

// Hardware Constants (Calculated on dashboard now)
const DEFAULT_X_STEP = 20;
const DEFAULT_Y_STEP = 20;

// Helper to calculate steps based on well ID (A1, B2, etc.)
function positionFromWellId(wellId) {
  const row = wellId.charCodeAt(0) - 65;
  const col = parseInt(wellId.slice(1)) - 1;
  return { row, col };
}

export async function POST(req) {
  try {
    const { routineId } = await req.json();
    const PI_URL = process.env.PI_BACKEND_URL || 'http://192.168.1.43:5000';

    if (!routineId) return NextResponse.json({ error: 'Routine ID is required' }, { status: 400 });

    const routine = await db.query.routines.findFirst({
      where: eq(routines.id, routineId),
    });

    if (!routine) return NextResponse.json({ error: 'Routine not found' }, { status: 404 });

    // Mark routine as running
    await db.update(routines).set({ status: 'running' }).where(eq(routines.id, routineId));

    // Find next unprocessed well
    const nextWell = await db.query.wells.findFirst({
      where: and(eq(wells.routineId, routineId), eq(wells.processed, false)),
      orderBy: [asc(wells.plateNumber), asc(wells.id)],
    });

    if (!nextWell) {
      await db.update(routines).set({ status: 'completed', lastRun: new Date().toISOString() }).where(eq(routines.id, routineId));
      return NextResponse.json({ success: true, message: 'Routine completed.', completed: true });
    }

    // --- STEP 1: POSITIONING ---
    // Fetch last processed well to calculate movement
    const lastWell = await db.query.wells.findFirst({
      where: and(eq(wells.routineId, routineId), eq(wells.processed, true)),
      orderBy: [asc(wells.id)], // Get the most recent one
    });

    const currentPos = lastWell ? positionFromWellId(lastWell.wellId) : { row: 0, col: 0 };
    const targetPos = positionFromWellId(nextWell.wellId);

    // Simplistic move logic (X then Y or vice versa)
    // In a real routine, we might want to home X after each row
    const xMove = (targetPos.col - currentPos.col) * DEFAULT_X_STEP;
    const yMove = (targetPos.row - currentPos.row) * DEFAULT_Y_STEP;

    if (xMove !== 0) {
      await axios.post(`${PI_URL}/api/motor/move`, { axis: 'X', steps: Math.abs(xMove), forward: xMove > 0 });
    }
    if (yMove !== 0) {
      await axios.post(`${PI_URL}/api/motor/move`, { axis: 'Y', steps: Math.abs(yMove), forward: yMove > 0 });
    }

    // --- STEP 2: LIGHT PULSE ---
    if (nextWell.lightTime > 0) {
      await axios.post(`${PI_URL}/api/light/pulse`, { duration: nextWell.lightTime });
    }

    // --- STEP 3: CAPTURE ---
    const filename = `${routine.name}_${nextWell.wellId || 'well'}_${Date.now()}.jpg`;
    const captureRes = await axios.post(`${PI_URL}/api/camera/capture`, { 
      filename, 
      exposure: nextWell.exposureTime 
    });

    if (captureRes.data.success) {
      // Mark as processed and add to downloads queue
      await db.update(wells).set({ processed: true, picturePath: filename }).where(eq(wells.id, nextWell.id));
      await db.insert(downloads).values({
        wellId: nextWell.id,
        filename: filename,
        status: 'pending',
      });
      
      return NextResponse.json({ success: true, message: `Captured ${nextWell.wellId}`, nextWell: nextWell.wellId });
    } else {
      throw new Error(captureRes.data.message || 'Capture failed');
    }

  } catch (error) {
    console.error('Execution error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
