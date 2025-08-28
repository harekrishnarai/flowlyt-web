import { WorkflowData, AnalysisResult, Job, Step } from '../../types/workflow';
import { findJobLineNumber, findStepLineNumber, extractCodeSnippet } from '../yamlParser';
import { GitHubAnalysisContext } from '../workflowAnalyzer';

// Types for call graph analysis
export interface JobDependency {
  from: string;
  to: string;
  type: 'needs' | 'artifact' | 'output' | 'env';
  details?: string;
}

export interface ActionUsage {
  action: string;
  version: string;
  jobId: string;
  stepIndex: number;
  stepName?: string;
}

export interface CallGraphData {
  jobDependencies: JobDependency[];
  actionUsage: ActionUsage[];
  envFlows: { source: string; target: string; variable: string }[];
  circularDependencies: string[][];
  criticalPaths: string[][];
  isolatedJobs: string[];
}

// Helper function to create GitHub permalink for specific line
function createGitHubLink(githubContext: GitHubAnalysisContext, lineNumber?: number): string | undefined {
  if (!githubContext.repoUrl || !githubContext.filePath || !lineNumber) {
    return undefined;
  }
  
  const branch = githubContext.branch || 'main';
  return `${githubContext.repoUrl}/blob/${branch}/${githubContext.filePath}#L${lineNumber}`;
}

export function analyzeCallGraph(
  workflow: WorkflowData, 
  fileName: string, 
  content: string, 
  githubContext: GitHubAnalysisContext = {}
): { results: AnalysisResult[], callGraphData: CallGraphData } {
  const results: AnalysisResult[] = [];
  const callGraphData: CallGraphData = {
    jobDependencies: [],
    actionUsage: [],
    envFlows: [],
    circularDependencies: [],
    criticalPaths: [],
    isolatedJobs: []
  };

  // 1. Analyze job dependencies via 'needs'
  analyzeJobDependencies(workflow, content, githubContext, results, callGraphData);

  // 2. Analyze action usage patterns
  analyzeActionUsage(workflow, fileName, content, githubContext, results, callGraphData);

  // 3. Analyze artifact dependencies
  analyzeArtifactDependencies(workflow, fileName, content, githubContext, results, callGraphData);

  // 4. Analyze environment variable flows
  analyzeEnvironmentFlows(workflow, fileName, content, githubContext, results, callGraphData);

  // 5. Analyze output dependencies
  analyzeOutputDependencies(workflow, fileName, content, githubContext, results, callGraphData);

  // 6. Detect circular dependencies
  detectCircularDependencies(workflow, results, callGraphData);

  // 7. Find critical paths and isolated jobs
  analyzeCriticalPaths(workflow, callGraphData);

  return { results, callGraphData };
}

function analyzeJobDependencies(
  workflow: WorkflowData,
  content: string,
  githubContext: GitHubAnalysisContext,
  results: AnalysisResult[],
  callGraphData: CallGraphData
): void {
  Object.entries(workflow.jobs).forEach(([jobId, job]) => {
    if (job.needs) {
      const dependencies = Array.isArray(job.needs) ? job.needs : [job.needs];
      
      dependencies.forEach(depJobId => {
        // Check if dependency exists
        if (!workflow.jobs[depJobId]) {
          const lineNumber = findJobLineNumber(content, jobId);
          results.push({
            id: `missing-job-dependency-${jobId}-${depJobId}`,
            type: 'structure',
            severity: 'error',
            title: 'Missing Job Dependency',
            description: `Job '${jobId}' depends on '${depJobId}' which doesn't exist`,
            file: fileName,
            location: { job: jobId, line: lineNumber },
            suggestion: `Remove the dependency on '${depJobId}' or create the missing job`,
            githubUrl: createGitHubLink(githubContext, lineNumber),
            codeSnippet: lineNumber ? extractCodeSnippet(content, lineNumber, 3) : undefined
          });
        } else {
          callGraphData.jobDependencies.push({
            from: depJobId,
            to: jobId,
            type: 'needs'
          });
        }
      });
    }
  });
}

