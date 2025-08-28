import { WorkflowData, AnalysisResult } from '../../types/workflow';

// Types for reachability analysis
export interface ExecutionContext {
  triggers: string[];
  conditions: Map<string, string[]>; // job/step ID -> conditions
  environmentalFactors: {
    hasSecrets: boolean;
    hasPrivilegedTrigger: boolean;
    hasExternalActions: boolean;
    hasSelfHosted: boolean;
  };
}

export interface ReachabilityInfo {
  isReachable: boolean;
  requiredConditions: string[];
  triggerContexts: string[];
  riskLevel: 'high' | 'medium' | 'low' | 'informational';
  mitigatingFactors: string[];
}

export interface SecurityIssueWithReachability extends AnalysisResult {
  reachability?: ReachabilityInfo;
  originalSeverity?: 'error' | 'warning' | 'info';
  contextualSeverity?: 'error' | 'warning' | 'info';
}

/**
 * Analyze execution context to understand when and how workflow components are reachable
 */
export function analyzeExecutionContext(
  workflow: WorkflowData,
  content: string
): ExecutionContext {
  const triggers: string[] = [];
  const conditions = new Map<string, string[]>();
  
  // Extract trigger events
  if (workflow.on) {
    if (typeof workflow.on === 'string') {
      triggers.push(workflow.on);
    } else if (Array.isArray(workflow.on)) {
      triggers.push(...workflow.on);
    } else if (typeof workflow.on === 'object') {
      triggers.push(...Object.keys(workflow.on));
    }
  }

  // Analyze job and step conditions
  Object.entries(workflow.jobs).forEach(([jobId, job]) => {
    const jobConditions: string[] = [];
    
    // Job-level conditions
    if (job.if) {
      jobConditions.push(job.if);
    }
    
    // Environment-based conditions
    if (job.env) {
      Object.keys(job.env).forEach(envKey => {
        if (job.env![envKey].includes('${{')) {
          jobConditions.push(`env.${envKey} dependency`);
        }
      });
    }
    
    // Strategy matrix conditions
    if (job.strategy?.matrix) {
      jobConditions.push('matrix strategy');
    }
    
    conditions.set(jobId, jobConditions);
    
    // Step-level conditions
    if (job.steps && Array.isArray(job.steps)) {
      job.steps.forEach((step, stepIndex) => {
        const stepConditions: string[] = [...jobConditions]; // Inherit job conditions
        
        if (step.if) {
          stepConditions.push(step.if);
        }
        
        conditions.set(`${jobId}.${stepIndex}`, stepConditions);
      });
    }
  });

  // Analyze environmental factors
  const environmentalFactors = {
    hasSecrets: content.includes('secrets.') || content.includes('${{ secrets'),
    hasPrivilegedTrigger: triggers.some(t => 
      ['workflow_run', 'pull_request_target', 'repository_dispatch'].includes(t)
    ),
    hasExternalActions: Object.values(workflow.jobs).some(job =>
      job.steps?.some(step => 
        step.uses && !step.uses.startsWith('actions/') && !step.uses.startsWith('./')
      )
    ),
    hasSelfHosted: content.includes('self-hosted') || content.includes('runs-on:') && 
                   !content.includes('ubuntu-') && !content.includes('windows-') && !content.includes('macos-')
  };

  return {
    triggers,
    conditions,
    environmentalFactors
  };
}

/**
 * Determine reachability and risk level for a specific security issue
 */
