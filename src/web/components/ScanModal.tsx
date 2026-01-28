/**
 * Scan Modal component - dialog for scanning new repositories
 */
import React, { useState, useCallback } from 'react';

interface ScanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (type: 'github' | 'local', path: string, branch?: string, name?: string) => Promise<void>;
  isScanning: boolean;
}

export function ScanModal({ isOpen, onClose, onScan, isScanning }: ScanModalProps) {
  const [type, setType] = useState<'github' | 'local'>('local');
  const [path, setPath] = useState('');
  const [branch, setBranch] = useState('main');
  const [name, setName] = useState('');

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!path.trim()) return;
    
    await onScan(type, path, type === 'github' ? branch : undefined, name || undefined);
    
    // Reset form
    setPath('');
    setBranch('main');
    setName('');
  }, [type, path, branch, name, onScan]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Scan Repository</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Source Type</label>
            <select value={type} onChange={e => setType(e.target.value as 'github' | 'local')}>
              <option value="local">Local Directory</option>
              <option value="github">GitHub Repository</option>
            </select>
          </div>

          <div className="form-group">
            <label>{type === 'github' ? 'Repository URL' : 'Directory Path'}</label>
            <input
              type="text"
              value={path}
              onChange={e => setPath(e.target.value)}
              placeholder={type === 'github' 
                ? 'https://github.com/owner/repo or owner/repo' 
                : '/path/to/project'
              }
              required
            />
          </div>

          {type === 'github' && (
            <div className="form-group">
              <label>Branch</label>
              <input
                type="text"
                value={branch}
                onChange={e => setBranch(e.target.value)}
                placeholder="main"
              />
            </div>
          )}

          <div className="form-group">
            <label>Name (optional)</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Give this graph a name"
            />
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isScanning}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isScanning || !path.trim()}>
              {isScanning ? 'Scanning...' : 'Scan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
