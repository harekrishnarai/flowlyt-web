import { WorkflowData, AnalysisResult } from '../../types/workflow';
import { findLineNumber, findJobLineNumber, findStepLineNumber, extractJobSnippet, extractStepSnippet } from '../yamlParser';
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
  
  // Calculate workflow complexity for context-aware analysis
  const totalJobs = Object.keys(workflow.jobs).length;
  const totalSteps = Object.values(workflow.jobs).reduce((acc, job) => {
    if (job.steps && Array.isArray(job.steps)) {
      return acc + job.steps.length;
    }
    return acc;
  }, 0);
  const isComplexWorkflow = totalJobs > 2 || totalSteps > 10;
  
  // Check for workflow name (only for complex workflows)
  if (isComplexWorkflow && (!workflow.name || workflow.name.trim() === '')) {
    const lineNumber = findLineNumber(content, 'name:') || 1;
    const githubLink = createGitHubLink(githubContext, lineNumber);
    
    results.push({
      id: `missing-name-${Date.now()}`,
      type: 'best-practice',
      severity: 'warning',
      title: 'Missing workflow name',
      description: 'Complex workflows should have a descriptive name for better organization',
      file: fileName,
      location: { line: lineNumber },
      suggestion: 'Add a "name" field at the top level of your workflow',
      links: ['https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions#name'],
      githubUrl: githubLink
    });
  }
  
  // Check for job names (context-aware)
  Object.entries(workflow.jobs).forEach(([jobId, job]) => {
    const jobLineNumber = findJobLineNumber(content, jobId);
    
    // Only flag missing job names for complex workflows or when job ID is not descriptive
    const isGenericJobId = ['build', 'test', 'deploy', 'job1', 'job2'].includes(jobId);
    const shouldHaveJobName = isComplexWorkflow || isGenericJobId || totalJobs > 1;
    
    if (shouldHaveJobName && (!job.name || job.name.trim() === '')) {
      const githubLink = createGitHubLink(githubContext, jobLineNumber);
      const codeSnippet = extractJobSnippet(content, jobId);
      
      results.push({
        id: `missing-job-name-${jobId}`,
        type: 'best-practice',
        severity: 'info',
        title: 'Missing job name',
        description: `Job '${jobId}' should have a descriptive name for better clarity`,
        file: fileName,
        location: { job: jobId, line: jobLineNumber },
        suggestion: 'Add a "name" field to make the job purpose clear in the UI',
        githubUrl: githubLink,
        codeSnippet: codeSnippet || undefined
      });
    }
    
    // Check for step names (only for complex jobs)
    // Skip if job doesn't have steps or steps is not an array
    if (!job.steps || !Array.isArray(job.steps)) {
      return;
    }
    
    const hasComplexSteps = job.steps.length > 5 || job.steps.some(step => 
      (step.uses && !step.uses.startsWith('actions/')) || 
      (step.run && step.run.split('\n').length > 3)
    );
    
    if (hasComplexSteps) {
      job.steps.forEach((step, stepIndex) => {
        const stepLineNumber = findStepLineNumber(content, jobId, stepIndex);
        
        // Only flag missing step names for complex steps or when there are many steps
        const isComplexStep = (step.uses && !step.uses.startsWith('actions/')) || 
                             (step.run && step.run.split('\n').length > 2);
        
        if (!step.name && (step.uses || step.run) && (isComplexStep || job.steps.length > 3)) {
          const githubLink = createGitHubLink(githubContext, stepLineNumber);
          const codeSnippet = extractStepSnippet(content, jobId, stepIndex);
          
          // Only add if we found a valid line number to avoid false positives
          if (stepLineNumber > 0) {
            results.push({
              id: `missing-step-name-${jobId}-${stepIndex}`,
              type: 'best-practice',
              severity: 'info',
              title: 'Missing step name',
              description: `Step ${stepIndex + 1} in job '${jobId}' should have a name for better readability`,
              file: fileName,
              location: { job: jobId, step: stepIndex, line: stepLineNumber },
              suggestion: 'Add descriptive names to steps for better readability',
              githubUrl: githubLink,
              codeSnippet: codeSnippet || undefined
            });
          }
        }
      });
    }
    
    // Check for error handling (only for complex jobs with critical steps)
    const hasCriticalSteps = job.steps.some(step => 
      step.run?.includes('deploy') || 
      step.run?.includes('publish') || 
      step.run?.includes('release') ||
      step.uses?.includes('deploy') ||
      step.uses?.includes('publish')
    );
    
    const hasErrorHandling = job.steps.some(step => 
      step['continue-on-error'] !== undefined || 
      step.if?.includes('failure()') ||
      step.if?.includes('always()') ||
      step.if?.includes('cancelled()')
    );
    
    if (hasCriticalSteps && !hasErrorHandling && job.steps.length > 2) {
      const githubLink = createGitHubLink(githubContext, jobLineNumber);
      
      results.push({
        id: `no-error-handling-${jobId}`,
        type: 'best-practice',
        severity: 'info',
        title: 'Consider error handling for critical operations',
        description: `Job '${jobId}' contains critical steps that may benefit from error handling strategies`,
        file: fileName,
        location: { job: jobId, line: jobLineNumber },
        suggestion: 'Consider adding continue-on-error or conditional steps for critical operations',
        githubUrl: githubLink
      });
    }
  });
  
  // Check for documentation (improved detection)
  const hasComments = content.split('\n').some(line => {
    const trimmedLine = line.trim();
    // Look for actual comments, not just YAML syntax
    return trimmedLine.startsWith('#') && !trimmedLine.match(/^#\s*(on:|name:|jobs:|steps:)/);
  });
  
  const hasDescriptiveContent = workflow.name || 
    Object.values(workflow.jobs).some(job => job.name) ||
    totalSteps < 5; // Simple workflows don't need extra documentation
  
  if (isComplexWorkflow && !hasComments && !hasDescriptiveContent) {
    results.push({
      id: `no-documentation-${Date.now()}`,
      type: 'best-practice',
      severity: 'info',
      title: 'Complex workflow lacks documentation',
      description: 'Complex workflows benefit from comments explaining their purpose and logic',
      file: fileName,
      suggestion: 'Add YAML comments to explain workflow purpose and complex steps'
    });
  }
  
  return results;
}