export function analyzeReachability(
  issue: AnalysisResult,
  executionContext: ExecutionContext,
  workflow: WorkflowData
): ReachabilityInfo {
  let isReachable = true;
  let riskLevel: 'high' | 'medium' | 'low' | 'informational' = 'medium';
  const requiredConditions: string[] = [];
  const triggerContexts: string[] = [...executionContext.triggers];
  const mitigatingFactors: string[] = [];

  // Check if the issue is in a conditional job/step
  if (issue.location?.job) {
    const jobConditions = executionContext.conditions.get(issue.location.job) || [];
    requiredConditions.push(...jobConditions);
    
    if (issue.location.step !== undefined) {
      const stepConditions = executionContext.conditions.get(`${issue.location.job}.${issue.location.step}`) || [];
      requiredConditions.push(...stepConditions);
    }
  }

  // Analyze trigger-based reachability
  const privilegedTriggers = ['workflow_run', 'pull_request_target', 'repository_dispatch'];
  const publicTriggers = ['push', 'pull_request', 'schedule', 'workflow_dispatch'];
  
  // Risk assessment based on triggers and issue type
  if (issue.type === 'security') {
    if (privilegedTriggers.some(t => triggerContexts.includes(t))) {
      riskLevel = 'high';
      if (issue.title.includes('injection') || issue.title.includes('checkout')) {
        riskLevel = 'high';
      }
    } else if (publicTriggers.some(t => triggerContexts.includes(t))) {
      riskLevel = executionContext.environmentalFactors.hasSecrets ? 'medium' : 'low';
    } else {
      riskLevel = 'low';
    }
  }

  // Analyze specific issue patterns for reachability
  switch (issue.title.toLowerCase()) {
    case 'hardcoded secrets detected':
      // Always reachable if workflow runs
      isReachable = true;
      riskLevel = executionContext.environmentalFactors.hasPrivilegedTrigger ? 'high' : 'medium';
      break;
      
    case 'potential expression injection':
      // Check if the injection is in a reachable context
      if (requiredConditions.some(c => c.includes('github.event'))) {
        riskLevel = 'high';
      } else if (requiredConditions.length > 0) {
        riskLevel = 'medium';
        mitigatingFactors.push('Conditional execution reduces risk');
      }
      break;
      
    case 'dangerous checkout with privileged trigger':
      // Only reachable with specific triggers
      isReachable = privilegedTriggers.some(t => triggerContexts.includes(t));
      riskLevel = isReachable ? 'high' : 'informational';
      break;
      
    case 'third-party action usage':
      // Risk depends on when it's executed
      if (executionContext.environmentalFactors.hasPrivilegedTrigger) {
        riskLevel = 'medium';
      } else {
        riskLevel = 'low';
        mitigatingFactors.push('Limited trigger context');
      }
      break;
      
    case 'self-hosted runner detected':
      // Always concerning if present
      isReachable = true;
      riskLevel = executionContext.environmentalFactors.hasPrivilegedTrigger ? 'high' : 'medium';
      break;
      
    case 'overly permissive workflow permissions':
      // Risk depends on what the workflow does
      if (executionContext.environmentalFactors.hasExternalActions) {
        riskLevel = 'medium';
      } else {
        riskLevel = 'low';
        mitigatingFactors.push('No external actions detected');
      }
      break;
  }

  // Check for mitigating factors
  if (requiredConditions.length > 0) {
    mitigatingFactors.push(`Requires conditions: ${requiredConditions.join(', ')}`);
  }
  
  if (!executionContext.environmentalFactors.hasSecrets) {
    mitigatingFactors.push('No secrets in workflow');
  }
  
  if (!executionContext.environmentalFactors.hasPrivilegedTrigger) {
    mitigatingFactors.push('No privileged triggers');
  }

  // Final reachability determination
  if (requiredConditions.some(c => c.includes('false') || c.includes('cancelled()'))) {
    isReachable = false;
    riskLevel = 'informational';
  }

  return {
    isReachable,
    requiredConditions,
    triggerContexts,
    riskLevel,
    mitigatingFactors
  };
}

/**
 * Apply contextual severity adjustments based on reachability analysis
 */
export function applyContextualSeverity(
  issue: AnalysisResult,
  reachability: ReachabilityInfo
): SecurityIssueWithReachability {
  const enhancedIssue: SecurityIssueWithReachability = {
    ...issue,
    reachability,
    originalSeverity: issue.severity
  };

  // Adjust severity based on reachability and risk level
  if (!reachability.isReachable) {
    enhancedIssue.contextualSeverity = 'info';
    enhancedIssue.description += ' (Note: This issue may not be reachable under normal execution conditions)';
  } else {
    switch (reachability.riskLevel) {
      case 'high':
        enhancedIssue.contextualSeverity = 'error';
        break;
      case 'medium':
        enhancedIssue.contextualSeverity = issue.severity === 'error' ? 'warning' : issue.severity;
        break;
      case 'low':
        enhancedIssue.contextualSeverity = 'info';
        break;
      case 'informational':
        enhancedIssue.contextualSeverity = 'info';
        break;
    }
  }

  // Add mitigating factors to suggestion
  if (reachability.mitigatingFactors.length > 0) {
    enhancedIssue.suggestion += ` Mitigating factors: ${reachability.mitigatingFactors.join(', ')}.`;
  }

  // Use contextual severity for final severity
  enhancedIssue.severity = enhancedIssue.contextualSeverity;

  return enhancedIssue;
}

/**
 * Analyze path sensitivity for specific security issues
 */
