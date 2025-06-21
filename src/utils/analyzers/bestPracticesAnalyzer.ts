import { WorkflowData, AnalysisResult } from '../../types/workflow';
import { findLineNumber, findJobLineNumber, findStepLineNumber } from '../yamlParser';
import { GitHubAnalysisContext } from '../workflowAnalyzer';

// Helper function to create GitHub permalink for specific line
function createGitHubLink(githubContext: GitHubAnalysisContext, lineNumber?: number): string | undefined {
  if (!githubContext.repoUrl || !githubContext.filePath || !lineNumber) {
    return undefined;
  }
  
  const branch = githubContext.branch || 'main';
  return `${githubContext.repoUrl}/blob/${branch}/${githubContext.filePath}#L${lineNumber}`;
}

export function analyzeBestPractices(
  workflow: WorkflowData, 
  fileName: string, 
  content: string, 
  githubContext: GitHubAnalysisContext = {}
): AnalysisResult[] {
  const results: AnalysisResult[] = [];
  
  // Check for workflow name
  if (!workflow.name || workflow.name.trim() === '') {
    const lineNumber = findLineNumber(content, 'name:') || 1;
    const githubLink = createGitHubLink(githubContext, lineNumber);
    
    results.push({
      id: `missing-name-${Date.now()}`,
      type: 'best-practice',
      severity: 'warning',
      title: 'Missing workflow name',
      description: 'Workflow should have a descriptive name',
      file: fileName,
      location: { line: lineNumber },
      suggestion: 'Add a "name" field at the top level of your workflow',
      links: ['https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions#name'],
      githubUrl: githubLink
    });
  }
  
  // Check for job names
  Object.entries(workflow.jobs).forEach(([jobId, job]) => {
    const jobLineNumber = findJobLineNumber(content, jobId);
    
    if (!job.name || job.name.trim() === '') {
      const githubLink = createGitHubLink(githubContext, jobLineNumber);
      
      results.push({
        id: `missing-job-name-${jobId}`,
        type: 'best-practice',
        severity: 'info',
        title: 'Missing job name',
        description: `Job '${jobId}' should have a descriptive name`,
        file: fileName,
        location: { job: jobId, line: jobLineNumber },
        suggestion: 'Add a "name" field to make the job purpose clear in the UI',
        githubUrl: githubLink
      });
    }
    
    // Check for step names
    // Skip if job doesn't have steps or steps is not an array
    if (!job.steps || !Array.isArray(job.steps)) {
      return;
    }
    
    job.steps.forEach((step, stepIndex) => {
      const stepLineNumber = findStepLineNumber(content, jobId, stepIndex);
      
      if (!step.name && (step.uses || step.run)) {
        const githubLink = createGitHubLink(githubContext, stepLineNumber);
        
        results.push({
          id: `missing-step-name-${jobId}-${stepIndex}`,
          type: 'best-practice',
          severity: 'info',
          title: 'Missing step name',
          description: `Step ${stepIndex + 1} in job '${jobId}' should have a name`,
          file: fileName,
          location: { job: jobId, step: stepIndex, line: stepLineNumber },
          suggestion: 'Add descriptive names to steps for better readability',
          githubUrl: githubLink
        });
      }
    });
    
    // Check for error handling
    const hasErrorHandling = job.steps.some(step => 
      step['continue-on-error'] !== undefined || step.if?.includes('failure()')
    );
    
    if (!hasErrorHandling && job.steps.length > 3) {
      const githubLink = createGitHubLink(githubContext, jobLineNumber);
      
      results.push({
        id: `no-error-handling-${jobId}`,
        type: 'best-practice',
        severity: 'info',
        title: 'No error handling detected',
        description: `Job '${jobId}' may benefit from error handling strategies`,
        file: fileName,
        location: { job: jobId, line: jobLineNumber },
        suggestion: 'Consider adding continue-on-error or conditional steps for error scenarios',
        githubUrl: githubLink
      });
    }
  });
  
  // Check for documentation
  const hasComments = content.includes('#');
  if (!hasComments) {
    results.push({
      id: `no-documentation-${Date.now()}`,
      type: 'best-practice',
      severity: 'info',
      title: 'No inline documentation',
      description: 'Workflow could benefit from comments explaining complex logic',
      file: fileName,
      suggestion: 'Add YAML comments to explain workflow purpose and complex steps'
    });
  }
  
  return results;
}