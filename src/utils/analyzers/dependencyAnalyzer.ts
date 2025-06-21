import { WorkflowData, AnalysisResult } from '../../types/workflow';
import { findJobLineNumber, findStepLineNumber } from '../yamlParser';
import { GitHubAnalysisContext } from '../workflowAnalyzer';

// Helper function to create GitHub permalink for specific line
function createGitHubLink(githubContext: GitHubAnalysisContext, lineNumber?: number): string | undefined {
  if (!githubContext.repoUrl || !githubContext.filePath || !lineNumber) {
    return undefined;
  }
  
  const branch = githubContext.branch || 'main';
  return `${githubContext.repoUrl}/blob/${branch}/${githubContext.filePath}#L${lineNumber}`;
}

export function analyzeDependencyIssues(
  workflow: WorkflowData, 
  fileName: string, 
  content: string, 
  githubContext: GitHubAnalysisContext = {}
): AnalysisResult[] {
  const results: AnalysisResult[] = [];
  
  // Track action usage
  const actionUsage = new Map<string, { count: number, jobs: string[] }>();
  
  Object.entries(workflow.jobs).forEach(([jobId, job]) => {
    // Skip if job doesn't have steps or steps is not an array
    if (!job.steps || !Array.isArray(job.steps)) {
      return;
    }
    
    job.steps.forEach((step, stepIndex) => {
      const stepLineNumber = findStepLineNumber(content, jobId, stepIndex);
      
      if (step.uses) {
        const actionName = step.uses.split('@')[0];
        const current = actionUsage.get(actionName) || { count: 0, jobs: [] };
        actionUsage.set(actionName, {
          count: current.count + 1,
          jobs: [...current.jobs, jobId]
        });
        
        // Check for outdated action versions
        const knownActions: Record<string, string> = {
          'actions/checkout': 'v4',
          'actions/setup-node': 'v4',
          'actions/setup-python': 'v4',
          'actions/upload-artifact': 'v4',
          'actions/download-artifact': 'v4',
          'actions/cache': 'v4'
        };
        
        if (knownActions[actionName]) {
          const [, version] = step.uses.split('@');
          const latestVersion = knownActions[actionName];
          
          if (version && version !== latestVersion && version < latestVersion) {
            const githubLink = createGitHubLink(githubContext, stepLineNumber);
            
            results.push({
              id: `outdated-action-${jobId}-${stepIndex}`,
              type: 'dependency',
              severity: 'warning',
              title: 'Outdated action version',
              description: `${actionName}@${version} is outdated. Latest is ${latestVersion}`,
              file: fileName,
              location: { job: jobId, step: stepIndex, line: stepLineNumber },
              suggestion: `Update to ${actionName}@${latestVersion} for latest features and security fixes`,
              links: [`https://github.com/${actionName.replace('actions/', 'actions/')}`],
              githubUrl: githubLink
            });
          }
        }
        
        // Check for deprecated actions
        const deprecatedActions = [
          'actions/setup-node@v1',
          'actions/checkout@v1',
          'actions/checkout@v2',
          'actions/upload-artifact@v1',
          'actions/upload-artifact@v2'
        ];
        
        if (deprecatedActions.includes(step.uses)) {
          const githubLink = createGitHubLink(githubContext, stepLineNumber);
          
          results.push({
            id: `deprecated-action-${jobId}-${stepIndex}`,
            type: 'dependency',
            severity: 'error',
            title: 'Deprecated action',
            description: `${step.uses} is deprecated and should be updated`,
            file: fileName,
            location: { job: jobId, step: stepIndex, line: stepLineNumber },
            suggestion: 'Update to the latest version of this action',
            githubUrl: githubLink
          });
        }
      }
    });
  });
  
  // Check for duplicate action usage that could be optimized
  actionUsage.forEach((usage, actionName) => {
    if (usage.count > 3) {
      results.push({
        id: `overused-action-${actionName}`,
        type: 'dependency',
        severity: 'info',
        title: 'Frequently used action',
        description: `${actionName} is used ${usage.count} times across jobs: ${usage.jobs.join(', ')}`,
        file: fileName,
        suggestion: 'Consider creating a reusable workflow or composite action'
      });
    }
  });
  
  return results;
}