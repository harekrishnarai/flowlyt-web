import { WorkflowData, AnalysisResult } from '../../types/workflow';
import { findJobLineNumber, findStepLineNumber, findLineNumber } from '../yamlParser';
import { GitHubAnalysisContext } from '../workflowAnalyzer';

// Helper function to create GitHub permalink for specific line
function createGitHubLink(githubContext: GitHubAnalysisContext, lineNumber?: number): string | undefined {
  if (!githubContext.repoUrl || !githubContext.filePath || !lineNumber) {
    return undefined;
  }
  
  const branch = githubContext.branch || 'main';
  return `${githubContext.repoUrl}/blob/${branch}/${githubContext.filePath}#L${lineNumber}`;
}

export function analyzePerformanceIssues(
  workflow: WorkflowData, 
  fileName: string, 
  content: string, 
  githubContext: GitHubAnalysisContext = {}
): AnalysisResult[] {
  const results: AnalysisResult[] = [];
  
  // Check for missing caching
  Object.entries(workflow.jobs).forEach(([jobId, job]) => {
    const jobLineNumber = findJobLineNumber(content, jobId);
    
    // Skip if job doesn't have steps or steps is not an array
    if (!job.steps || !Array.isArray(job.steps)) {
      return;
    }
    
    const hasNodeSetup = job.steps.some(step => 
      step.uses?.includes('actions/setup-node') || 
      step.uses?.includes('setup-node')
    );
    const hasPythonSetup = job.steps.some(step => 
      step.uses?.includes('actions/setup-python') || 
      step.uses?.includes('setup-python')
    );
    const hasJavaSetup = job.steps.some(step => 
      step.uses?.includes('actions/setup-java') || 
      step.uses?.includes('setup-java')
    );
    
    const hasCaching = job.steps.some(step => 
      step.uses?.includes('actions/cache') || 
      step.uses?.includes('cache')
    );
    
    const hasInstallStep = job.steps.some(step => 
      step.run?.includes('npm install') || 
      step.run?.includes('yarn install') ||
      step.run?.includes('pip install') ||
      step.run?.includes('mvn install') ||
      step.run?.includes('gradle build')
    );
    
    // Only recommend caching if there's a setup step AND an install step
    if ((hasNodeSetup || hasPythonSetup || hasJavaSetup) && hasInstallStep && !hasCaching) {
      const githubLink = createGitHubLink(githubContext, jobLineNumber);
      const setupType = hasNodeSetup ? 'Node.js' : hasPythonSetup ? 'Python' : 'Java';
      
      results.push({
        id: `missing-cache-${jobId}`,
        type: 'performance',
        severity: 'warning',
        title: 'Missing dependency caching',
        description: `Job '${jobId}' sets up ${setupType} and installs dependencies but doesn't cache them`,
        file: fileName,
        location: { job: jobId, line: jobLineNumber },
        suggestion: 'Add actions/cache to cache dependencies and improve build times',
        links: ['https://docs.github.com/en/actions/using-workflows/caching-dependencies-to-speed-up-workflows'],
        githubUrl: githubLink
      });
    }

    // Check for redundant checkout steps
    const checkoutSteps = job.steps.filter(step => 
      step.uses?.includes('actions/checkout') || step.uses?.includes('checkout')
    );
    
    if (checkoutSteps.length > 1) {
      const githubLink = createGitHubLink(githubContext, jobLineNumber);
      
      results.push({
        id: `redundant-checkout-${jobId}`,
        type: 'performance',
        severity: 'warning',
        title: 'Multiple checkout steps',
        description: `Job '${jobId}' has ${checkoutSteps.length} checkout steps`,
        file: fileName,
        location: { job: jobId, line: jobLineNumber },
        suggestion: 'Use a single checkout step at the beginning of the job',
        githubUrl: githubLink
      });
    }

    // Check for inefficient matrix strategies
    if (job.strategy?.matrix) {
      const matrix = job.strategy.matrix;
      const totalCombinations = Object.values(matrix).reduce((acc: number, values: any) => {
        return acc * (Array.isArray(values) ? values.length : 1);
      }, 1);
      
      if (totalCombinations > 20) {
        const githubLink = createGitHubLink(githubContext, jobLineNumber);
        
        results.push({
          id: `large-matrix-${jobId}`,
          type: 'performance',
          severity: 'info',
          title: 'Large matrix strategy',
          description: `Job '${jobId}' matrix creates ${totalCombinations} job combinations`,
          file: fileName,
          location: { job: jobId, line: jobLineNumber },
          suggestion: 'Consider reducing matrix size or using include/exclude to optimize',
          githubUrl: githubLink
        });
      }
    }
  });
  
  // Check for concurrent job limits
  const jobCount = Object.keys(workflow.jobs).length;
  if (jobCount > 20) {
    const lineNumber = findLineNumber(content, 'jobs:');
    const githubLink = createGitHubLink(githubContext, lineNumber);
    
    results.push({
      id: `too-many-jobs-${Date.now()}`,
      type: 'performance',
      severity: 'warning',
      title: 'High number of jobs',
      description: `Workflow has ${jobCount} jobs which may exceed GitHub's concurrent job limits`,
      file: fileName,
      location: { line: lineNumber },
      suggestion: 'Consider consolidating jobs or using job dependencies to run jobs sequentially',
      githubUrl: githubLink
    });
  }
  
  return results;
}