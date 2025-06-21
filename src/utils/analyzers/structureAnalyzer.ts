import { WorkflowData, AnalysisResult } from '../../types/workflow';
import { findLineNumber, findJobLineNumber } from '../yamlParser';
import { GitHubAnalysisContext } from '../workflowAnalyzer';

// Helper function to create GitHub permalink for specific line
function createGitHubLink(githubContext: GitHubAnalysisContext, lineNumber?: number): string | undefined {
  if (!githubContext.repoUrl || !githubContext.filePath || !lineNumber) {
    return undefined;
  }
  
  const branch = githubContext.branch || 'main';
  return `${githubContext.repoUrl}/blob/${branch}/${githubContext.filePath}#L${lineNumber}`;
}

export function analyzeStructureIssues(
  workflow: WorkflowData, 
  fileName: string, 
  content: string, 
  githubContext: GitHubAnalysisContext = {}
): AnalysisResult[] {
  const results: AnalysisResult[] = [];
  
  // Analyze job dependencies
  const jobNames = Object.keys(workflow.jobs);
  const dependencyGraph = new Map<string, string[]>();
  
  Object.entries(workflow.jobs).forEach(([jobId, job]) => {
    const jobLineNumber = findJobLineNumber(content, jobId);
    const dependencies = Array.isArray(job.needs) ? job.needs : (job.needs ? [job.needs] : []);
    dependencyGraph.set(jobId, dependencies);
    
    // Check for circular dependencies
    dependencies.forEach(dep => {
      if (!jobNames.includes(dep)) {
        const githubLink = createGitHubLink(githubContext, jobLineNumber);
        
        results.push({
          id: `missing-dependency-${jobId}-${dep}`,
          type: 'structure',
          severity: 'error',
          title: 'Missing job dependency',
          description: `Job '${jobId}' depends on '${dep}' which doesn't exist`,
          file: fileName,
          location: { job: jobId, line: jobLineNumber },
          suggestion: `Check job name spelling or remove the dependency`,
          githubUrl: githubLink
        });
      }
    });
  });
  
  // Check for overly complex workflows
  const totalSteps = Object.values(workflow.jobs).reduce((acc, job) => {
    // Only count steps if job has steps and they're in an array
    if (job.steps && Array.isArray(job.steps)) {
      return acc + job.steps.length;
    }
    return acc;
  }, 0);
  if (totalSteps > 50) {
    const lineNumber = findLineNumber(content, 'jobs:');
    const githubLink = createGitHubLink(githubContext, lineNumber);
    
    results.push({
      id: `complex-workflow-${Date.now()}`,
      type: 'structure',
      severity: 'warning',
      title: 'Complex workflow structure',
      description: `Workflow has ${totalSteps} total steps across ${jobNames.length} jobs`,
      file: fileName,
      location: { line: lineNumber },
      suggestion: 'Consider breaking this into multiple workflows or using reusable workflows',
      githubUrl: githubLink
    });
  }
  
  // Check trigger complexity
  const triggers = workflow.on;
  if (typeof triggers === 'object' && Object.keys(triggers).length > 5) {
    const lineNumber = findLineNumber(content, 'on:');
    const githubLink = createGitHubLink(githubContext, lineNumber);
    
    results.push({
      id: `complex-triggers-${Date.now()}`,
      type: 'structure',
      severity: 'info',
      title: 'Complex trigger configuration',
      description: `Workflow has ${Object.keys(triggers).length} different trigger types`,
      file: fileName,
      location: { line: lineNumber },
      suggestion: 'Consider if all triggers are necessary or if some could be moved to separate workflows',
      githubUrl: githubLink
    });
  }
  
  return results;
}