function analyzeActionUsage(
  workflow: WorkflowData,
  fileName: string,
  content: string,
  githubContext: GitHubAnalysisContext,
  results: AnalysisResult[],
  callGraphData: CallGraphData
): void {
  const actionCounts = new Map<string, number>();

  Object.entries(workflow.jobs).forEach(([jobId, job]) => {
    if (!job.steps || !Array.isArray(job.steps)) return;

    job.steps.forEach((step, stepIndex) => {
      if (step.uses) {
        const [actionName, version = 'latest'] = step.uses.split('@');
        
        callGraphData.actionUsage.push({
          action: actionName,
          version,
          jobId,
          stepIndex,
          stepName: step.name
        });

        // Track action usage frequency
        actionCounts.set(actionName, (actionCounts.get(actionName) || 0) + 1);

        // Check for deprecated actions
        const deprecatedActions = [
          'actions/create-release',
          'actions/upload-release-asset',
          'maxheld83/ghpages',
          'peaceiris/actions-gh-pages@v2'
        ];

        if (deprecatedActions.some(deprecated => actionName.includes(deprecated))) {
          const lineNumber = findStepLineNumber(content, jobId, stepIndex);
          results.push({
            id: `deprecated-action-${jobId}-${stepIndex}`,
            type: 'dependency',
            severity: 'warning',
            title: 'Deprecated Action Used',
            description: `Action '${actionName}' is deprecated and should be replaced`,
            file: fileName,
            location: { job: jobId, step: stepIndex, line: lineNumber },
            suggestion: 'Update to a supported alternative action',
            githubUrl: createGitHubLink(githubContext, lineNumber),
            codeSnippet: lineNumber ? extractCodeSnippet(content, lineNumber, 2) || undefined : undefined
          });
        }
      }
    });
  });

  // Report heavily used actions (potential for consolidation)
  actionCounts.forEach((count, actionName) => {
    if (count > 5) {
      results.push({
        id: `heavy-action-usage-${actionName.replace(/[^a-zA-Z0-9]/g, '-')}`,
        type: 'performance',
        severity: 'info',
        title: 'Heavy Action Usage',
        description: `Action '${actionName}' is used ${count} times across the workflow`,
        file: fileName,
        suggestion: 'Consider consolidating steps or using composite actions to reduce duplication'
      });
    }
  });
}

function analyzeArtifactDependencies(
  workflow: WorkflowData,
  fileName: string,
  content: string,
  githubContext: GitHubAnalysisContext,
  results: AnalysisResult[],
  callGraphData: CallGraphData
): void {
  const uploadedArtifacts = new Map<string, { jobId: string, stepIndex: number }>();
  const downloadedArtifacts = new Set<string>();

  Object.entries(workflow.jobs).forEach(([jobId, job]) => {
    if (!job.steps || !Array.isArray(job.steps)) return;

    job.steps.forEach((step, stepIndex) => {
      if (step.uses?.includes('actions/upload-artifact')) {
        const artifactName = step.with?.name || 'default-artifact';
        uploadedArtifacts.set(artifactName, { jobId, stepIndex });
      }

      if (step.uses?.includes('actions/download-artifact')) {
        const artifactName = step.with?.name || 'default-artifact';
        downloadedArtifacts.add(artifactName);
        
        const uploadInfo = uploadedArtifacts.get(artifactName);
        if (uploadInfo) {
          callGraphData.jobDependencies.push({
            from: uploadInfo.jobId,
            to: jobId,
            type: 'artifact',
            details: artifactName
          });
        }
      }
    });
  });

  // Check for unused artifacts
  uploadedArtifacts.forEach((uploadInfo, artifactName) => {
    if (!downloadedArtifacts.has(artifactName)) {
      const lineNumber = findStepLineNumber(content, uploadInfo.jobId, uploadInfo.stepIndex);
      results.push({
        id: `unused-artifact-${artifactName}`,
        type: 'performance',
        severity: 'warning',
        title: 'Unused Artifact',
        description: `Artifact '${artifactName}' is uploaded but never downloaded`,
        file: fileName,
        location: { job: uploadInfo.jobId, step: uploadInfo.stepIndex, line: lineNumber },
        suggestion: 'Remove the unused artifact upload or add download steps where needed',
        githubUrl: createGitHubLink(githubContext, lineNumber),
        codeSnippet: lineNumber ? extractCodeSnippet(content, lineNumber, 2) || undefined : undefined
      });
    }
  });
}