export function analyzePathSensitivity(
  content: string,
  issue: AnalysisResult
): {
  sensitiveToInput: boolean;
  inputSources: string[];
  dataFlowPaths: string[];
} {
  const inputSources: string[] = [];
  const dataFlowPaths: string[] = [];
  let sensitiveToInput = false;

  // Check for various input sources
  if (content.includes('github.event')) {
    inputSources.push('github.event');
    sensitiveToInput = true;
  }
  
  if (content.includes('github.head_ref') || content.includes('github.base_ref')) {
    inputSources.push('git references');
    sensitiveToInput = true;
  }
  
  if (content.includes('steps.') && content.includes('.outputs.')) {
    inputSources.push('step outputs');
    dataFlowPaths.push('step outputs → current context');
  }
  
  if (content.includes('needs.') && content.includes('.outputs.')) {
    inputSources.push('job outputs');
    dataFlowPaths.push('job outputs → current context');
  }

  // Trace data flows for expression injection issues
  if (issue.title.includes('injection')) {
    const injectionPattern = issue.description.match(/\$\{\{.*?\}\}/g);
    if (injectionPattern) {
      injectionPattern.forEach(pattern => {
        if (pattern.includes('github.event')) {
          dataFlowPaths.push(`${pattern} → direct injection point`);
        }
      });
    }
  }

  return {
    sensitiveToInput,
    inputSources,
    dataFlowPaths
  };
}

/**
 * Main function to enhance security analysis with reachability information
 */
export function enhanceSecurityAnalysisWithReachability(
  securityResults: AnalysisResult[],
  workflow: WorkflowData,
  content: string
): { 
  enhancedResults: SecurityIssueWithReachability[], 
  reachabilityStats: {
    totalIssues: number;
    reachableIssues: number;
    highRiskIssues: number;
    mitigatedIssues: number;
  } 
} {
  const executionContext = analyzeExecutionContext(workflow, content);
  const enhancedResults: SecurityIssueWithReachability[] = [];
  
  let reachableCount = 0;
  let highRiskCount = 0;
  let mitigatedCount = 0;

  securityResults.forEach(issue => {
    const reachability = analyzeReachability(issue, executionContext, workflow);
    const pathSensitivity = analyzePathSensitivity(content, issue);
    
    // Additional context for path-sensitive issues
    if (pathSensitivity.sensitiveToInput && pathSensitivity.inputSources.length > 0) {
      reachability.requiredConditions.push(`Input-dependent: ${pathSensitivity.inputSources.join(', ')}`);
    }
    
    const enhancedIssue = applyContextualSeverity(issue, reachability);
    
    // Update statistics
    if (reachability.isReachable) reachableCount++;
    if (reachability.riskLevel === 'high') highRiskCount++;
    if (reachability.mitigatingFactors.length > 0) mitigatedCount++;
    
    enhancedResults.push(enhancedIssue);
  });

  return {
    enhancedResults,
    reachabilityStats: {
      totalIssues: securityResults.length,
      reachableIssues: reachableCount,
      highRiskIssues: highRiskCount,
      mitigatedIssues: mitigatedCount
    }
  };
}

/**
 * Generate reachability analysis insights
 */
export function generateReachabilityInsights(
  enhancedResults: SecurityIssueWithReachability[],
  executionContext: ExecutionContext
): AnalysisResult[] {
  const insights: AnalysisResult[] = [];

  // Generate trigger-based insights
  if (executionContext.environmentalFactors.hasPrivilegedTrigger) {
    const privilegedIssues = enhancedResults.filter(r => 
      r.reachability?.riskLevel === 'high' && r.reachability.isReachable
    );
    
    if (privilegedIssues.length > 0) {
      insights.push({
        id: 'privileged-trigger-risk',
        type: 'security',
        severity: 'warning',
        title: 'High-Risk Issues with Privileged Triggers',
        description: `${privilegedIssues.length} security issues are reachable through privileged triggers (workflow_run, pull_request_target)`,
        file: '',
        suggestion: 'Review all issues marked as high-risk and consider implementing additional safeguards for privileged trigger workflows.'
      });
    }
  }

  // Generate conditional execution insights
  const conditionalIssues = enhancedResults.filter(r => 
    r.reachability?.requiredConditions && r.reachability.requiredConditions.length > 0
  );
  
  if (conditionalIssues.length > 0) {
    insights.push({
      id: 'conditional-security-issues',
      type: 'security',
      severity: 'info',
      title: 'Conditional Security Issues',
      description: `${conditionalIssues.length} security issues are subject to execution conditions, reducing their immediate risk`,
      file: '',
      suggestion: 'Monitor condition changes that might affect the reachability of these security issues.'
    });
  }

  // Generate mitigation insights
  const mitigatedIssues = enhancedResults.filter(r => 
    r.reachability?.mitigatingFactors && r.reachability.mitigatingFactors.length > 0
  );
  
  if (mitigatedIssues.length > 0) {
    insights.push({
      id: 'mitigated-security-issues',
      type: 'security',
      severity: 'info',
      title: 'Issues with Mitigating Factors',
      description: `${mitigatedIssues.length} security issues have mitigating factors that reduce their effective risk`,
      file: '',
      suggestion: 'Continue to maintain these mitigating factors and ensure they remain effective over time.'
    });
  }

  return insights;
}
