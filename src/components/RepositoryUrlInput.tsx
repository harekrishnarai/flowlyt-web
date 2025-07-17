import React, { useState } from 'react';
import { Github, GitBranch, Download, AlertCircle, CheckCircle, ExternalLink } from 'lucide-react';
import { WorkflowFile } from '../types/workflow';
import { fetchWorkflowFiles, parseGitHubUrl, validateGitHubUrl } from '../utils/githubExtractor';
import { fetchGitLabCIFiles, parseGitLabUrl, validateGitLabUrl, detectRepositoryType } from '../utils/gitlabExtractor';

interface RepositoryUrlInputProps {
  onFilesExtracted: (files: WorkflowFile[]) => void;
}

export default function RepositoryUrlInput({ onFilesExtracted }: RepositoryUrlInputProps) {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const repoType = detectRepositoryType(url);
    
    if (repoType === 'unknown') {
      setError('URL must be from GitHub (github.com) or GitLab (gitlab.com or other GitLab instances)');
      return;
    }

    setIsLoading(true);

    try {
      let workflowFiles: WorkflowFile[] = [];
      let repoDisplayName = '';

      if (repoType === 'github') {
        // Validate GitHub URL
        const validation = validateGitHubUrl(url);
        if (!validation.isValid) {
          setError(validation.error || 'Invalid GitHub URL');
          return;
        }

        const repoInfo = parseGitHubUrl(url);
        if (!repoInfo) {
          setError('Failed to parse GitHub URL');
          return;
        }

        workflowFiles = await fetchWorkflowFiles(repoInfo);
        repoDisplayName = `${repoInfo.owner}/${repoInfo.repo}`;
      } else if (repoType === 'gitlab') {
        // Validate GitLab URL
        const validation = validateGitLabUrl(url);
        if (!validation.isValid) {
          setError(validation.error || 'Invalid GitLab URL');
          return;
        }

        const repoInfo = parseGitLabUrl(url);
        if (!repoInfo) {
          setError('Failed to parse GitLab URL');
          return;
        }

        workflowFiles = await fetchGitLabCIFiles(repoInfo);
        repoDisplayName = `${repoInfo.owner}/${repoInfo.repo}`;
      }
      
      if (workflowFiles.length > 0) {
        onFilesExtracted(workflowFiles);
        const fileType = repoType === 'github' ? 'workflow' : 'CI';
        setSuccess(`Successfully extracted ${workflowFiles.length} ${fileType} file${workflowFiles.length !== 1 ? 's' : ''} from ${repoDisplayName}`);
        setUrl(''); // Clear the input after successful extraction
      } else {
        const fileType = repoType === 'github' ? 'workflow files' : 'GitLab CI files';
        setError(`No ${fileType} found in the repository`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to extract ${repoType === 'github' ? 'workflow' : 'CI'} files`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUrl(e.target.value);
    setError(null);
    setSuccess(null);
  };

  const detectedType = url ? detectRepositoryType(url) : 'unknown';

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="repo-url" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 transition-colors duration-300">
            Repository URL
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              {detectedType === 'github' ? (
                <Github className="h-5 w-5 text-blue-600 dark:text-blue-400 transition-colors duration-300" />
              ) : detectedType === 'gitlab' ? (
                <GitBranch className="h-5 w-5 text-orange-600 dark:text-orange-400 transition-colors duration-300" />
              ) : (
                <GitBranch className="h-5 w-5 text-gray-400 dark:text-gray-500 transition-colors duration-300" />
              )}
            </div>
            <input
              type="url"
              id="repo-url"
              value={url}
              onChange={handleUrlChange}
              placeholder="https://github.com/owner/repo or https://gitlab.com/owner/repo"
              className="block w-full pl-10 pr-3 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 transition-colors duration-300"
              disabled={isLoading}
            />
          </div>
          <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 transition-colors duration-300">
            {detectedType === 'github' && (
              <p className="flex items-center">
                <Github className="w-3 h-3 mr-1 text-blue-600" />
                GitHub repository detected - will extract GitHub Actions workflows
              </p>
            )}
            {detectedType === 'gitlab' && (
              <p className="flex items-center">
                <GitBranch className="w-3 h-3 mr-1 text-orange-600" />
                GitLab repository detected - will extract GitLab CI files
              </p>
            )}
            {detectedType === 'unknown' && (
              <p>Enter a public GitHub or GitLab repository URL to automatically extract and analyze CI/CD files</p>
            )}
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading || !url.trim() || detectedType === 'unknown'}
          className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3 bg-blue-600 dark:bg-blue-700 text-white font-medium rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[44px]"
        >
          {isLoading ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent mr-2"></div>
              Extracting...
            </>
          ) : (
            <>
              <Download className="w-5 h-5 mr-2" />
              Extract {detectedType === 'github' ? 'Workflows' : detectedType === 'gitlab' ? 'CI Files' : 'Files'}
            </>
          )}
        </button>
      </form>

      {/* Success Message */}
      {success && (
        <div className="flex items-start space-x-3 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/30 rounded-lg transition-colors duration-300">
          <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0 transition-colors duration-300" />
          <div className="flex-1">
            <h4 className="text-sm font-medium text-green-800 dark:text-green-200 transition-colors duration-300">Success!</h4>
            <p className="text-sm text-green-700 dark:text-green-300 mt-1 transition-colors duration-300">{success}</p>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="flex items-start space-x-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 rounded-lg transition-colors duration-300">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0 transition-colors duration-300" />
          <div className="flex-1">
            <h4 className="text-sm font-medium text-red-800 dark:text-red-200 transition-colors duration-300">Error</h4>
            <p className="text-sm text-red-700 dark:text-red-300 mt-1 transition-colors duration-300">{error}</p>
          </div>
        </div>
      )}

      {/* Examples */}
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 transition-colors duration-300">
        <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2 transition-colors duration-300">Example URLs:</h4>
        <div className="space-y-2 text-xs text-gray-600 dark:text-gray-400 transition-colors duration-300">
          <div>
            <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">GitHub (Actions workflows):</p>
            <div className="flex items-center space-x-2 mb-1">
              <code className="bg-white dark:bg-gray-700 px-2 py-1 rounded border border-gray-200 dark:border-gray-600 text-gray-800 dark:text-gray-200 transition-colors duration-300">https://github.com/actions/starter-workflows</code>
              <button
                type="button"
                onClick={() => setUrl('https://github.com/actions/starter-workflows')}
                className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors duration-300"
              >
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          </div>
          <div>
            <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">GitLab (CI/CD pipelines):</p>
            <div className="flex items-center space-x-2 mb-1">
              <code className="bg-white dark:bg-gray-700 px-2 py-1 rounded border border-gray-200 dark:border-gray-600 text-gray-800 dark:text-gray-200 transition-colors duration-300">https://gitlab.com/gitlab-org/gitlab</code>
              <button
                type="button"
                onClick={() => setUrl('https://gitlab.com/gitlab-org/gitlab')}
                className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors duration-300"
              >
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          </div>
          <div className="text-xs">
            <p>Supported formats: https://domain.com/owner/repo, https://domain.com/owner/repo/-/tree/branch</p>
          </div>
        </div>
      </div>
    </div>
  );
}