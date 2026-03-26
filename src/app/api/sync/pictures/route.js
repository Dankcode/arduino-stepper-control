import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { downloads } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

export async function POST(req) {
  try {
    const PI_URL = process.env.PI_BACKEND_URL || 'http://192.168.1.43:5000';
    const LOCAL_PICTURES_DIR = path.join(process.cwd(), 'public', 'pictures');
    
    // Ensure local directory exists
    if (!fs.existsSync(LOCAL_PICTURES_DIR)) {
      fs.mkdirSync(LOCAL_PICTURES_DIR, { recursive: true });
    }

    // Get all pending downloads
    const pendingDownloads = await db.query.downloads.findMany({
      where: eq(downloads.status, 'pending'),
    });

    const results = [];

    for (const downloadItem of pendingDownloads) {
      const filename = downloadItem.filename;
      const downloadUrl = `${PI_URL}/api/cache/download/${filename}`;
      const localFilePath = path.join(LOCAL_PICTURES_DIR, filename);

      try {
        console.log(`Downloading ${filename} from Pi...`);
        const response = await axios.get(downloadUrl, { responseType: 'arraybuffer' });
        
        // Save locally
        fs.writeFileSync(localFilePath, response.data);
        
        // Delete from Pi cache
        await axios.delete(`${PI_URL}/api/cache/delete/${filename}`);
        
        // Update local status
        await db.update(downloads).set({ 
          status: 'completed', 
          updatedAt: new Date().toISOString() 
        }).where(eq(downloads.id, downloadItem.id));
        
        results.push({ filename, status: 'success' });
      } catch (error) {
        console.error(`Error downloading ${filename}:`, error.message);
        // Increment attempts
        await db.update(downloads).set({ 
          attempts: (downloadItem.attempts || 0) + 1,
          status: 'error',
          updatedAt: new Date().toISOString()
        }).where(eq(downloads.id, downloadItem.id));
        
        results.push({ filename, status: 'error', error: error.message });
      }
    }

    return NextResponse.json({ success: true, processed: results.length, results });
  } catch (error) {
    console.error('Sync error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
