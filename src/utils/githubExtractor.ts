import { WorkflowFile, GitHubFile } from '../types/workflow';

export interface GitHubRepoInfo {
  owner: string;
  repo: string;
  branch?: string;
}

export function parseGitHubUrl(url: string): GitHubRepoInfo | null {
  try {
    // Remove trailing slashes and .git
    const cleanUrl = url.replace(/\/+$/, '').replace(/\.git$/, '');
    
    // Handle different GitHub URL formats
    const patterns = [
      // https://github.com/owner/repo
      /^https?:\/\/github\.com\/([^/]+)\/([^/]+)$/,
      // https://github.com/owner/repo/tree/branch
      /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/tree\/(.+)$/,
      // git@github.com:owner/repo.git
      /^git@github\.com:([^/]+)\/(.+)$/
    ];

    for (const pattern of patterns) {
      const match = cleanUrl.match(pattern);
      if (match) {
        return {
          owner: match[1],
          repo: match[2],
          branch: match[3] || undefined
        };
      }
    }

    return null;
  } catch {
    return null;
  }
}

export async function fetchWorkflowFiles(repoInfo: GitHubRepoInfo): Promise<WorkflowFile[]> {
  const { owner, repo, branch = 'main' } = repoInfo;
  const workflowFiles: WorkflowFile[] = [];

  try {
    // First, try to get the workflows directory
    const workflowsUrl = `https://api.github.com/repos/${owner}/${repo}/contents/.github/workflows?ref=${branch}`;
    
    let response = await fetch(workflowsUrl);
    
    // If main branch doesn't exist, try master
    if (!response.ok && branch === 'main') {
      const masterUrl = `https://api.github.com/repos/${owner}/${repo}/contents/.github/workflows?ref=master`;
      response = await fetch(masterUrl);
    }

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Repository not found or no workflows directory exists');
      } else if (response.status === 403) {
        throw new Error('Repository is private or rate limit exceeded');
      } else {
        throw new Error(`Failed to fetch repository contents: ${response.statusText}`);
      }
    }

    const files: GitHubFile[] = await response.json();
    
    // Filter for YAML files
    const yamlFiles = files.filter(file => 
      file.type === 'file' && 
      (file.name.endsWith('.yml') || file.name.endsWith('.yaml'))
    );

    if (yamlFiles.length === 0) {
      throw new Error('No workflow files found in .github/workflows directory');
    }

    // Fetch content for each workflow file
    for (const file of yamlFiles) {
      try {
        const contentResponse = await fetch(file.download_url);
        if (contentResponse.ok) {
          const content = await contentResponse.text();
          
          workflowFiles.push({
            id: `github-${owner}-${repo}-${file.name}-${Date.now()}`,
            name: file.name,
            content,
            source: 'github',
            repoUrl: `https://github.com/${owner}/${repo}`,
            filePath: file.path
          });
        }
      } catch (error) {
        console.warn(`Failed to fetch content for ${file.name}:`, error);
      }
    }

    if (workflowFiles.length === 0) {
      throw new Error('Failed to fetch content for any workflow files');
    }

    return workflowFiles;
  } catch (error) {
    throw error instanceof Error ? error : new Error('Unknown error occurred while fetching workflows');
  }
}

export function validateGitHubUrl(url: string): { isValid: boolean; error?: string } {
  if (!url.trim()) {
    return { isValid: false, error: 'URL is required' };
  }

  const repoInfo = parseGitHubUrl(url);
  if (!repoInfo) {
    return { 
      isValid: false, 
      error: 'Invalid GitHub URL format. Use: https://github.com/owner/repo' 
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