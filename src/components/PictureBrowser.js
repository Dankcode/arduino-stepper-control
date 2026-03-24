import React, { useState, useEffect, useCallback } from 'react';

const cleanPath = (path) => path.replace(/\\/g, '/');

const PictureBrowser = ({ PI_BACKEND_URL }) => {
    const [contents, setContents] = useState([]);
    const [currentPath, setCurrentPath] = useState('');
    const [loading, setLoading] = useState(false);
    const [downloadLoading, setDownloadLoading] = useState(false);
    const [error, setError] = useState(null);

    const fetchPictures = useCallback(async (path) => {
        setLoading(true);
        setError(null);

        const fetchUrl = `${PI_BACKEND_URL}/pictures?path=${path}`;

        try {
            const response = await fetch(fetchUrl);

            if (!response.ok) {
                const contentType = response.headers.get("content-type");
                let errorText = `Server returned status ${response.status}.`;

                if (contentType && contentType.includes("application/json")) {
                    const errorData = await response.json();
                    errorText = errorData.error || errorText;
                } else {
                    errorText = `Server returned HTML status ${response.status}. Please check backend directory paths or permissions.`;
                }

                throw new Error(errorText);
            }

            const data = await response.json();
            setContents(data.contents || []);
            setCurrentPath(data.currentPath);

        } catch (err) {
            console.error('Fetch error:', err.message);
            setError(err.message);
            setContents([]);
        } finally {
            setLoading(false);
        }
    }, [PI_BACKEND_URL]);

    useEffect(() => {
        fetchPictures(currentPath);
    }, [fetchPictures, currentPath]);

    const handleItemClick = (item) => {
        const fullItemPath = cleanPath(currentPath ? `${currentPath}/${item.name}` : item.name);

        if (item.is_folder) {
            setCurrentPath(fullItemPath);
        }
    };

    const handleGoUp = () => {
        if (currentPath === '' || currentPath === '.') return;

        const parentPath = currentPath.substring(0, currentPath.lastIndexOf('/') > 0
            ? currentPath.lastIndexOf('/')
            : 0);

        setCurrentPath(cleanPath(parentPath));
    };

    const handleDownloadFolder = async (folderPath, folderName) => {
        setDownloadLoading(true);
        try {
            const response = await fetch(
                `${PI_BACKEND_URL}/pictures/download?path=${encodeURIComponent(folderPath)}`,
                { method: 'GET' }
            );

            if (!response.ok) {
                throw new Error(`Download failed with status ${response.status}`);
            }

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
            console.error('Download error:', err.message);
            setError(`Download failed: ${err.message}`);
        } finally {
            setDownloadLoading(false);
        }
    };

    const renderPathDisplay = () => {
        const pathParts = currentPath.split('/').filter(p => p);
        if (pathParts.length === 0) return 'Root /';

        let cumulativePath = '';
        const pathElements = pathParts.map((part, index) => {
            cumulativePath = cleanPath(cumulativePath ? `${cumulativePath}/${part}` : part);

            if (index === pathParts.length - 1) {
                return <span key={index} className="path-segment path-segment-current">{part} /</span>;
            }

            return (
                <span key={index} className="path-segment">
                    <button
                        onClick={() => setCurrentPath(cumulativePath)}
                        className="path-button"
                    >
                        {part}
                    </button>
                    <span> / </span>
                </span>
            );
        });

        const rootButton = (
            <button
                onClick={() => setCurrentPath('')}
                className="path-button"
                key="root"
            >
                Root
            </button>
        );

        return <div className="path-display">{rootButton} / {pathElements}</div>;
    };

    const renderFileItem = (item) => {
        const fullItemPath = cleanPath(currentPath ? `${currentPath}/${item.name}` : item.name);

        return (
            <li
                key={item.name}
                onClick={() => handleItemClick(item)}
                className="file-item"
            >
                <div className="file-item-info">
                    <span className="file-item-icon">{item.is_folder ? '📁' : '🖼️'}</span>
                    <strong>{item.name}</strong>
                </div>
                <div className="file-item-actions">
                    <span className="file-item-size">
                        {item.is_folder ? 'Folder' : `${Math.round(item.size / 1024)} KB`}
                    </span>
                    {item.is_folder && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                handleDownloadFolder(fullItemPath, item.name);
                            }}
                            className="download-folder-button"
                            disabled={downloadLoading}
                            title="Download as ZIP"
                        >
                            Download
                        </button>
                    )}
                </div>
            </li>
        );
    };

    return (
        <div className="card-browser">
            <style jsx>{`
                .card-browser {
                    max-width: 80rem;
                    width: 100%;
                    padding: 1.5rem;
                    background-color: #1e293b;
                    border-radius: 1rem;
                    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5);
                    border: 1px solid #334155;
                    color: #f8fafc;
                }
                .browser-title {
                    font-size: 1.25rem; 
                    font-weight: 800;
                    margin-bottom: 1.5rem; 
                    color: #f8fafc;
                    text-transform: uppercase;
                    letter-spacing: 0.1em;
                }
                    
                .path-display { 
                    margin-bottom: 1.5rem; 
                    font-size: 0.85rem;
                    color: #94a3b8;
                    font-family: 'JetBrains Mono', monospace;
                    padding: 0.75rem;
                    background: #0f172a;
                    border-radius: 0.5rem;
                    border: 1px solid #334155;
                }
                .path-button { 
                    background: none; 
                    border: none; 
                    color: #0ea5e9; 
                    cursor: pointer; 
                    text-decoration: none; 
                    padding: 0;
                    font-weight: 700;
                }
                .path-button:hover {
                    text-decoration: underline;
                }
                .path-segment-current {
                    font-weight: bold;
                    color: #f8fafc;
                }
                .control-buttons { 
                    display: flex; 
                    gap: 12px; 
                    margin-bottom: 1.5rem;
                }
                .go-up-button { 
                    padding: 0.6rem 1.25rem; 
                    background: #334155; 
                    border: 1px solid #475569; 
                    border-radius: 0.5rem; 
                    cursor: pointer;
                    font-weight: 700;
                    color: #f8fafc;
                    font-size: 0.75rem;
                    text-transform: uppercase;
                    transition: all 0.2s;
                }
                .go-up-button:hover:not(:disabled) {
                    background: #475569;
                }
                .go-up-button:disabled { 
                    opacity: 0.5;
                    cursor: not-allowed;
                }
                .refresh-button { 
                    padding: 0.6rem 1.25rem; 
                    background: linear-gradient(135deg, #0ea5e9, #0284c7); 
                    color: white; 
                    border: none; 
                    border-radius: 0.5rem; 
                    cursor: pointer;
                    font-weight: 700;
                    font-size: 0.75rem;
                    text-transform: uppercase;
                    transition: all 0.2s;
                }
                .refresh-button:hover:not(:disabled) {
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(14, 165, 233, 0.3);
                }
                .refresh-button:disabled { 
                    opacity: 0.5;
                    cursor: not-allowed;
                }
                .error-message { 
                    color: #ef4444;
                    background-color: rgba(239, 68, 68, 0.1);
                    padding: 0.75rem;
                    border-radius: 0.5rem;
                    margin-bottom: 1.5rem;
                    border: 1px solid #ef4444;
                    font-family: 'JetBrains Mono', monospace;
                    font-size: 0.8rem;
                }
                .file-list { 
                    list-style-type: none; 
                    padding: 0; 
                    max-height: 60vh; 
                    overflow-y: auto; 
                    border: 1px solid #334155; 
                    border-radius: 0.75rem; 
                    background: #0f172a;
                }
                .file-list-empty {
                    padding: 2rem; 
                    color: #64748b;
                    text-align: center;
                    font-style: italic;
                }
                .file-item { 
                    padding: 1rem;
                    border-bottom: 1px solid #1e293b; 
                    cursor: pointer;
                    transition: all 0.2s;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 1rem;
                }
                .file-item:last-child {
                    border-bottom: none;
                }
                .file-item:hover {
                    background-color: #1e293b;
                }
                .file-item-info {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    flex: 1;
                }
                .file-item-icon {
                    font-size: 1.5rem;
                    filter: drop-shadow(0 0 5px rgba(14, 165, 233, 0.2));
                }
                .file-item strong {
                    color: #f1f5f9;
                    font-size: 0.9rem;
                }
                .file-item-actions {
                    display: flex;
                    align-items: center;
                    gap: 1.5rem;
                }
                .file-item-size { 
                    font-size: 0.75rem; 
                    color: #94a3b8;
                    min-width: 80px;
                    text-align: right;
                    font-family: 'JetBrains Mono', monospace;
                }
                .download-folder-button {
                    display: flex;
                    padding: 0.5rem 1rem;
                    background-color: #334155;
                    color: #10b981;
                    border: 1px solid #10b981;
                    border-radius: 0.375rem;
                    cursor: pointer;
                    font-size: 0.75rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    transition: all 0.2s;
                }
                .download-folder-button:hover:not(:disabled) {
                    background-color: #10b981;
                    color: #0f172a;
                    box-shadow: 0 0 10px rgba(16, 185, 129, 0.4);
                }
                .download-folder-button:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
            `}</style>

            <h2 className="browser-title">Picture Folder Browser</h2>

            {renderPathDisplay()}

            <div className="control-buttons">
                <button
                    onClick={handleGoUp}
                    disabled={currentPath === '' || currentPath === '.' || loading}
                    className="go-up-button"
                >
                    ⬆️ Go Up
                </button>
                <button
                    onClick={() => fetchPictures(currentPath)}
                    disabled={loading}
                    className="refresh-button"
                >
                    {loading ? '⟳ Refreshing...' : '⟳ Refresh'}
                </button>
            </div>

            {error && <p className="error-message">Error: {error}</p>}

            <ul className="file-list">
                {contents.length === 0 && !loading ? (
                    <li className="file-list-empty">This folder is empty.</li>
                ) : (
                    contents.map(renderFileItem)
                )}
            </ul>
        </div>
    );
};

export default PictureBrowser;