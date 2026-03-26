import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    const LOCAL_PICTURES_DIR = path.join(process.cwd(), 'public', 'pictures');
    
    if (!fs.existsSync(LOCAL_PICTURES_DIR)) {
      return NextResponse.json({ success: true, files: [] });
    }

    const files = fs.readdirSync(LOCAL_PICTURES_DIR)
      .filter(f => f.endsWith('.jpg'))
      .map(f => ({
        name: f,
        path: `/pictures/${f}`
      }));

    return NextResponse.json({ success: true, files });
  } catch (error) {
    console.error('Error listing local pictures:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
