import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Github, GitBranch, AlertCircle, CheckCircle, ExternalLink, Key, ChevronDown, ChevronUp, Shield, Eye, EyeOff, ArrowRight, Gitlab, GitCommit, Folder, RefreshCw } from 'lucide-react';
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
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [githubToken, setGithubToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [provider, setProvider] = useState<'github' | 'gitlab' | 'bitbucket'>('github');
  const [branch, setBranch] = useState('main');
  const [selectAll, setSelectAll] = useState(true);
  const [showRepoModal, setShowRepoModal] = useState(false);
  const [modalStep, setModalStep] = useState<1 | 2>(1);
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [branches, setBranches] = useState<string[]>(['main']);
  const [filesPreview, setFilesPreview] = useState<string[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [latestCommit, setLatestCommit] = useState<{
    author?: string;
    message?: string;
    avatarUrl?: string;
    committedDate?: string;
    htmlUrl?: string;
  } | null>(null);
  const [detailsLoaded, setDetailsLoaded] = useState(false);

  const handleSubmit = async (e: React.FormEvent): Promise<boolean> => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (provider === 'bitbucket') {
      setError('Bitbucket is coming soon. Choose GitHub or GitLab.');
      return false;
    }

    const repoType = detectRepositoryType(url);
    if (repoType === 'unknown') {
      setError('URL must be from GitHub (github.com) or GitLab (gitlab.com or other GitLab instances)');
      return false;
    }

    const validation = repoType === 'github' ? validateGitHubUrl(url) : validateGitLabUrl(url);
    if (!validation.isValid) {
      setError(validation.error || `Invalid ${repoType === 'github' ? 'GitHub' : 'GitLab'} URL`);
      return false;
    }

    const repoInfo = repoType === 'github' ? parseGitHubUrl(url) : parseGitLabUrl(url);
    if (!repoInfo) {
      setError(`Failed to parse ${repoType === 'github' ? 'GitHub' : 'GitLab'} URL`);
      return false;
    }

    const repoInfoWithBranch = { ...repoInfo, branch };

    setIsLoading(true);
    let workflowFiles: WorkflowFile[] = [];
    let fetchError: string | null = null;
    const repoDisplayName = `${repoInfo.owner}/${repoInfo.repo}`;

    try {
      workflowFiles = repoType === 'github'
        ? await fetchWorkflowFiles(repoInfoWithBranch as ReturnType<typeof parseGitHubUrl>, githubToken || undefined)
        : await fetchGitLabCIFiles(repoInfoWithBranch as ReturnType<typeof parseGitLabUrl>);
    } catch (err) {
      fetchError = err instanceof Error ? err.message : `Failed to extract ${repoType === 'github' ? 'workflow' : 'CI'} files`;
    } finally {
      setIsLoading(false);
    }

    if (fetchError) {
      setError(fetchError);
      return false;
    }

    if (workflowFiles.length === 0) {
      const fileType = repoType === 'github' ? 'workflow files' : 'GitLab CI files';
      setError(`No ${fileType} found in the repository`);
      return false;
    }

    const filteredFiles = selectAll ? workflowFiles : workflowFiles.filter((file) => selectedPaths.includes(file.filePath || file.name));

    if (!filteredFiles.length) {
      setError('Select at least one file to scan');
      return false;
    }

    onFilesExtracted(filteredFiles);
    const fileType = repoType === 'github' ? 'workflow' : 'CI';
    let successMessage = `Successfully extracted ${workflowFiles.length} ${fileType} file${workflowFiles.length !== 1 ? 's' : ''} from ${repoDisplayName}`;
    if (repoType === 'github') {
      successMessage += `. Check browser console for detailed fetching logs`;
    }

    setSuccess(successMessage);
    setUrl('');
    setGithubToken('');
    setShowTokenInput(false);
    setShowRepoModal(false);
    return true;
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newUrl = e.target.value;
    const newType = newUrl ? detectRepositoryType(newUrl) : 'unknown';
    const currentType = url ? detectRepositoryType(url) : 'unknown';
    
    setUrl(newUrl);
    setError(null);
    setSuccess(null);
    setDetailsLoaded(false);
    
    if (currentType === 'github' && newType !== 'github') {
      setGithubToken('');
      setShowTokenInput(false);
    }
  };

  const timeAgo = (isoDate?: string) => {
    if (!isoDate) return '';
    const then = new Date(isoDate).getTime();
    const now = Date.now();
    const diff = Math.max(0, now - then);
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'just now';
  };

  const orderBranches = (primary: string | undefined, names: string[]) => {
    if (!names.length) return names;
    const seen = new Set<string>();
    const ordered: string[] = [];
    if (primary && names.includes(primary)) {
      ordered.push(primary);
      seen.add(primary);
    }
    for (const n of names) {
      if (!seen.has(n)) ordered.push(n);
    }
    return ordered;
  };

  const fetchGitHubDetails = async (branchOverride?: string) => {
    const repoInfo = parseGitHubUrl(url);
    if (!repoInfo) return;
    const repoMetaUrl = `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}`;
    const headers: HeadersInit = {
      Accept: 'application/vnd.github+json',
    };
    if (githubToken) headers.Authorization = `Bearer ${githubToken}`;

    let defaultBranch = repoInfo.branch;
    const metaResp = await fetch(repoMetaUrl, { headers });
    if (metaResp.ok) {
      const metaJson: any = await metaResp.json();
      defaultBranch = metaJson?.default_branch || defaultBranch;
    }

    let targetBranch = branchOverride || branch || defaultBranch || 'main';
    if (defaultBranch && targetBranch === 'main' && defaultBranch !== 'main') {
      targetBranch = defaultBranch;
    }
    let resolvedBranch = targetBranch;

    const branchesUrl = `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/branches?per_page=100`;
    const branchResp = await fetch(branchesUrl, { headers });
    if (branchResp.ok) {
      const branchJson: Array<{ name: string }> = await branchResp.json();
      const names = branchJson.map((b) => b.name);
      const ordered = orderBranches(defaultBranch || targetBranch, names);
      const finalList = ordered.length ? ordered : ['main'];
      setBranches(finalList);

      const preferred = targetBranch || defaultBranch;
      resolvedBranch = preferred && finalList.includes(preferred)
        ? preferred
        : (finalList[0] || 'main');
      setBranch(resolvedBranch);
    }

    const commitUrl = `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/commits/${resolvedBranch}`;
    const commitResp = await fetch(commitUrl, { headers });
    if (commitResp.ok) {
      const commitJson: any = await commitResp.json();
      setLatestCommit({
        author: commitJson?.commit?.author?.name || commitJson?.author?.login,
        message: commitJson?.commit?.message,
        avatarUrl: commitJson?.author?.avatar_url,
        committedDate: commitJson?.commit?.author?.date,
        htmlUrl: commitJson?.html_url,
      });
    }

    const filesUrl = `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/contents/.github/workflows?ref=${resolvedBranch}`;
    const filesResp = await fetch(filesUrl, { headers });
    if (filesResp.ok) {
      const filesJson: Array<{ name: string; path: string; type: string }> = await filesResp.json();
      const yamlPaths = filesJson
        .filter((f) => f.type === 'file' && (f.name.endsWith('.yml') || f.name.endsWith('.yaml')))
        .map((f) => f.path);
      setFilesPreview(yamlPaths);
      setSelectedPaths(yamlPaths);
      setSelectAll(true);
    } else {
      setFilesPreview([]);
      setSelectedPaths([]);
      setSelectAll(false);
    }
  };

  const fetchGitLabDetails = async (branchOverride?: string) => {
    const repoInfo = parseGitLabUrl(url);
    if (!repoInfo) return;
    const targetBranch = branchOverride || branch || repoInfo.branch || 'main';
    let resolvedBranch = targetBranch;
    const projectPath = encodeURIComponent(`${repoInfo.owner}/${repoInfo.repo}`);

    const branchesUrl = `https://${repoInfo.host}/api/v4/projects/${projectPath}/repository/branches`;
    const branchResp = await fetch(branchesUrl);
    if (branchResp.ok) {
      const branchJson: Array<{ name: string }> = await branchResp.json();
      const names = branchJson.map((b) => b.name);
      const ordered = orderBranches(repoInfo.branch || targetBranch, names);
      const finalList = ordered.length ? ordered : ['main'];
      setBranches(finalList);

      const preferred = targetBranch || repoInfo.branch;
      resolvedBranch = preferred && finalList.includes(preferred)
        ? preferred
        : (finalList[0] || 'main');
      setBranch(resolvedBranch);
    }

    const commitsUrl = `https://${repoInfo.host}/api/v4/projects/${projectPath}/repository/commits?ref_name=${resolvedBranch}&per_page=1`;
    const commitResp = await fetch(commitsUrl);
    if (commitResp.ok) {
      const commitsJson: Array<any> = await commitResp.json();
      const head = commitsJson[0];
      if (head) {
        setLatestCommit({
          author: head.author_name,
          message: head.title,
          avatarUrl: undefined,
          committedDate: head.created_at,
          htmlUrl: head.web_url,
        });
      }
    }

    const treeUrl = `https://${repoInfo.host}/api/v4/projects/${projectPath}/repository/tree?ref=${resolvedBranch}&recursive=true&per_page=200`;
    const treeResp = await fetch(treeUrl);
    if (treeResp.ok) {
      const files: Array<{ path: string; type: string; name: string }> = await treeResp.json();
      const ciFiles = files
        .filter((file) =>
          file.type === 'blob' && (
            file.name === '.gitlab-ci.yml' ||
            file.path === '.gitlab-ci.yml' ||
            file.name === 'gitlab-ci.yml' ||
            file.path === 'gitlab-ci.yml' ||
            file.name === '.gitlab-ci.yaml' ||
            file.path === '.gitlab-ci.yaml' ||
            file.name === 'gitlab-ci.yaml' ||
            file.path === 'gitlab-ci.yaml' ||
            file.name.endsWith('.gitlab-ci.yml') ||
            file.name.endsWith('.gitlab-ci.yaml') ||
            file.path.includes('/.gitlab-ci/') ||
            file.path.includes('/.gitlab/ci/') ||
            (file.path.includes('ci/') && (file.name.endsWith('.yml') || file.name.endsWith('.yaml')))
          )
        )
        .map((f) => f.path);

      setFilesPreview(ciFiles);
      setSelectedPaths(ciFiles);
      setSelectAll(ciFiles.length > 0);
    } else {
      setFilesPreview([]);
      setSelectedPaths([]);
      setSelectAll(false);
    }
  };

  const loadRepoDetails = async (branchOverride?: string) => {
    setDetailsLoading(true);
    setLatestCommit(null);
    setDetailsLoaded(false);
    try {
      if (detectedType === 'github') {
        await fetchGitHubDetails(branchOverride);
      } else if (detectedType === 'gitlab') {
        await fetchGitLabDetails(branchOverride);
      }
      setDetailsLoaded(true);
      setModalStep(2);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to fetch repository details');
    } finally {
      setDetailsLoading(false);
    }
  };

  const detectedType = url ? detectRepositoryType(url) : provider !== 'bitbucket' ? provider : 'unknown';

  const placeholderByProvider = provider === 'github'
    ? 'https://github.com/owner/repo'
    : provider === 'gitlab'
      ? 'https://gitlab.com/group/project'
      : 'https://bitbucket.org/workspace/repo (coming soon)';

  const githubColorIcon = (
    <svg viewBox="0 0 32 32" className="w-7 h-7" role="img" aria-hidden="true">
      <defs>
        <linearGradient id="gh-grad" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#6a6f78" />
          <stop offset="100%" stopColor="#0d1117" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="16" fill="url(#gh-grad)" />
      <path
        fill="#fff"
        d="M16 7.2c-4.97 0-9 4.07-9 9.09 0 4.02 2.53 7.43 6.04 8.64.44.08.6-.19.6-.42 0-.21-.01-.9-.01-1.63-2.2.48-2.66-.96-2.66-.96-.4-1.05-.99-1.33-.99-1.33-.81-.56.06-.55.06-.55.9.06 1.38.93 1.38.93.8 1.39 2.1.99 2.62.76.08-.6.31-.99.56-1.22-1.76-.2-3.62-.89-3.62-3.95 0-.87.31-1.58.83-2.14-.08-.2-.36-1.01.08-2.1 0 0 .67-.22 2.2.82.64-.18 1.33-.27 2.02-.27.69 0 1.39.09 2.03.27 1.53-1.04 2.2-.82 2.2-.82.44 1.09.16 1.9.08 2.1.52.56.83 1.27.83 2.14 0 3.07-1.86 3.75-3.63 3.95.32.29.61.86.61 1.74 0 1.26-.01 2.27-.01 2.58 0 .23.16.5.6.42 3.51-1.21 6.04-4.62 6.04-8.64C25 11.27 20.97 7.2 16 7.2Z"
      />
    </svg>
  );

  const gitlabColorIcon = (
    <svg viewBox="0 0 32 32" className="w-7 h-7" role="img" aria-hidden="true">
      <defs>
        <linearGradient id="gl-grad" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#fc6d26" />
          <stop offset="50%" stopColor="#e24329" />
          <stop offset="100%" stopColor="#fca326" />
        </linearGradient>
      </defs>
      <path
        fill="url(#gl-grad)"
        d="M30.4 18.39 28.1 11.3c-.1-.28-.37-.47-.67-.47s-.57.19-.67.47l-2.03 6.22H7.27L5.24 11.3c-.1-.28-.37-.47-.67-.47s-.57.19-.67.47l-2.3 7.09a1 1 0 0 0 .38 1.12l13.33 9.59 13.3-9.58c.33-.24.48-.67.34-1.13Z"
      />
    </svg>
  );

  const bitbucketColorIcon = (
    <svg viewBox="0 0 32 32" className="w-7 h-7" role="img" aria-hidden="true">
      <defs>
        <linearGradient id="bb-grad" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#2684ff" />
          <stop offset="100%" stopColor="#0052cc" />
        </linearGradient>
      </defs>
      <path fill="url(#bb-grad)" d="M3.18 5.52c-.14-.85.49-1.52 1.28-1.52h23.08c.62 0 1.16.46 1.27 1.07l2.01 12.38c.14.86-.49 1.53-1.28 1.53h-9.3l-.73 4.42c-.1.61-.63 1.08-1.26 1.08h-7c-.63 0-1.16-.47-1.27-1.08l-3.8-23.86Zm12.99 14.7 1.06-6.39h-5.1l1.05 6.39h2.99Z" />
    </svg>
  );

  const providerItems: Array<{ id: 'github' | 'gitlab' | 'bitbucket'; label: string; desc: string; icon: React.ReactNode; disabled?: boolean }> = [
    {
      id: 'github',
      label: 'GitHub',
      desc: 'Actions workflows and reusable workflows',
      icon: githubColorIcon
    },
    {
      id: 'gitlab',
      label: 'GitLab',
      desc: 'GitLab CI/CD pipelines',
      icon: gitlabColorIcon
    },
    {
      id: 'bitbucket',
      label: 'Bitbucket (Coming Soon)',
      desc: 'Bitbucket pipelines',
      icon: bitbucketColorIcon,
      disabled: true,
    },
  ];

  const startScan = async () => {
    await handleSubmit({ preventDefault: () => {} } as React.FormEvent);
  };

  return (
    <div className="space-y-4 text-gray-900 dark:text-slate-100 transition-colors duration-300">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-slate-400 transition-colors duration-300">Step 1 of 2</p>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white transition-colors duration-300">Choose a repository source</h3>
          </div>
        </div>

        <div className="bg-gray-100 dark:bg-slate-900/80 border border-gray-300 dark:border-white/10 rounded-xl overflow-hidden transition-colors duration-300">
          {providerItems.map((item, idx) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setProvider(item.id)}
              disabled={item.disabled}
              className={`group w-full flex items-center justify-between px-4 sm:px-5 py-4 border-b border-gray-200 dark:border-white/5 text-left border rounded-none first:rounded-t-xl last:rounded-b-xl ${
                provider === item.id
                  ? 'bg-teal-50 dark:bg-white/10 ring-1 ring-teal-300/40 border-teal-300/50'
                  : 'border-transparent hover:bg-gray-50 dark:hover:bg-white/5 focus-visible:bg-gray-50 dark:focus-visible:bg-white/5 hover:border-gray-300 dark:hover:border-white/10 focus-visible:border-gray-400 dark:focus-visible:border-white/15'
              } ${item.disabled ? 'opacity-60 cursor-not-allowed' : ''} ${idx === providerItems.length - 1 ? 'border-b-0' : ''} transition-colors duration-300`}
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-gray-200 dark:bg-white/5 flex items-center justify-center text-gray-900 dark:text-white transition-colors duration-300">
                  {item.icon}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white transition-colors duration-300">{item.label}</p>
                  <p className="text-xs text-gray-600 dark:text-slate-400 transition-colors duration-300">{item.desc}</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-500 dark:text-slate-400 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 group-focus-visible:opacity-100 group-focus-visible:translate-x-0 transition-all duration-150" />
            </button>
          ))}
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => {
              if (provider === 'bitbucket') {
                setError('Bitbucket is coming soon. Choose GitHub or GitLab.');
                return;
              }
              setError(null);
              setSuccess(null);
              if (provider === 'github' && !url) {
                setUrl('https://github.com/');
              }
              setShowRepoModal(true);
              setModalStep(1);
              setDetailsLoaded(false);
              setBranches(['main']);
              setFilesPreview([]);
              setSelectedPaths([]);
              setLatestCommit(null);
              setSelectAll(true);
            }}
            className="group inline-flex items-center px-5 py-3 bg-gradient-to-r from-emerald-300 to-cyan-400 text-slate-900 font-semibold rounded-lg hover:from-emerald-200 hover:to-cyan-300 transition-colors"
          >
            Continue
            <ArrowRight className="w-4 h-4 ml-2 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 group-focus-visible:opacity-100 group-focus-visible:translate-x-0 transition-all duration-150" />
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start space-x-3 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
          <AlertCircle className="w-5 h-5 text-red-400 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-red-100">{error}</p>
          </div>
        </div>
      )}

      {success && (
        <div className="flex items-start space-x-3 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg transition-colors duration-300">
          <CheckCircle className="w-5 h-5 text-emerald-300 mt-0.5 flex-shrink-0 transition-colors duration-300" />
          <div className="flex-1">
            <h4 className="text-sm font-medium text-emerald-100 transition-colors duration-300">Success!</h4>
            <p className="text-sm text-emerald-200 mt-1 transition-colors duration-300">{success}</p>
          </div>
        </div>
      )}

      {showRepoModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-0 overflow-y-auto bg-black/70 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={() => !isLoading && setShowRepoModal(false)}></div>
          <div className="relative bg-white dark:bg-slate-900 border-0 sm:border sm:border-gray-300 sm:dark:border-slate-800 sm:rounded-xl shadow-2xl w-full h-full sm:h-auto sm:max-w-3xl sm:my-8 p-6 sm:p-8 space-y-4 transition-colors duration-300 overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-slate-400 transition-colors duration-300">Step {modalStep} of 2</p>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white transition-colors duration-300">{provider === 'gitlab' ? 'GitLab' : 'GitHub'} Application</h3>
                <p className="text-xs text-gray-600 dark:text-slate-400 transition-colors duration-300">Provide a link to your {provider === 'gitlab' ? 'GitLab' : 'GitHub'} repository</p>
              </div>
              <button
                type="button"
                onClick={() => !isLoading && setShowRepoModal(false)}
                className="text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white transition-colors duration-300 p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg"
              >
                ✕
              </button>
            </div>

            {modalStep === 1 && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2 space-y-2">
                    <label className="block text-xs font-medium text-gray-700 dark:text-slate-200 transition-colors duration-300">Repository URL</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        {detectedType === 'github' ? (
                          <Github className="h-5 w-5 text-teal-300" />
                        ) : detectedType === 'gitlab' ? (
                          <Gitlab className="h-5 w-5 text-orange-400" />
                        ) : (
                          <GitBranch className="h-5 w-5 text-slate-500" />
                        )}
                      </div>
                      <input
                        type="url"
                        value={url}
                        onChange={handleUrlChange}
                        placeholder={placeholderByProvider}
                        className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-teal-300 focus:border-teal-300 text-sm bg-white dark:bg-slate-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 transition-colors duration-300"
                        disabled={isLoading}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-gray-700 dark:text-slate-200 transition-colors duration-300">Visibility</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => { setVisibility('public'); setShowTokenInput(false); setGithubToken(''); }}
                        className={`px-3 py-2 rounded-lg border transition-colors duration-300 ${visibility === 'public' ? 'border-teal-300 text-gray-900 dark:text-white bg-teal-50 dark:bg-white/5' : 'border-gray-300 dark:border-slate-700 text-gray-700 dark:text-slate-300 bg-white dark:bg-slate-900'}`}
                      >
                        Public
                      </button>
                      <button
                        type="button"
                        onClick={() => { setVisibility('private'); setShowTokenInput(true); }}
                        className={`px-3 py-2 rounded-lg border transition-colors duration-300 ${visibility === 'private' ? 'border-teal-300 text-gray-900 dark:text-white bg-teal-50 dark:bg-white/5' : 'border-gray-300 dark:border-slate-700 text-gray-700 dark:text-slate-300 bg-white dark:bg-slate-900'}`}
                      >
                        Private
                      </button>
                    </div>
                  </div>
                </div>

                {detectedType === 'github' && (
                  <div className="border border-gray-300 dark:border-slate-800 rounded-lg overflow-hidden transition-colors duration-300">
                    <button
                      type="button"
                      onClick={() => setShowTokenInput(!showTokenInput)}
                      className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-slate-900 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors duration-200"
                    >
                      <div className="flex items-center space-x-2">
                        <Key className="w-4 h-4 text-gray-500 dark:text-slate-400 transition-colors duration-300" />
                        <span className="text-sm font-medium text-gray-700 dark:text-slate-200 transition-colors duration-300">
                          GitHub Token (Optional)
                        </span>
                        {githubToken && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/20 text-emerald-200">
                            Token Set
                          </span>
                        )}
                      </div>
                      {showTokenInput ? (
                        <ChevronUp className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      )}
                    </button>
                    
                    {showTokenInput && (
                      <div className="px-4 py-3 space-y-3 bg-gray-50 dark:bg-slate-900/80 transition-colors duration-300">
                        <div className="flex items-start space-x-2 p-2.5 bg-teal-500/10 border border-teal-300/30 rounded-lg">
                          <Shield className="w-4 h-4 text-teal-300 mt-0.5 flex-shrink-0" />
                          <div className="text-xs text-teal-100 space-y-1">
                            <p className="font-medium">🔒 Your token stays private</p>
                            <p>Client-side only; never stored or sent.</p>
                          </div>
                        </div>
                        
                        <div>
                          <label htmlFor="github-token" className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-1 transition-colors duration-300">
                            Personal Access Token
                          </label>
                          <div className="relative">
                            <input
                              type={showToken ? 'text' : 'password'}
                              id="github-token"
                              value={githubToken}
                              onChange={(e) => setGithubToken(e.target.value)}
                              placeholder="ghp_xxxxxxxxxxxx or github_pat_xxxxxxxxxxxx"
                              className="block w-full pl-3 pr-10 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-teal-300 focus:border-teal-300 text-sm bg-white dark:bg-slate-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 transition-colors duration-300"
                              disabled={isLoading}
                            />
                            <button
                              type="button"
                              onClick={() => setShowToken(!showToken)}
                              className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200 transition-colors duration-300"
                            >
                              {showToken ? (
                                <EyeOff className="w-4 h-4" />
                              ) : (
                                <Eye className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </div>
                        
                        <div className="text-xs text-gray-600 dark:text-slate-400 space-y-1 transition-colors duration-300">
                          <p className="font-semibold">When to use:</p>
                          <p>Private repos or to avoid API rate limits.</p>
                          <p className="pt-1">
                            <a 
                              href="https://github.com/settings/tokens/new?scopes=repo&description=Flowlyt%20Workflow%20Analyzer" 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-teal-600 dark:text-teal-200 hover:text-teal-800 dark:hover:text-white inline-flex items-center transition-colors duration-300"
                            >
                              Create a token with <span className="bg-gray-200 dark:bg-slate-800 px-1 rounded ml-1 mr-1 transition-colors duration-300">repo</span> scope
                              <ExternalLink className="w-3 h-3 ml-1" />
                            </a>
                          </p>
                        </div>
                        
                        {githubToken && (
                          <button
                            type="button"
                            onClick={() => setGithubToken('')}
                            className="text-xs text-red-400 hover:text-red-300"
                          >
                            Clear token
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => !isLoading && setShowRepoModal(false)}
                    className="text-sm text-gray-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-white transition-colors duration-300"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={loadRepoDetails}
                    disabled={!url.trim() || detectedType === 'unknown' || detailsLoading}
                    className="inline-flex items-center px-5 py-2.5 bg-gradient-to-r from-emerald-300 to-cyan-400 text-slate-900 font-semibold rounded-lg hover:from-emerald-200 hover:to-cyan-300 disabled:opacity-50"
                  >
                    {detailsLoading ? 'Fetching…' : 'Fetch & continue'}
                  </button>
                </div>
              </>
            )}

            {modalStep === 2 && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-slate-200 mb-1 transition-colors duration-300">Branch</label>
                    <div className="relative">
                      <select
                        value={branch}
                        onChange={(e) => {
                          setBranch(e.target.value);
                          setDetailsLoaded(false);
                          loadRepoDetails(e.target.value);
                        }}
                        className="w-full appearance-none pl-3 pr-8 py-2 bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-lg text-sm text-gray-900 dark:text-slate-100 focus:ring-2 focus:ring-teal-300 focus:border-teal-300 h-[52px] transition-colors duration-300"
                      >
                        {branches.map((b) => (
                          <option key={b} value={b}>{b}</option>
                        ))}
                      </select>
                      <ChevronDown className="w-4 h-4 text-gray-500 dark:text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none transition-colors duration-300" />
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-gray-700 dark:text-slate-200 mb-1 transition-colors duration-300">Latest commit</label>
                    <div className="flex items-center gap-2.5 bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-800 rounded-lg px-3 h-[52px] transition-colors duration-300">
                      {latestCommit?.avatarUrl ? (
                        <img
                          src={latestCommit.avatarUrl}
                          alt={latestCommit.author || 'avatar'}
                          className="w-8 h-8 rounded-full border border-gray-300 dark:border-slate-700 object-cover flex-shrink-0 transition-colors duration-300"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                            setLatestCommit((prev) => (prev ? { ...prev, avatarUrl: undefined } : prev));
                          }}
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-300 to-cyan-400 text-slate-900 text-xs font-semibold flex items-center justify-center flex-shrink-0">
                          {latestCommit?.author ? latestCommit.author[0]?.toUpperCase() : '?'}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-900 dark:text-slate-200 font-medium truncate transition-colors duration-300">{latestCommit?.author || 'Pending commit fetch'}</p>
                        <p className="text-xs text-gray-600 dark:text-slate-400 truncate leading-tight transition-colors duration-300">{latestCommit?.message || 'Load repo details to see latest commit'}</p>
                      </div>
                      <div className="text-xs text-gray-600 dark:text-slate-400 whitespace-nowrap flex-shrink-0 transition-colors duration-300">{timeAgo(latestCommit?.committedDate)}</div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-600 dark:text-slate-400 py-2 border-t border-gray-300 dark:border-slate-800 transition-colors duration-300">
                  <span className="font-medium">Latest commit & workflow files</span>
                  <button
                    type="button"
                    onClick={loadRepoDetails}
                    disabled={!url.trim() || detectedType === 'unknown' || detailsLoading}
                    className="inline-flex items-center gap-1.5 text-xs text-teal-600 dark:text-teal-200 hover:text-teal-800 dark:hover:text-white disabled:opacity-50 transition-colors"
                  >
                    {detailsLoading ? (
                      <>
                        <div className="h-3.5 w-3.5 border-2 border-teal-300 border-t-transparent rounded-full animate-spin" aria-label="Loading" />
                        Fetching…
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-3.5 h-3.5" />
                        Refresh
                      </>
                    )}
                  </button>
                </div>

                <div className="bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-800 rounded-lg p-3 space-y-3 transition-colors duration-300">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-sm text-gray-900 dark:text-slate-200 font-medium cursor-pointer transition-colors duration-300">
                      <input
                        type="checkbox"
                        className="rounded border-gray-400 dark:border-slate-600 cursor-pointer transition-colors duration-300"
                        checked={selectAll}
                        onChange={() => {
                          if (selectAll) {
                            setSelectAll(false);
                            setSelectedPaths([]);
                          } else {
                            setSelectAll(true);
                            setSelectedPaths(filesPreview);
                          }
                        }}
                      />
                      Select all files
                    </label>
                    <div className="text-xs text-gray-600 dark:text-slate-400 flex items-center gap-1.5 transition-colors duration-300">
                      <GitCommit className="w-3.5 h-3.5" />
                      <span>Preview only</span>
                    </div>
                  </div>
                  <div className="space-y-1.5 text-sm text-gray-700 dark:text-slate-300 transition-colors duration-300">
                    {filesPreview.length === 0 && (
                      <p className="text-xs text-gray-500 dark:text-slate-500 transition-colors duration-300">Fetch repo details to list workflow files.</p>
                    )}
                    {filesPreview.map((file) => (
                      <label key={file} className="flex items-center gap-2 cursor-pointer hover:text-gray-900 dark:hover:text-slate-100 transition-colors">
                        <input
                          type="checkbox"
                          className="rounded border-gray-400 dark:border-slate-600 cursor-pointer flex-shrink-0 transition-colors duration-300"
                          checked={selectAll || selectedPaths.includes(file)}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            if (checked) {
                              const next = Array.from(new Set([...selectedPaths, file]));
                              setSelectedPaths(next);
                              setSelectAll(next.length === filesPreview.length);
                            } else {
                              const next = selectedPaths.filter((p) => p !== file);
                              setSelectedPaths(next);
                              setSelectAll(false);
                            }
                          }}
                        />
                        <Folder className="w-4 h-4 text-gray-500 dark:text-slate-500 flex-shrink-0 transition-colors duration-300" />
                        <span className="truncate flex-1">{file}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setModalStep(1)}
                    className="text-sm text-gray-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-white transition-colors duration-300"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={startScan}
                    disabled={isLoading || !url.trim() || detectedType === 'unknown' || !detailsLoaded}
                    className="inline-flex items-center px-5 py-2.5 bg-gradient-to-r from-emerald-300 to-cyan-400 text-slate-900 font-semibold rounded-lg hover:from-emerald-200 hover:to-cyan-300 disabled:opacity-50"
                  >
                    {isLoading ? 'Extracting...' : 'Start Scan'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
