import React, { useCallback, useState } from 'react';
import { Upload, FileText, X, AlertCircle, Github } from 'lucide-react';
import { WorkflowFile } from '../types/workflow';
import GitHubUrlInput from './GitHubUrlInput';

interface FileUploadProps {
  onFilesUploaded: (files: WorkflowFile[]) => void;
  uploadedFiles: WorkflowFile[];
  onRemoveFile: (fileId: string) => void;
}

export default function FileUpload({ onFilesUploaded, uploadedFiles, onRemoveFile }: FileUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'upload' | 'github'>('upload');

  const validateFile = (file: File): string | null => {
    if (!file.name.match(/\.(yml|yaml)$/i)) {
      return 'Only YAML files (.yml, .yaml) are supported';
    }
    if (file.size > 1024 * 1024) { // 1MB limit
      return 'File size must be less than 1MB';
    }
    return null;
  };

  const processFiles = useCallback(async (files: FileList) => {
    setError(null);
    const validFiles: WorkflowFile[] = [];
    const errors: string[] = [];

    for (const file of Array.from(files)) {
      const validationError = validateFile(file);
      if (validationError) {
        errors.push(`${file.name}: ${validationError}`);
        continue;
      }

      try {
        const content = await file.text();
        const workflowFile: WorkflowFile = {
          id: `upload-${file.name}-${Date.now()}-${Math.random()}`,
          name: file.name,
          content,
          source: 'upload'
        };
        validFiles.push(workflowFile);
      } catch (err) {
        errors.push(`${file.name}: Failed to read file`);
      }
    }

    if (errors.length > 0) {
      setError(errors.join('; '));
    }

    if (validFiles.length > 0) {
      onFilesUploaded(validFiles);
    }
  }, [onFilesUploaded]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    processFiles(e.dataTransfer.files);
  }, [processFiles]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      processFiles(e.target.files);
    }
  }, [processFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleGitHubFilesExtracted = useCallback((files: WorkflowFile[]) => {
    onFilesUploaded(files);
  }, [onFilesUploaded]);

  return (
    <div className="w-full space-y-6">
      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8" aria-label="Tabs">
          <button
            onClick={() => setActiveTab('upload')}
            className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'upload'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Upload className="w-4 h-4 inline mr-2" />
            Upload Files
          </button>
          <button
            onClick={() => setActiveTab('github')}
            className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'github'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Github className="w-4 h-4 inline mr-2" />
            From GitHub
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'upload' ? (
        <>
          {/* Upload Zone */}
          <div
            className={`
              relative border-2 border-dashed rounded-xl p-8 md:p-12 text-center transition-all duration-200
              ${isDragOver 
                ? 'border-blue-400 bg-blue-50 scale-105' 
                : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
              }
            `}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <input
              type="file"
              multiple
              accept=".yml,.yaml"
              onChange={handleFileInput}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              id="file-upload"
            />
            
            <div className="flex flex-col items-center space-y-4">
              <div className={`p-4 rounded-full transition-colors ${isDragOver ? 'bg-blue-100' : 'bg-gray-100'}`}>
                <Upload className={`w-8 h-8 ${isDragOver ? 'text-blue-600' : 'text-gray-600'}`} />
              </div>
              
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-gray-900">
                  Drop your workflow files here
                </h3>
                <p className="text-sm text-gray-600 max-w-md mx-auto">
                  Upload one or more GitHub Actions workflow files (.yml or .yaml) to analyze for security, performance, and best practices.
                </p>
              </div>
              
              <label 
                htmlFor="file-upload"
                className="inline-flex items-center px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors cursor-pointer touch-manipulation min-h-[44px]"
              >
                <Upload className="w-5 h-5 mr-2" />
                Choose Files
              </label>
            </div>
          </div>
        </>
      ) : (
        <GitHubUrlInput onFilesExtracted={handleGitHubFilesExtracted} />
      )}

      {/* Error Message */}
      {error && (
        <div className="flex items-start space-x-3 p-4 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="text-sm font-medium text-red-800">Upload Error</h4>
            <p className="text-sm text-red-700 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Uploaded Files */}
      {uploadedFiles.length > 0 && (
        <div className="space-y-3">
          <h4 className="font-medium text-gray-900">
            {uploadedFiles.some(f => f.source === 'github') ? 'Extracted & Uploaded Files' : 'Uploaded Files'}
          </h4>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {uploadedFiles.map((file) => (
              <div
                key={file.id}
                className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-center space-x-3 min-w-0 flex-1">
                  <div className="flex-shrink-0">
                    {file.source === 'github' ? (
                      <Github className="w-5 h-5 text-blue-600" />
                    ) : (
                      <FileText className="w-5 h-5 text-blue-600" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {file.name}
                    </p>
                    <div className="flex items-center space-x-2 text-xs text-gray-500">
                      <span>{(file.content.length / 1024).toFixed(1)} KB</span>
                      {file.source === 'github' && file.repoUrl && (
                        <>
                          <span>•</span>
                          <a 
                            href={file.repoUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 truncate max-w-24"
                          >
                            GitHub
                          </a>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => onRemoveFile(file.id)}
                  className="flex-shrink-0 p-1 text-gray-400 hover:text-red-600 transition-colors touch-manipulation"
                  aria-label="Remove file"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}