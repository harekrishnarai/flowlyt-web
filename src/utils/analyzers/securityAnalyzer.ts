import { WorkflowData, AnalysisResult } from '../../types/workflow';
import { findLineNumber, findStepLineNumber } from '../yamlParser';
import { GitHubAnalysisContext } from '../workflowAnalyzer';

// Helper function to create GitHub permalink for specific line
function createGitHubLink(githubContext: GitHubAnalysisContext, lineNumber?: number): string | undefined {
  if (!githubContext.repoUrl || !githubContext.filePath || !lineNumber) {
    return undefined;
  }
  
  const branch = githubContext.branch || 'main';
  return `${githubContext.repoUrl}/blob/${branch}/${githubContext.filePath}#L${lineNumber}`;
}

export function analyzeSecurityIssues(
  workflow: WorkflowData, 
  fileName: string, 
  content: string, 
  githubContext: GitHubAnalysisContext = {}
): AnalysisResult[] {
  const results: AnalysisResult[] = [];
  
  // Check for hardcoded secrets
  const secretPatterns = [
    { pattern: /password\s*[:=]\s*['"]\w+['"]/, name: 'password' },
    { pattern: /token\s*[:=]\s*['"]\w+['"]/, name: 'token' },
    { pattern: /key\s*[:=]\s*['"]\w+['"]/, name: 'API key' },
    { pattern: /secret\s*[:=]\s*['"]\w+['"]/, name: 'secret' },
  ];
  
  secretPatterns.forEach(({ pattern, name }) => {
    const match = content.match(pattern);
    if (match) {
      const lineNumber = findLineNumber(content, match[0]);
      const githubLink = createGitHubLink(githubContext, lineNumber);
      
      results.push({
        id: `hardcoded-${name}-${Date.now()}`,
        type: 'security',
        severity: 'error',
        title: `Hardcoded ${name} detected`,
        description: `Found potential hardcoded ${name} in workflow. Use GitHub Secrets instead.`,
        file: fileName,
        location: { line: lineNumber },
        suggestion: `Store sensitive values in GitHub Secrets and reference them using \${{ secrets.SECRET_NAME }}`,
        links: ['https://docs.github.com/en/actions/security-guides/encrypted-secrets'],
        githubUrl: githubLink
      });
    }
  });
  
  // Check for overly permissive permissions
  if (workflow.permissions) {
    const permissions = workflow.permissions;
    if (permissions === 'write-all' || (typeof permissions === 'object' && permissions.contents === 'write')) {
      const lineNumber = findLineNumber(content, 'permissions:');
      const githubLink = createGitHubLink(githubContext, lineNumber);
      
      results.push({
        id: `permissions-${Date.now()}`,
        type: 'security',
        severity: 'warning',
        title: 'Overly permissive workflow permissions',
        description: 'Workflow has write permissions that may be unnecessary.',
        file: fileName,
        location: { line: lineNumber },
        suggestion: 'Use minimal required permissions. Consider using job-level permissions instead.',
        links: ['https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions#permissions'],
        githubUrl: githubLink
      });
    }
  }
  
  // Check for third-party actions without pinned versions
  Object.entries(workflow.jobs).forEach(([jobId, job]) => {
    // Skip if job doesn't have steps or steps is not an array
    if (!job.steps || !Array.isArray(job.steps)) {
      return;
    }
    
    job.steps.forEach((step, stepIndex) => {
      const stepLineNumber = findStepLineNumber(content, jobId, stepIndex);
      
      if (step.uses && !step.uses.includes('@')) {
        const githubLink = createGitHubLink(githubContext, stepLineNumber);
        
        results.push({
          id: `unpinned-action-${jobId}-${stepIndex}`,
          type: 'security',
          severity: 'warning',
          title: 'Unpinned action version',
          description: `Step uses '${step.uses}' without a specific version`,
          file: fileName,
          location: { job: jobId, step: stepIndex, line: stepLineNumber },
          suggestion: 'Pin actions to specific versions or SHA hashes for better security',
          links: ['https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions'],
          githubUrl: githubLink
        });
      }
      
      // Check for actions from untrusted sources
      if (step.uses && !step.uses.startsWith('actions/') && !step.uses.includes('@')) {
        const actionOwner = step.uses.split('/')[0];
        if (!['actions', 'github', 'docker'].includes(actionOwner)) {
          const githubLink = createGitHubLink(githubContext, stepLineNumber);
          
          results.push({
            id: `untrusted-action-${jobId}-${stepIndex}`,
            type: 'security',
            severity: 'info',
            title: 'Third-party action usage',
            description: `Using action from '${actionOwner}' - verify trustworthiness`,
            file: fileName,
            location: { job: jobId, step: stepIndex, line: stepLineNumber },
            suggestion: 'Review the action source code and pin to a specific version',
            links: ['https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions'],
            githubUrl: githubLink
          });
        }
      }
    });
  });
  
  return results;
}