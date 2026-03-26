'use client';
import React, { useState, useEffect } from 'react';

const PictureBrowserRefactored = () => {
  const [pictures, setPictures] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchPictures = async () => {
    setLoading(true);
    try {
      // In a real app, this would list files in public/pictures
      // For this local tool, we might need a dedicated API to list local files
      const res = await fetch('/api/sync/list-local');
      const data = await res.json();
      if (data.success) {
        setPictures(data.files);
      }
    } catch (err) {
      console.error('Failed to fetch local pictures:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPictures();
  }, []);

  return (
    <div className="browser-container">
      <style jsx>{`
        .browser-container { padding: 1.5rem; color: #f8fafc; }
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem; margin-top: 1rem; }
        .pic-card { background: #1e293b; border: 1px solid #334155; border-radius: 0.5rem; overflow: hidden; }
        .pic-img { width: 100%; aspect-ratio: 4/3; object-fit: cover; }
        .pic-info { padding: 0.5rem; font-size: 0.75rem; text-align: center; }
      `}</style>
      
      <h2 style={{ fontSize: '1.1rem', fontWeight: 700, textTransform: 'uppercase' }}>Local Pictures</h2>
      
      <div className="grid">
        {loading ? (
          <p>Loading pictures...</p>
        ) : pictures.length === 0 ? (
          <p>No pictures found locally.</p>
        ) : (
          pictures.map(p => (
            <div key={p.name} className="pic-card">
              <img src={`/pictures/${p.name}`} className="pic-img" alt={p.name} />
              <div className="pic-info">{p.name}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default PictureBrowserRefactored;
