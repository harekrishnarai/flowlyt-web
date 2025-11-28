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
      /^https?:\/\/github\.com\/([^\/]+)\/([^\/]+)$/,
      // https://github.com/owner/repo/tree/branch
      /^https?:\/\/github\.com\/([^\/]+)\/([^\/]+)\/tree\/(.+)$/,
      // git@github.com:owner/repo.git
      /^git@github\.com:([^\/]+)\/(.+)$/
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
  } catch (error) {
    return null;
  }
}

// Helper function to build headers for GitHub API requests
function buildGitHubHeaders(token?: string): HeadersInit {
  const headers: HeadersInit = {
    'Accept': 'application/vnd.github.v3+json',
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  return headers;
}

export async function fetchWorkflowFiles(repoInfo: GitHubRepoInfo, token?: string): Promise<WorkflowFile[]> {
  const { owner, repo, branch = 'main' } = repoInfo;
  const workflowFiles: WorkflowFile[] = [];

  // Build headers - include Authorization if token is provided
  const headers = buildGitHubHeaders(token);
  
  if (token) {
    console.log('Using authenticated requests for GitHub API');
  }

  try {
    // First, try to get the workflows directory
    const workflowsUrl = `https://api.github.com/repos/${owner}/${repo}/contents/.github/workflows?ref=${branch}`;
    
    let response = await fetch(workflowsUrl, { headers });
    
    // If main branch doesn't exist, try master
    if (!response.ok && branch === 'main') {
      const masterUrl = `https://api.github.com/repos/${owner}/${repo}/contents/.github/workflows?ref=master`;
      response = await fetch(masterUrl, { headers });
    }

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Repository not found or no workflows directory exists. If this is a private repository, please provide a GitHub token.');
      } else if (response.status === 403) {
        const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');
        if (rateLimitRemaining === '0') {
          throw new Error('GitHub API rate limit exceeded. Please provide a GitHub token to increase your rate limit (5,000 requests/hour vs 60/hour for unauthenticated).');
        }
        throw new Error('Repository is private or access denied. Please provide a GitHub token with repo access.');
      } else if (response.status === 401) {
        throw new Error('Invalid GitHub token. Please check your token and try again.');
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

    console.log(`Found ${yamlFiles.length} YAML workflow files`);

    if (yamlFiles.length === 0) {
      throw new Error('No workflow files found in .github/workflows directory');
    }

    // Fetch content for each workflow file with limited concurrency
    console.log(`Found ${yamlFiles.length} YAML workflow files to fetch`);
    
    const fetchWithDelay = async (file: GitHubFile, index: number) => {
      // Add a small delay between requests to be respectful to the API
      if (index > 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      try {
        console.log(`Fetching file ${index + 1}/${yamlFiles.length}: ${file.name}`);
        // Use token for raw content requests if available (for private repos)
        const contentHeaders = buildGitHubHeaders(token);
        const contentResponse = await fetch(file.download_url, { headers: contentHeaders });
        if (contentResponse.ok) {
          const content = await contentResponse.text();
          console.log(`Successfully fetched ${file.name} (${content.length} characters)`);
          
          return {
            id: `github-${owner}-${repo}-${file.name}-${Date.now()}`,
            name: file.name,
            content,
            source: 'github' as const,
            repoUrl: `https://github.com/${owner}/${repo}`,
            filePath: file.path
          } as WorkflowFile;
        } else {
          console.error(`Failed to fetch ${file.name}: ${contentResponse.status} ${contentResponse.statusText}`);
          return null;
        }
      } catch (error) {
        console.error(`Error fetching content for ${file.name}:`, error);
        return null;
      }
    };

    const fetchPromises = yamlFiles.map(fetchWithDelay);

    // Wait for all fetch operations to complete
    const fetchResults = await Promise.all(fetchPromises);
    const successfulFiles = fetchResults.filter((result): result is WorkflowFile => result !== null);
    const failedCount = yamlFiles.length - successfulFiles.length;
    
    console.log(`Successfully fetched ${successfulFiles.length} out of ${yamlFiles.length} workflow files`);
    if (failedCount > 0) {
      console.warn(`Failed to fetch ${failedCount} workflow files`);
    }
    
    successfulFiles.forEach(file => workflowFiles.push(file));

    if (workflowFiles.length === 0) {
      throw new Error(`Failed to fetch content for any of the ${yamlFiles.length} workflow files found`);
    }

    if (workflowFiles.length < yamlFiles.length) {
      console.warn(`Only fetched ${workflowFiles.length} out of ${yamlFiles.length} workflow files. Some files may have failed to load.`);
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