function analyzeEnvironmentFlows(
  workflow: WorkflowData,
  fileName: string,
  content: string,
  githubContext: GitHubAnalysisContext,
  results: AnalysisResult[],
  callGraphData: CallGraphData
): void {
  const globalEnvVars = new Set(Object.keys(workflow.env || {}));
  const jobEnvVars = new Map<string, Set<string>>();

  Object.entries(workflow.jobs).forEach(([jobId, job]) => {
    const jobVars = new Set<string>();
    
    // Job-level env vars
    if (job.env) {
      Object.keys(job.env).forEach(key => jobVars.add(key));
    }

    // Step-level env vars
    if (job.steps && Array.isArray(job.steps)) {
      job.steps.forEach(step => {
        if (step.env) {
          Object.keys(step.env).forEach(key => jobVars.add(key));
        }
      });
    }

    jobEnvVars.set(jobId, jobVars);
  });

  // Analyze potential env var shadowing
  jobEnvVars.forEach((jobVars, jobId) => {
    jobVars.forEach(varName => {
      if (globalEnvVars.has(varName)) {
        const lineNumber = findJobLineNumber(content, jobId);
        results.push({
          id: `env-var-shadowing-${jobId}-${varName}`,
          type: 'best-practice',
          severity: 'info',
          title: 'Environment Variable Shadowing',
          description: `Job '${jobId}' redefines global environment variable '${varName}'`,
          file: fileName,
          location: { job: jobId, line: lineNumber },
          suggestion: 'Consider using a different variable name to avoid confusion',
          githubUrl: createGitHubLink(githubContext, lineNumber)
        });
      }
    });
  });
}

function analyzeOutputDependencies(
  workflow: WorkflowData,
  fileName: string,
  content: string,
  githubContext: GitHubAnalysisContext,
  results: AnalysisResult[],
  callGraphData: CallGraphData
): void {
  const jobOutputs = new Map<string, Set<string>>();
  const outputUsage = new Map<string, string[]>();

  // Collect job outputs
  Object.entries(workflow.jobs).forEach(([jobId, job]) => {
    if (job.steps && Array.isArray(job.steps)) {
      const outputs = new Set<string>();
      
      job.steps.forEach(step => {
        if (step.id) {
          outputs.add(step.id);
        }
      });
      
      jobOutputs.set(jobId, outputs);
    }
  });

  // Find output usage in expressions
  Object.entries(workflow.jobs).forEach(([jobId, job]) => {
    if (job.steps && Array.isArray(job.steps)) {
      job.steps.forEach((step, stepIndex) => {
        const stepContent = JSON.stringify(step);
        const outputReferences = stepContent.match(/\$\{\{\s*needs\.(\w+)\.outputs\.(\w+)\s*\}\}/g);
        
        if (outputReferences) {
          outputReferences.forEach(ref => {
            const match = ref.match(/needs\.(\w+)\.outputs\.(\w+)/);
            if (match) {
              const [, sourceJobId, outputName] = match;
              const usageKey = `${sourceJobId}.${outputName}`;
              
              if (!outputUsage.has(usageKey)) {
                outputUsage.set(usageKey, []);
              }
              outputUsage.get(usageKey)!.push(jobId);

              callGraphData.jobDependencies.push({
                from: sourceJobId,
                to: jobId,
                type: 'output',
                details: outputName
              });
            }
          });
        }
      });
    }
  });
}

function detectCircularDependencies(
  workflow: WorkflowData,
  results: AnalysisResult[],
  callGraphData: CallGraphData
): void {
  const graph = new Map<string, string[]>();
  
  // Build dependency graph
  Object.keys(workflow.jobs).forEach(jobId => {
    graph.set(jobId, []);
  });

  callGraphData.jobDependencies.forEach(dep => {
    const deps = graph.get(dep.to) || [];
    deps.push(dep.from);
    graph.set(dep.to, deps);
  });

  // DFS to detect cycles
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  
  function hasCycleDFS(node: string, path: string[]): string[] | null {
    if (recursionStack.has(node)) {
      const cycleStart = path.indexOf(node);
      return path.slice(cycleStart).concat([node]);
    }
    
    if (visited.has(node)) {
      return null;
    }
    
    visited.add(node);
    recursionStack.add(node);
    
    const dependencies = graph.get(node) || [];
    for (const dep of dependencies) {
      const cycle = hasCycleDFS(dep, [...path, node]);
      if (cycle) {
        return cycle;
      }
    }
    
    recursionStack.delete(node);
    return null;
  }

  Object.keys(workflow.jobs).forEach(jobId => {
    if (!visited.has(jobId)) {
      const cycle = hasCycleDFS(jobId, []);
      if (cycle) {
        callGraphData.circularDependencies.push(cycle);
        results.push({
          id: `circular-dependency-${cycle.join('-')}`,
          type: 'structure',
          severity: 'error',
          title: 'Circular Job Dependency',
          description: `Circular dependency detected: ${cycle.join(' → ')}`,
          file: '',
          suggestion: 'Restructure job dependencies to eliminate the circular reference'
        });
      }
    }
  });
}

