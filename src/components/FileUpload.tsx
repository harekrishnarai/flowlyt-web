import React, { useCallback, useState } from 'react';
import { Upload, FileText, X, AlertCircle, GitBranch, Github } from 'lucide-react';
import { WorkflowFile } from '../types/workflow';
import RepositoryUrlInput from './RepositoryUrlInput';

interface FileUploadProps {
  onFilesUploaded: (files: WorkflowFile[]) => void;
  uploadedFiles: WorkflowFile[];
  onRemoveFile: (fileId: string) => void;
}

export default function FileUpload({ onFilesUploaded, uploadedFiles, onRemoveFile }: FileUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'upload' | 'repository'>('repository');

  const validateFile = (file: File): string | null => {
    const isWorkflowFile = file.name.match(/\.(yml|yaml)$/i);
    const isGitLabCI = file.name === '.gitlab-ci.yml' || file.name.includes('gitlab-ci');
    
    if (!isWorkflowFile && !isGitLabCI) {
      return 'Only YAML files (.yml, .yaml) or GitLab CI files (.gitlab-ci.yml) are supported';
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

  const handleRepositoryFilesExtracted = useCallback((files: WorkflowFile[]) => {
    onFilesUploaded(files);
  }, [onFilesUploaded]);

  return (
    <div className="w-full space-y-3 sm:space-y-3 overflow-hidden">
      {/* Tab Navigation */}
      <div className="border-b border-gray-200 dark:border-white/10 transition-colors duration-300">
        <nav className="-mb-px flex space-x-2 sm:space-x-4 overflow-x-auto" aria-label="Tabs">
          <button
            onClick={() => setActiveTab('repository')}
            className={`py-1.5 px-1 border-b-2 font-medium text-xs sm:text-sm transition-colors whitespace-nowrap flex-shrink-0 tab-underline ${
              activeTab === 'repository'
                ? 'border-teal-300 text-gray-900 dark:text-white tab-underline-active'
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-500'
            }`}
          >
            <GitBranch className="w-3 h-3 sm:w-4 sm:h-4 inline mr-1 sm:mr-2" />
            From Repository
          </button>
          <button
            onClick={() => setActiveTab('upload')}
            className={`py-1.5 px-1 border-b-2 font-medium text-xs sm:text-sm transition-colors whitespace-nowrap flex-shrink-0 tab-underline ${
              activeTab === 'upload'
                ? 'border-teal-300 text-gray-900 dark:text-white tab-underline-active'
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-500'
            }`}
          >
            <Upload className="w-3 h-3 sm:w-4 sm:h-4 inline mr-1 sm:mr-2" />
            Upload Files
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'repository' ? (
        <RepositoryUrlInput onFilesExtracted={handleRepositoryFilesExtracted} />
      ) : (
        <>
          {/* Upload Zone */}
          <div
            className={`
              relative border-2 border-dashed rounded-xl p-4 sm:p-5 md:p-6 text-center transition-all duration-200 overflow-hidden
              ${isDragOver 
                ? 'border-teal-300/70 bg-white/5 scale-102 shadow-[0_0_0_1px_rgba(56,189,248,0.5)]' 
                : 'border-slate-600 hover:border-teal-300/70 hover:bg-white/5'
              }
            `}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <input
              type="file"
              multiple
              accept=".yml,.yaml,.gitlab-ci.yml"
              onChange={handleFileInput}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              id="file-upload"
            />
            
            <div className="flex flex-col items-center space-y-3 sm:space-y-3">
              <div className={`p-3 sm:p-3.5 rounded-full transition-colors ${isDragOver ? 'bg-teal-500/20' : 'bg-slate-800'}`}>
                <Upload className={`w-6 h-6 sm:w-7 sm:h-7 ${isDragOver ? 'text-teal-200' : 'text-slate-300'} transition-colors duration-300`} />
              </div>
              
              <div className="space-y-1.5 max-w-md mx-auto">
                <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-100 transition-colors duration-300">
                  Drop your CI/CD files here
                </h3>
                <p className="text-xs sm:text-xs text-gray-600 dark:text-gray-400 transition-colors duration-300 break-words">
                  Upload GitHub Actions workflows (.yml/.yaml) or GitLab CI files (.gitlab-ci.yml) to analyze for security, performance, and best practices.
                </p>
              </div>
              
              <label 
                htmlFor="file-upload"
                className="inline-flex items-center px-4 sm:px-4 py-2 sm:py-2 bg-gradient-to-r from-emerald-300 to-cyan-400 text-slate-900 text-sm sm:text-sm font-semibold rounded-lg hover:from-emerald-200 hover:to-cyan-300 transition-colors cursor-pointer touch-manipulation min-h-[40px] btn-lift"
              >
                <Upload className="w-4 h-4 sm:w-4 sm:h-4 mr-2" />
                Choose Files
              </label>
            </div>
          </div>
        </>
      )}

      {/* Error Message */}
      {error && (
        <div className="flex items-start space-x-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 rounded-lg transition-colors duration-300">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0 transition-colors duration-300" />
          <div>
            <h4 className="text-sm font-medium text-red-800 dark:text-red-200 transition-colors duration-300">Upload Error</h4>
            <p className="text-sm text-red-700 dark:text-red-300 mt-1 transition-colors duration-300">{error}</p>
          </div>
        </div>
      )}

      {/* Uploaded Files */}
      {uploadedFiles.length > 0 && (
        <div className="space-y-3">
          <h4 className="font-medium text-gray-900 dark:text-gray-100 transition-colors duration-300 text-sm sm:text-sm">
            {uploadedFiles.some(f => f.source === 'github' || f.source === 'gitlab') ? 'Extracted & Uploaded Files' : 'Uploaded Files'}
          </h4>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {uploadedFiles.map((file) => (
              <div
                key={file.id}
                className="flex items-center justify-between p-3 sm:p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm hover:shadow-md transition-all duration-300"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="flex-shrink-0">
                    {file.source === 'github' ? (
                      <Github className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 dark:text-blue-400 transition-colors duration-300" />
                    ) : file.source === 'gitlab' ? (
                      <GitBranch className="w-4 h-4 sm:w-5 sm:h-5 text-orange-600 dark:text-orange-400 transition-colors duration-300" />
                    ) : (
                      <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 dark:text-blue-400 transition-colors duration-300" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs sm:text-sm font-medium text-gray-900 dark:text-gray-100 truncate transition-colors duration-300">
                      {file.name}
                    </p>
                    <div className="flex flex-col xs:flex-row xs:items-center xs:gap-2 text-xs text-gray-500 dark:text-gray-400 transition-colors duration-300">
                      <span>{(file.content.length / 1024).toFixed(1)} KB</span>
                      {file.source === 'github' && file.repoUrl && (
                        <>
                          <span className="hidden xs:inline">•</span>
                          <a 
                            href={file.repoUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 truncate transition-colors duration-300"
                          >
                            GitHub Repo
                          </a>
                        </>
                      )}
                      {file.source === 'gitlab' && file.repoUrl && (
                        <>
                          <span className="hidden xs:inline">•</span>
                          <a 
                            href={file.repoUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-orange-600 dark:text-orange-400 hover:text-orange-800 dark:hover:text-orange-300 truncate transition-colors duration-300"
                          >
                            GitLab Repo
                          </a>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => onRemoveFile(file.id)}
                  className="flex-shrink-0 p-1 text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 transition-colors touch-manipulation min-w-[44px] min-h-[44px] flex items-center justify-center"
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