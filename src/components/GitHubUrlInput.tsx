import React, { useState } from 'react';
import { Github, Download, AlertCircle, CheckCircle, ExternalLink } from 'lucide-react';
import { WorkflowFile } from '../types/workflow';
import { fetchWorkflowFiles, parseGitHubUrl, validateGitHubUrl } from '../utils/githubExtractor';

interface GitHubUrlInputProps {
  onFilesExtracted: (files: WorkflowFile[]) => void;
}

export default function GitHubUrlInput({ onFilesExtracted }: GitHubUrlInputProps) {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Validate URL
    const validation = validateGitHubUrl(url);
    if (!validation.isValid) {
      setError(validation.error || 'Invalid URL');
      return;
    }

    const repoInfo = parseGitHubUrl(url);
    if (!repoInfo) {
      setError('Failed to parse GitHub URL');
      return;
    }

    setIsLoading(true);

    try {
      const workflowFiles = await fetchWorkflowFiles(repoInfo);
      
      if (workflowFiles.length > 0) {
        onFilesExtracted(workflowFiles);
        setSuccess(`Successfully extracted ${workflowFiles.length} workflow file${workflowFiles.length !== 1 ? 's' : ''} from ${repoInfo.owner}/${repoInfo.repo}`);
        setUrl(''); // Clear the input after successful extraction
      } else {
        setError('No workflow files found in the repository');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to extract workflow files');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUrl(e.target.value);
    setError(null);
    setSuccess(null);
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="github-url" className="block text-sm font-medium text-gray-700 mb-2">
            GitHub Repository URL
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Github className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="url"
              id="github-url"
              value={url}
              onChange={handleUrlChange}
              placeholder="https://github.com/owner/repository"
              className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
              disabled={isLoading}
            />
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Enter a public GitHub repository URL to automatically extract and analyze all workflow files
          </p>
        </div>

        <button
          type="submit"
          disabled={isLoading || !url.trim()}
          className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[44px]"
        >
          {isLoading ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent mr-2"></div>
              Extracting...
            </>
          ) : (
            <>
              <Download className="w-5 h-5 mr-2" />
              Extract Workflows
            </>
          )}
        </button>
      </form>

      {/* Success Message */}
      {success && (
        <div className="flex items-start space-x-3 p-4 bg-green-50 border border-green-200 rounded-lg">
          <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <h4 className="text-sm font-medium text-green-800">Success!</h4>
            <p className="text-sm text-green-700 mt-1">{success}</p>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="flex items-start space-x-3 p-4 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <h4 className="text-sm font-medium text-red-800">Error</h4>
            <p className="text-sm text-red-700 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Examples */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h4 className="text-sm font-medium text-gray-900 mb-2">Example URLs:</h4>
        <div className="space-y-1 text-xs text-gray-600">
          <div className="flex items-center space-x-2">
            <code className="bg-white px-2 py-1 rounded border">https://github.com/actions/starter-workflows</code>
            <button
              type="button"
              onClick={() => setUrl('https://github.com/actions/starter-workflows')}
              className="text-blue-600 hover:text-blue-800"
            >
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>
          <div className="flex items-center space-x-2">
            <code className="bg-white px-2 py-1 rounded border">https://github.com/owner/repo/tree/main</code>
          </div>
          <div className="flex items-center space-x-2">
            <code className="bg-white px-2 py-1 rounded border">https://github.com/owner/repo.git</code>
          </div>
        </div>
      </div>
    </div>
  );
}