import { WorkflowFile, GitLabFile } from '../types/workflow';

export interface GitLabRepoInfo {
  host: string;
  owner: string;
  repo: string;
  branch?: string;
}

export function parseGitLabUrl(url: string): GitLabRepoInfo | null {
  try {
    // Remove trailing slashes and .git
    const cleanUrl = url.replace(/\/+$/, '').replace(/\.git$/, '');
    
    // Handle different GitLab URL formats
    const patterns = [
      // https://gitlab.com/owner/repo
      /^https?:\/\/(gitlab\.com)\/([^\/]+)\/([^\/]+)$/,
      // https://gitlab.com/owner/repo/-/tree/branch
      /^https?:\/\/(gitlab\.com)\/([^\/]+)\/([^\/]+)\/-\/tree\/(.+)$/,
      // https://custom-gitlab.com/owner/repo
      /^https?:\/\/([^\/]+)\/([^\/]+)\/([^\/]+)$/,
      // https://custom-gitlab.com/owner/repo/-/tree/branch
      /^https?:\/\/([^\/]+)\/([^\/]+)\/([^\/]+)\/-\/tree\/(.+)$/,
      // git@gitlab.com:owner/repo.git
      /^git@(gitlab\.com):([^\/]+)\/(.+)$/,
      // git@custom-gitlab.com:owner/repo.git
      /^git@([^:]+):([^\/]+)\/(.+)$/
    ];

    for (const pattern of patterns) {
      const match = cleanUrl.match(pattern);
      if (match) {
        return {
          host: match[1],
          owner: match[2],
          repo: match[3],
          branch: match[4] || undefined
        };
      }
    }

    return null;
  } catch (error) {
    return null;
  }
}

export async function fetchGitLabCIFiles(repoInfo: GitLabRepoInfo): Promise<WorkflowFile[]> {
  const { host, owner, repo, branch = 'main' } = repoInfo;
  const workflowFiles: WorkflowFile[] = [];

  try {
    // Encode the project path for GitLab API
    const projectPath = encodeURIComponent(`${owner}/${repo}`);
    
    // GitLab API endpoint for getting repository tree
    const apiUrl = `https://${host}/api/v4/projects/${projectPath}/repository/tree?ref=${branch}&recursive=true`;
    
    let response = await fetch(apiUrl);
    
    // If main branch doesn't exist, try master
    if (!response.ok && branch === 'main') {
      const masterUrl = `https://${host}/api/v4/projects/${projectPath}/repository/tree?ref=master&recursive=true`;
      response = await fetch(masterUrl);
    }

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Repository not found or is private');
      } else if (response.status === 403) {
        throw new Error('Repository is private or access denied');
      } else {
        throw new Error(`Failed to fetch repository contents: ${response.statusText}`);
      }
    }

    const files: GitLabFile[] = await response.json();
    
    // Filter for GitLab CI files
    const ciFiles = files.filter(file => 
      file.type === 'blob' && 
      (file.name === '.gitlab-ci.yml' || 
       file.path === '.gitlab-ci.yml' ||
       file.name.endsWith('.gitlab-ci.yml') ||
       file.path.includes('/.gitlab-ci/') ||
       (file.path.includes('ci/') && (file.name.endsWith('.yml') || file.name.endsWith('.yaml'))))
    );

    if (ciFiles.length === 0) {
      throw new Error('No GitLab CI files found in the repository');
    }

    // Fetch content for each CI file
    for (const file of ciFiles) {
      try {
        const encodedPath = encodeURIComponent(file.path);
        const fileApiUrl = `https://${host}/api/v4/projects/${projectPath}/repository/files/${encodedPath}/raw?ref=${branch}`;
        
        const contentResponse = await fetch(fileApiUrl);
        if (contentResponse.ok) {
          const content = await contentResponse.text();
          
          workflowFiles.push({
            id: `gitlab-${host}-${owner}-${repo}-${file.name}-${Date.now()}`,
            name: file.name,
            content,
            source: 'gitlab',
            repoUrl: `https://${host}/${owner}/${repo}`,
            filePath: file.path
          });
        }
      } catch (error) {
        console.warn(`Failed to fetch content for ${file.name}:`, error);
      }
    }

    if (workflowFiles.length === 0) {
      throw new Error('Failed to fetch content for any CI files');
    }

    return workflowFiles;
  } catch (error) {
    throw error instanceof Error ? error : new Error('Unknown error occurred while fetching CI files');
  }
}

export function validateGitLabUrl(url: string): { isValid: boolean; error?: string } {
  if (!url.trim()) {
    return { isValid: false, error: 'URL is required' };
  }

  const repoInfo = parseGitLabUrl(url);
  if (!repoInfo) {
    return { 
      isValid: false, 
      error: 'Invalid GitLab URL format. Use: https://gitlab.com/owner/repo' 
    };
  }

  if (!repoInfo.owner || !repoInfo.repo) {
    return { 
      isValid: false, 
      error: 'URL must include both owner and repository name' 
    };
  }

  return { isValid: true };
}

export function detectRepositoryType(url: string): 'github' | 'gitlab' | 'unknown' {
  if (url.includes('github.com')) {
    return 'github';
  }
  if (url.includes('gitlab.com') || url.includes('gitlab')) {
    return 'gitlab';
  }
  return 'unknown';
}