function analyzeCriticalPaths(
  workflow: WorkflowData,
  callGraphData: CallGraphData
): void {
  const graph = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  // Initialize
  Object.keys(workflow.jobs).forEach(jobId => {
    graph.set(jobId, []);
    inDegree.set(jobId, 0);
  });

  // Build graph and calculate in-degrees
  callGraphData.jobDependencies.forEach(dep => {
    const successors = graph.get(dep.from) || [];
    successors.push(dep.to);
    graph.set(dep.from, successors);
    
    inDegree.set(dep.to, (inDegree.get(dep.to) || 0) + 1);
  });

  // Find root jobs (no dependencies)
  const rootJobs = Array.from(inDegree.entries())
    .filter(([, degree]) => degree === 0)
    .map(([jobId]) => jobId);

  // Find leaf jobs (no successors)
  const leafJobs = Array.from(graph.entries())
    .filter(([, successors]) => successors.length === 0)
    .map(([jobId]) => jobId);

  // Find isolated jobs
  callGraphData.isolatedJobs = Array.from(graph.entries())
    .filter(([jobId, successors]) => successors.length === 0 && (inDegree.get(jobId) || 0) === 0)
    .map(([jobId]) => jobId);

  // Calculate critical paths (longest paths from root to leaf)
  function findLongestPath(startJob: string): string[] {
    const visited = new Set<string>();
    let longestPath: string[] = [];

    function dfs(job: string, currentPath: string[]): void {
      if (visited.has(job)) return;
      visited.add(job);

      const newPath = [...currentPath, job];
      const successors = graph.get(job) || [];

      if (successors.length === 0) {
        if (newPath.length > longestPath.length) {
          longestPath = [...newPath];
        }
      } else {
        successors.forEach(successor => dfs(successor, newPath));
      }

      visited.delete(job);
    }

    dfs(startJob, []);
    return longestPath;
  }

  rootJobs.forEach(rootJob => {
    const path = findLongestPath(rootJob);
    if (path.length > 1) {
      callGraphData.criticalPaths.push(path);
    }
  });
}

export function generateCallGraphInsights(callGraphData: CallGraphData): AnalysisResult[] {
  const insights: AnalysisResult[] = [];

  // Critical path insights
  if (callGraphData.criticalPaths.length > 0) {
    const longestPath = callGraphData.criticalPaths.reduce((longest, current) =>
      current.length > longest.length ? current : longest
    );

    insights.push({
      id: 'critical-path-analysis',
      type: 'performance',
      severity: 'info',
      title: 'Critical Path Analysis',
      description: `Longest execution path: ${longestPath.join(' → ')} (${longestPath.length} jobs)`,
      file: '',
      suggestion: 'Consider parallelizing jobs in the critical path to reduce overall execution time'
    });
  }

  // Isolated jobs warning
  if (callGraphData.isolatedJobs.length > 0) {
    insights.push({
      id: 'isolated-jobs',
      type: 'structure',
      severity: 'info',
      title: 'Isolated Jobs Detected',
      description: `Jobs with no dependencies: ${callGraphData.isolatedJobs.join(', ')}`,
      file: '',
      suggestion: 'These jobs can run in parallel and may complete quickly'
    });
  }

  // Heavy action usage summary
  const actionCounts = new Map<string, number>();
  callGraphData.actionUsage.forEach(usage => {
    actionCounts.set(usage.action, (actionCounts.get(usage.action) || 0) + 1);
  });

  const heavyActions = Array.from(actionCounts.entries())
    .filter(([, count]) => count > 3)
    .sort(([, a], [, b]) => b - a);

  if (heavyActions.length > 0) {
    insights.push({
      id: 'action-usage-summary',
      type: 'structure',
      severity: 'info',
      title: 'Action Usage Summary',
      description: `Most used actions: ${heavyActions.slice(0, 3).map(([action, count]) => `${action} (${count}x)`).join(', ')}`,
      file: '',
      suggestion: 'Consider creating composite actions for frequently used action sequences'
    });
  }

  return insights;
}
