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
                    max-width: 72rem;
                    width: 100%;
                    padding: 2rem;
                    background-color: #ffffff;
                    border-radius: 1.5rem;
                    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
                    border: 1px solid #e2e8f0;
                    color: black;
                }
                .browser-title {
                    font-size: 1.5rem; 
                    font-weight: 700;
                    margin-bottom: 1rem; 
                    color: #1a202c;
                }
                    
                .path-display { 
                    margin-bottom: 1rem; 
                    font-size: 0.9rem;
                    color: #4b5563;
                }
                .path-button { 
                    background: none; 
                    border: none; 
                    color: #3b82f6; 
                    cursor: pointer; 
                    text-decoration: underline; 
                    padding: 0;
                }
                .path-segment-current {
                    font-weight: bold;
                }
                .control-buttons { 
                    display: flex; 
                    gap: 10px; 
                    margin-bottom: 1rem;
                }
                .go-up-button { 
                    padding: 0.5rem 1rem; 
                    background: #ccc; 
                    border: none; 
                    border-radius: 0.5rem; 
                    cursor: pointer;
                    font-weight: 600;
                }
                .go-up-button:disabled { 
                    opacity: 0.5;
                    cursor: not-allowed;
                }
                .refresh-button { 
                    padding: 0.5rem 1rem; 
                    background: #3b82f6; 
                    color: white; 
                    border: none; 
                    border-radius: 0.5rem; 
                    cursor: pointer;
                    font-weight: 600;
                }
                .refresh-button:disabled { 
                    opacity: 0.5;
                    cursor: not-allowed;
                }
                .error-message { 
                    color: #ef4444;
                    background-color: #fee2e2;
                    padding: 0.75rem;
                    border-radius: 0.5rem;
                    margin-bottom: 1rem;
                }
                .file-list { 
                    list-style-type: none; 
                    padding: 0; 
                    max-height: 70vh; 
                    overflow-y: auto; 
                    border: 1px solid #e2e8f0; 
                    border-radius: 0.5rem; 
                }
                .file-list-empty {
                    padding: 1rem; 
                    color: #6b7280;
                    text-align: center;
                }
                .file-item { 
                    padding: 0.75rem;
                    border-bottom: 1px solid #e2e8f0; 
                    cursor: pointer;
                    transition: background-color 0.1s;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 1rem;
                }
                .file-item:hover {
                    background-color: #f7f7f7;
                }
                .file-item-info {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    flex: 1;
                }
                .file-item-icon {
                    font-size: 1.25rem;
                }
                .file-item-actions {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                }
                .file-item-size { 
                    font-size: 0.75rem; 
                    color: #6b7280;
                    min-width: 100px;
                    text-align: right;
                }
                .download-folder-button {
                    display: flex;
                    padding: 0.4rem 0.6rem;
                    background-color: #10b981;
                    color: white;
                    border: none;
                    border-radius: 0.375rem;
                    cursor: pointer;
                    font-size: 0.9rem;
                    font-weight: 600;
                    transition: background-color 0.2s;
                    margin-left: 100px;
                }
                .download-folder-button:hover {
                    background-color: #059669;
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