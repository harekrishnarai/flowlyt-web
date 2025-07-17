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
      // https://gitlab.com/path/to/project/-/tree/branch (with branch)
      /^https?:\/\/(gitlab\.com)\/(.+)\/-\/tree\/(.+)$/,
      // https://custom-gitlab.com/path/to/project/-/tree/branch (with branch)
      /^https?:\/\/([^/]+)\/(.+)\/-\/tree\/(.+)$/,
      // https://gitlab.com/path/to/project (without branch)
      /^https?:\/\/(gitlab\.com)\/(.+)$/,
      // https://custom-gitlab.com/path/to/project (without branch)
      /^https?:\/\/([^/]+)\/(.+)$/,
      // git@gitlab.com:path/to/project.git
      /^git@(gitlab\.com):(.+)$/,
      // git@custom-gitlab.com:path/to/project.git
      /^git@([^:]+):(.+)$/
    ];

    for (const pattern of patterns) {
      const match = cleanUrl.match(pattern);
      if (match) {
        const host = match[1];
        const projectPath = match[2];
        const branch = match[3] || undefined;
        
        // For project path like "kalilinux/build-scripts/kali-arm",
        // we need to extract owner and repo. The last segment is the repo name,
        // and everything before it is the owner/group path
        const pathSegments = projectPath.split('/');
        const repo = pathSegments[pathSegments.length - 1];
        const owner = pathSegments.slice(0, -1).join('/');
        
        // Handle case where there's only one segment (just repo name without owner)
        if (pathSegments.length < 2) {
          return null; // Invalid format, need at least owner/repo
        }
        
        return {
          host,
          owner,
          repo,
          branch
        };
      }
    }

    return null;
  } catch (error) {
    console.debug('Error parsing GitLab URL:', error);
    return null;
  }
}

export async function fetchGitLabCIFiles(repoInfo: GitLabRepoInfo): Promise<WorkflowFile[]> {
  const { host, owner, repo, branch = 'main' } = repoInfo;
  const workflowFiles: WorkflowFile[] = [];

  try {
    // Try to fetch GitLab CI files directly using GitLab's raw file URL
    // This works around CORS issues that prevent API access from browsers
    const possibleFiles = [
      '.gitlab-ci.yml',
      'gitlab-ci.yml',
      '.gitlab-ci.yaml', 
      'gitlab-ci.yaml'
    ];
    const possibleBranches = [branch === 'main' ? 'main' : branch, 'master', 'develop'];
    
    let foundFiles = false;
    
    for (const fileName of possibleFiles) {
      for (const branchName of possibleBranches) {
        try {
          // GitLab raw file URL format: https://gitlab.com/owner/repo/-/raw/branch/file
          const rawFileUrl = `https://${host}/${owner}/${repo}/-/raw/${branchName}/${fileName}`;
          
          console.debug(`Attempting to fetch: ${rawFileUrl}`);
          const response = await fetch(rawFileUrl);
          
          if (response.ok) {
            const content = await response.text();
            
            // Verify it's actually a YAML file and not an error page
            if (content.trim() && !content.includes('<!DOCTYPE html>') && !content.includes('<html')) {
              console.debug(`✅ Found CI file: ${fileName} on branch ${branchName}`);
              workflowFiles.push({
                id: `gitlab-${host}-${owner}-${repo}-${fileName}-${Date.now()}`,
                name: fileName,
                content,
                source: 'gitlab',
                repoUrl: `https://${host}/${owner}/${repo}`,
                filePath: fileName
              });
              
              foundFiles = true;
              break; // Found the file, no need to try other branches for this file
            } else {
              console.debug(`❌ ${fileName} on ${branchName}: Response appears to be HTML (error page)`);
            }
          } else {
            console.debug(`❌ ${fileName} on ${branchName}: HTTP ${response.status}`);
          }
        } catch (error) {
          // Continue trying other branches/files
          console.debug(`Failed to fetch ${fileName} from ${branchName}:`, error);
        }
      }
    }
    
    if (!foundFiles) {
      // Fallback: Try the API approach (may work in server environments or with CORS proxy)
      try {
        const projectPath = encodeURIComponent(`${owner}/${repo}`);
        const apiUrl = `https://${host}/api/v4/projects/${projectPath}/repository/tree?ref=${branch}&recursive=true`;
        
        let response = await fetch(apiUrl);
        
        // If main branch doesn't exist, try master
        if (!response.ok && branch === 'main') {
          const masterUrl = `https://${host}/api/v4/projects/${projectPath}/repository/tree?ref=master&recursive=true`;
          response = await fetch(masterUrl);
        }

        if (response.ok) {
          const files: GitLabFile[] = await response.json();
          
          // Filter for GitLab CI files - expanded search patterns
          const ciFiles = files.filter(file => 
            file.type === 'blob' && 
            (file.name === '.gitlab-ci.yml' || 
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
             (file.path.includes('ci/') && (file.name.endsWith('.yml') || file.name.endsWith('.yaml'))) ||
             (file.path.includes('.gitlab/') && (file.name.endsWith('.yml') || file.name.endsWith('.yaml'))))
          );

          // Fetch content for each CI file using raw URLs
          for (const file of ciFiles) {
            try {
              const rawFileUrl = `https://${host}/${owner}/${repo}/-/raw/${branch}/${file.path}`;
              const contentResponse = await fetch(rawFileUrl);
              
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
                
                foundFiles = true;
              }
            } catch (error) {
              console.warn(`Failed to fetch content for ${file.name}:`, error);
            }
          }
        }
      } catch (apiError) {
        console.debug('API fallback failed:', apiError);
      }
    }

    if (!foundFiles || workflowFiles.length === 0) {
      throw new Error('No GitLab CI files found in the repository. Make sure the repository is public and contains a .gitlab-ci.yml, gitlab-ci.yml, .gitlab-ci.yaml, or gitlab-ci.yaml file.');
    }

    return workflowFiles;
  } catch (error) {
    if (error instanceof Error && error.message.includes('No GitLab CI files found')) {
      throw error;
    }
    throw new Error('Failed to fetch GitLab CI files. This might be due to the repository being private, not existing, or network restrictions.');
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
      error: 'Invalid GitLab URL format. Use: https://gitlab.com/owner/repo or https://gitlab.com/group/subgroup/project' 
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