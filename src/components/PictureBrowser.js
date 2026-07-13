import React, { useState, useEffect, useCallback, useMemo } from 'react';

const cleanPath = (path) => path.replace(/\\/g, '/');
const IMAGE_EXTENSIONS = /\.(jpe?g|png|gif|bmp|webp|tiff?)$/i;

const formatSize = (bytes) => {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

const formatDate = (epochSeconds) => {
    if (!epochSeconds) return '';
    return new Date(epochSeconds * 1000).toLocaleString([], {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
};

const PictureBrowser = ({ PI_BACKEND_URL }) => {
    const [contents, setContents] = useState([]);
    const [currentPath, setCurrentPath] = useState('');
    const [loading, setLoading] = useState(false);
    const [downloadLoading, setDownloadLoading] = useState(false);
    const [error, setError] = useState(null);
    const [lightboxIndex, setLightboxIndex] = useState(null); // index into images[]

    const fetchPictures = useCallback(async (path) => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`${PI_BACKEND_URL}/pictures?path=${encodeURIComponent(path)}`);
            if (!response.ok) {
                const contentType = response.headers.get('content-type');
                let errorText = `Server returned status ${response.status}.`;
                if (contentType && contentType.includes('application/json')) {
                    const errorData = await response.json();
                    errorText = errorData.error || errorText;
                }
                throw new Error(errorText);
            }
            const data = await response.json();
            setContents(data.contents || []);
            setCurrentPath(data.currentPath);
        } catch (err) {
            setError(err.message);
            setContents([]);
        } finally {
            setLoading(false);
        }
    }, [PI_BACKEND_URL]);

    useEffect(() => {
        fetchPictures(currentPath);
    }, [fetchPictures, currentPath]);

    const folders = useMemo(() => contents.filter((item) => item.is_folder), [contents]);
    const images = useMemo(
        () => contents.filter((item) => !item.is_folder && IMAGE_EXTENSIONS.test(item.name)),
        [contents],
    );
    const otherFiles = useMemo(
        () => contents.filter((item) => !item.is_folder && !IMAGE_EXTENSIONS.test(item.name)),
        [contents],
    );

    const fileUrl = useCallback((name) => {
        const fullPath = cleanPath(currentPath ? `${currentPath}/${name}` : name);
        return `${PI_BACKEND_URL}/pictures/file?path=${encodeURIComponent(fullPath)}`;
    }, [PI_BACKEND_URL, currentPath]);

    const openFolder = (name) => {
        setCurrentPath(cleanPath(currentPath ? `${currentPath}/${name}` : name));
    };

    const handleGoUp = () => {
        if (!currentPath || currentPath === '.') return;
        const idx = currentPath.lastIndexOf('/');
        setCurrentPath(idx > 0 ? cleanPath(currentPath.substring(0, idx)) : '');
    };

    const handleDownloadFolder = async (folderName) => {
        const folderPath = cleanPath(currentPath ? `${currentPath}/${folderName}` : folderName);
        setDownloadLoading(true);
        try {
            const response = await fetch(
                `${PI_BACKEND_URL}/pictures/download?path=${encodeURIComponent(folderPath)}`,
            );
            if (!response.ok) throw new Error(`Download failed with status ${response.status}`);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `${folderName}.zip`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (err) {
            setError(`Download failed: ${err.message}`);
        } finally {
            setDownloadLoading(false);
        }
    };

    // ---- Lightbox -------------------------------------------------------
    const closeLightbox = useCallback(() => setLightboxIndex(null), []);
    const stepLightbox = useCallback((delta) => {
        setLightboxIndex((idx) => {
            if (idx === null || images.length === 0) return idx;
            return (idx + delta + images.length) % images.length;
        });
    }, [images.length]);

    useEffect(() => {
        if (lightboxIndex === null) return undefined;
        const onKey = (event) => {
            if (event.key === 'Escape') closeLightbox();
            if (event.key === 'ArrowRight') stepLightbox(1);
            if (event.key === 'ArrowLeft') stepLightbox(-1);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [lightboxIndex, closeLightbox, stepLightbox]);

    const lightboxImage = lightboxIndex !== null ? images[lightboxIndex] : null;

    const renderBreadcrumbs = () => {
        const parts = currentPath.split('/').filter(Boolean);
        let cumulative = '';
        return (
            <nav className="pb-breadcrumbs" aria-label="Folder path">
                <button className="pb-crumb-link" onClick={() => setCurrentPath('')} title="Back to the top-level pictures folder">
                    All pictures
                </button>
                {parts.map((part, index) => {
                    cumulative = cleanPath(cumulative ? `${cumulative}/${part}` : part);
                    const target = cumulative;
                    const isLast = index === parts.length - 1;
                    return (
                        <span key={target} className="pb-crumb">
                            <span className="pb-crumb-sep">/</span>
                            {isLast
                                ? <span className="pb-crumb-current">{part}</span>
                                : <button className="pb-crumb-link" onClick={() => setCurrentPath(target)}>{part}</button>}
                        </span>
                    );
                })}
            </nav>
        );
    };

    return (
        <div className="pb-root">
            <style jsx>{`
                .pb-root {
                    width: 100%;
                    max-width: 80rem;
                    padding: 1.5rem;
                    background-color: #1e293b;
                    border-radius: 1rem;
                    border: 1px solid #334155;
                    color: #f8fafc;
                }
                .pb-header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; flex-wrap: wrap; }
                .pb-title { font-size: 1.1rem; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; margin: 0; }
                .pb-subtitle { font-size: 0.8rem; color: #94a3b8; margin: 0.25rem 0 0; }
                .pb-actions { display: flex; gap: 0.5rem; }
                .pb-btn {
                    padding: 0.5rem 1rem; border-radius: 0.5rem; border: 1px solid #475569;
                    background: #334155; color: #f8fafc; font-size: 0.75rem; font-weight: 700;
                    cursor: pointer; transition: background 0.15s;
                }
                .pb-btn:hover:not(:disabled) { background: #475569; }
                .pb-btn:disabled { opacity: 0.5; cursor: not-allowed; }
                .pb-breadcrumbs {
                    display: flex; align-items: center; flex-wrap: wrap; gap: 0.25rem;
                    font-size: 0.85rem; margin-bottom: 1rem; padding: 0.6rem 0.75rem;
                    background: #0f172a; border: 1px solid #334155; border-radius: 0.5rem;
                }
                .pb-crumb-link { background: none; border: none; color: #38bdf8; cursor: pointer; padding: 0; font-weight: 600; }
                .pb-crumb-link:hover { text-decoration: underline; }
                .pb-crumb-sep { color: #475569; margin: 0 0.35rem; }
                .pb-crumb-current { color: #f8fafc; font-weight: 700; }
                .pb-error {
                    color: #fca5a5; background: rgba(239, 68, 68, 0.1); border: 1px solid #ef4444;
                    padding: 0.75rem; border-radius: 0.5rem; margin-bottom: 1rem; font-size: 0.85rem;
                }
                .pb-section-label { font-size: 0.7rem; letter-spacing: 0.1em; text-transform: uppercase; color: #64748b; margin: 1.25rem 0 0.6rem; }
                .pb-folder-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 0.75rem; }
                .pb-folder-card {
                    display: flex; align-items: center; gap: 0.7rem; padding: 0.8rem;
                    background: #0f172a; border: 1px solid #334155; border-radius: 0.6rem;
                    cursor: pointer; transition: border-color 0.15s;
                }
                .pb-folder-card:hover { border-color: #0ea5e9; }
                .pb-folder-meta { min-width: 0; flex: 1; }
                .pb-folder-name { font-size: 0.85rem; font-weight: 700; color: #f1f5f9; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                .pb-folder-date { font-size: 0.7rem; color: #64748b; }
                .pb-zip-btn {
                    background: none; border: 1px solid #10b981; color: #10b981; border-radius: 0.4rem;
                    font-size: 0.65rem; font-weight: 700; padding: 0.3rem 0.5rem; cursor: pointer;
                }
                .pb-zip-btn:hover:not(:disabled) { background: #10b981; color: #0f172a; }
                .pb-image-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 0.75rem; }
                .pb-thumb {
                    position: relative; border: 1px solid #334155; border-radius: 0.6rem; overflow: hidden;
                    background: #0f172a; cursor: zoom-in; padding: 0; text-align: left; transition: border-color 0.15s;
                }
                .pb-thumb:hover { border-color: #0ea5e9; }
                .pb-thumb img { width: 100%; height: 120px; object-fit: cover; display: block; background: #020617; }
                .pb-thumb-caption { padding: 0.4rem 0.55rem; }
                .pb-thumb-name { font-size: 0.72rem; font-weight: 600; color: #e2e8f0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                .pb-thumb-size { font-size: 0.65rem; color: #64748b; }
                .pb-empty { padding: 2.5rem; text-align: center; color: #64748b; }
                .pb-empty-title { font-weight: 700; color: #94a3b8; margin-bottom: 0.3rem; }
                .pb-lightbox {
                    position: fixed; inset: 0; z-index: 200; background: rgba(2, 6, 23, 0.92);
                    display: flex; flex-direction: column; align-items: center; justify-content: center;
                }
                .pb-lightbox img { max-width: 88vw; max-height: 78vh; object-fit: contain; border-radius: 0.5rem; }
                .pb-lightbox-bar {
                    display: flex; align-items: center; gap: 1rem; margin-top: 0.9rem;
                    background: #1e293b; border: 1px solid #334155; border-radius: 0.6rem; padding: 0.6rem 1rem;
                }
                .pb-lightbox-name { font-size: 0.85rem; font-weight: 700; }
                .pb-lightbox-meta { font-size: 0.75rem; color: #94a3b8; }
                .pb-lightbox-close {
                    position: absolute; top: 1.2rem; right: 1.5rem; background: #1e293b; color: #f8fafc;
                    border: 1px solid #475569; border-radius: 0.5rem; padding: 0.45rem 0.8rem; cursor: pointer; font-weight: 700;
                }
                .pb-nav-btn {
                    position: absolute; top: 50%; transform: translateY(-50%);
                    background: #1e293b; color: #f8fafc; border: 1px solid #475569; border-radius: 999px;
                    width: 2.6rem; height: 2.6rem; font-size: 1.2rem; cursor: pointer;
                }
                .pb-nav-btn:hover { border-color: #0ea5e9; }
                .pb-nav-prev { left: 1.2rem; }
                .pb-nav-next { right: 1.2rem; }
                .pb-dl-link { color: #38bdf8; font-size: 0.75rem; font-weight: 700; text-decoration: none; }
                .pb-dl-link:hover { text-decoration: underline; }
            `}</style>

            <div className="pb-header">
                <div>
                    <h2 className="pb-title">Pictures</h2>
                    <p className="pb-subtitle">
                        Images captured by routines and manual snapshots, organized by routine name.
                        Click a thumbnail to view it full size.
                    </p>
                </div>
                <div className="pb-actions">
                    <button
                        className="pb-btn"
                        onClick={handleGoUp}
                        disabled={!currentPath || loading}
                        title="Go to the parent folder"
                    >
                        &#8593; Up one level
                    </button>
                    <button
                        className="pb-btn"
                        onClick={() => fetchPictures(currentPath)}
                        disabled={loading}
                        title="Reload this folder from the backend"
                    >
                        {loading ? 'Refreshing...' : 'Refresh'}
                    </button>
                </div>
            </div>

            {renderBreadcrumbs()}
            {error && <p className="pb-error">{error}</p>}

            {folders.length > 0 && (
                <>
                    <p className="pb-section-label">Folders ({folders.length})</p>
                    <div className="pb-folder-grid">
                        {folders.map((folder) => (
                            <div
                                key={folder.name}
                                className="pb-folder-card"
                                onClick={() => openFolder(folder.name)}
                                title={`Open ${folder.name}`}
                            >
                                <span aria-hidden="true" style={{ fontSize: '1.4rem' }}>&#128193;</span>
                                <div className="pb-folder-meta">
                                    <div className="pb-folder-name">{folder.name}</div>
                                    <div className="pb-folder-date">{formatDate(folder.last_modified)}</div>
                                </div>
                                <button
                                    className="pb-zip-btn"
                                    disabled={downloadLoading}
                                    onClick={(event) => { event.stopPropagation(); handleDownloadFolder(folder.name); }}
                                    title="Download every image in this folder as a ZIP file"
                                >
                                    ZIP
                                </button>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {images.length > 0 && (
                <>
                    <p className="pb-section-label">Images ({images.length})</p>
                    <div className="pb-image-grid">
                        {images.map((image, index) => (
                            <button
                                key={image.name}
                                type="button"
                                className="pb-thumb"
                                onClick={() => setLightboxIndex(index)}
                                title={`View ${image.name} full size`}
                            >
                                <img src={fileUrl(image.name)} alt={image.name} loading="lazy" />
                                <div className="pb-thumb-caption">
                                    <div className="pb-thumb-name">{image.name}</div>
                                    <div className="pb-thumb-size">{formatSize(image.size)}</div>
                                </div>
                            </button>
                        ))}
                    </div>
                </>
            )}

            {otherFiles.length > 0 && (
                <>
                    <p className="pb-section-label">Other files ({otherFiles.length})</p>
                    {otherFiles.map((file) => (
                        <div key={file.name} style={{ fontSize: '0.8rem', color: '#94a3b8', padding: '0.2rem 0' }}>
                            {file.name} — {formatSize(file.size)}
                        </div>
                    ))}
                </>
            )}

            {!loading && folders.length === 0 && images.length === 0 && otherFiles.length === 0 && (
                <div className="pb-empty">
                    <div className="pb-empty-title">No pictures here yet</div>
                    Run a routine or take a manual capture and its images will appear in this folder.
                </div>
            )}

            {lightboxImage && (
                <div className="pb-lightbox" onClick={closeLightbox} role="dialog" aria-label="Image viewer">
                    <button className="pb-lightbox-close" onClick={closeLightbox} title="Close (Esc)">
                        Close &#10005;
                    </button>
                    {images.length > 1 && (
                        <>
                            <button
                                className="pb-nav-btn pb-nav-prev"
                                onClick={(event) => { event.stopPropagation(); stepLightbox(-1); }}
                                title="Previous image (left arrow)"
                            >
                                &#8249;
                            </button>
                            <button
                                className="pb-nav-btn pb-nav-next"
                                onClick={(event) => { event.stopPropagation(); stepLightbox(1); }}
                                title="Next image (right arrow)"
                            >
                                &#8250;
                            </button>
                        </>
                    )}
                    <img
                        src={fileUrl(lightboxImage.name)}
                        alt={lightboxImage.name}
                        onClick={(event) => event.stopPropagation()}
                    />
                    <div className="pb-lightbox-bar" onClick={(event) => event.stopPropagation()}>
                        <span className="pb-lightbox-name">{lightboxImage.name}</span>
                        <span className="pb-lightbox-meta">
                            {formatSize(lightboxImage.size)} &middot; {formatDate(lightboxImage.last_modified)}
                            {images.length > 1 ? ` · ${lightboxIndex + 1} of ${images.length}` : ''}
                        </span>
                        <a className="pb-dl-link" href={fileUrl(lightboxImage.name)} download={lightboxImage.name}>
                            Download
                        </a>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PictureBrowser;
