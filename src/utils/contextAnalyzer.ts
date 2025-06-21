import { AnalysisResult, WorkflowData } from '../types/workflow';

export interface AnalysisContext {
  isComplexWorkflow: boolean;
  totalJobs: number;
  totalSteps: number;
  hasProductionIndicators: boolean;
  hasAutomation: boolean;
  workflowType: 'ci' | 'cd' | 'automation' | 'utility' | 'unknown';
}

/**
 * Analyze workflow context to provide intelligent filtering and prioritization
 */
export function analyzeWorkflowContext(workflow: WorkflowData, fileName: string, content: string): AnalysisContext {
  const totalJobs = Object.keys(workflow.jobs).length;
  const totalSteps = Object.values(workflow.jobs).reduce((acc, job) => {
    if (job.steps && Array.isArray(job.steps)) {
      return acc + job.steps.length;
    }
    return acc;
  }, 0);

  const isComplexWorkflow = totalJobs > 2 || totalSteps > 10;
  
  // Detect production indicators
  const hasProductionIndicators = content.includes('production') ||
    content.includes('deploy') ||
    content.includes('release') ||
    content.includes('publish') ||
    Object.values(workflow.jobs).some(job => 
      job.steps?.some(step => 
        step.uses?.includes('deploy') ||
        step.run?.includes('deploy') ||
        step.run?.includes('publish')
      )
    );

  // Detect automation workflows
  const hasAutomation = workflow.on && (
    typeof workflow.on === 'object' && (
      'schedule' in workflow.on ||
      'repository_dispatch' in workflow.on ||
      'workflow_dispatch' in workflow.on
    )
  );

  // Determine workflow type
  let workflowType: 'ci' | 'cd' | 'automation' | 'utility' | 'unknown' = 'unknown';
  
  if (hasProductionIndicators) {
    workflowType = 'cd';
  } else if (content.includes('test') || content.includes('lint') || content.includes('build')) {
    workflowType = 'ci';
  } else if (hasAutomation) {
    workflowType = 'automation';
  } else if (totalJobs === 1 && totalSteps <= 5) {
    workflowType = 'utility';
  }

  return {
    isComplexWorkflow,
    totalJobs,
    totalSteps,
    hasProductionIndicators,
    hasAutomation,
    workflowType
  };
}

/**
 * Filter and adjust analysis results based on context
 */
export function filterResultsByContext(results: AnalysisResult[], context: AnalysisContext): AnalysisResult[] {
  return results.filter(result => {
    // Skip certain checks for simple utility workflows
    if (context.workflowType === 'utility') {
      if (result.type === 'best-practice' && (
        result.title.includes('Missing job name') ||
        result.title.includes('Missing step name') ||
        result.title.includes('documentation')
      )) {
        return false;
      }
    }

    // Skip documentation checks for automation workflows
    if (context.workflowType === 'automation' && 
        result.title.includes('documentation') && 
        context.totalSteps <= 3) {
      return false;
    }

    // Upgrade severity for production workflows
    if (context.hasProductionIndicators && result.severity === 'info') {
      if (result.type === 'security' || result.title.includes('error handling')) {
        result.severity = 'warning';
      }
    }

    return true;
  });
}

/**
 * Add context-specific recommendations
 */
export function addContextualRecommendations(results: AnalysisResult[], context: AnalysisContext, fileName: string): AnalysisResult[] {
  const contextualResults = [...results];

  // Add production-specific recommendations
  if (context.hasProductionIndicators && context.totalJobs > 1) {
    contextualResults.push({
      id: `production-workflow-${Date.now()}`,
      type: 'best-practice',
      severity: 'info',
      title: 'Production workflow detected',
      description: 'This appears to be a production deployment workflow. Consider implementing additional safeguards.',
      file: fileName,
      suggestion: 'Add environment protection rules, manual approvals, and comprehensive testing before production deployment'
    });
  }

  // Add complexity warnings
  if (context.isComplexWorkflow && context.totalJobs > 5) {
    contextualResults.push({
      id: `complex-workflow-${Date.now()}`,
      type: 'structure',
      severity: 'info',
      title: 'Consider workflow decomposition',
      description: `This workflow has ${context.totalJobs} jobs which may be difficult to maintain and debug.`,
      file: fileName,
      suggestion: 'Consider breaking this into multiple workflows or using reusable workflows for better maintainability'
    });
  }

  return contextualResults;
}
