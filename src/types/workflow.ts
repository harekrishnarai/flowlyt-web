export interface WorkflowFile {
  id: string;
  name: string;
  content: string;
  parsed?: WorkflowData;
  error?: string;
  lines?: string[];
  source?: 'upload' | 'github' | 'gitlab';
  repoUrl?: string;
  filePath?: string;
}

export interface WorkflowData {
  name: string;
  on: any;
  jobs: Record<string, Job>;
  env?: Record<string, string>;
  permissions?: any;
  concurrency?: any;
}

export interface Job {
  name?: string;
  'runs-on': string | string[];
  needs?: string[];
  steps: Step[];
  permissions?: Record<string, string> | string;
  env?: Record<string, string>;
  if?: string;
  strategy?: {
    matrix?: Record<string, unknown>;
    'fail-fast'?: boolean;
    'max-parallel'?: number;
  };
  'continue-on-error'?: boolean;
  'timeout-minutes'?: number;
  environment?: string | { name: string; url?: string };
  concurrency?: string | { group: string; 'cancel-in-progress'?: boolean };
}

export interface Step {
  name?: string;
  uses?: string;
  run?: string;
  with?: Record<string, any>;
  env?: Record<string, string>;
  if?: string;
  id?: string;
  'continue-on-error'?: boolean;
}

export interface AnalysisResult {
  id: string;
  type: 'security' | 'performance' | 'best-practice' | 'dependency' | 'structure';
  severity: 'error' | 'warning' | 'info';
  title: string;
  description: string;
  file: string;
  location?: {
    job?: string;
    step?: number;
    line?: number;
  };
  suggestion?: string;
  links?: string[];
  githubUrl?: string; // Direct GitHub permalink to the line
  codeSnippet?: {
    content: string;
    startLine: number;
    endLine: number;
    highlightLine?: number; // Line to highlight within the snippet
  };
}

export interface ReachabilityStats {
  totalIssues: number;
  reachableIssues: number;
  highRiskIssues: number;
  mitigatedIssues: number;
  falsePositiveReduction?: number; // Percentage of issues reclassified
}

export interface AnalysisReport {
  fileId: string;
  fileName: string;
  results: AnalysisResult[];
  callGraphData?: {
    jobDependencies: Array<{ from: string; to: string; type: string; details?: string }>;
    actionUsage: Array<{ action: string; version: string; jobId: string; stepIndex: number }>;
    criticalPaths: string[][];
    isolatedJobs: string[];
  };
  reachabilityData?: {
    stats: ReachabilityStats;
    executionContext: {
      triggers: string[];
      hasPrivilegedTriggers: boolean;
      hasSecrets: boolean;
      conditionalJobs: number;
    };
    insights: AnalysisResult[];
  };
  summary: {
    totalIssues: number;
    errorCount: number;
    warningCount: number;
    infoCount: number;
    score: number;
  };
}

export interface GitHubFile {
  name: string;
  path: string;
  download_url: string;
  type: string;
}

export interface GitLabFile {
  id: string;
  name: string;
  path: string;
  type: 'blob' | 'tree';
  mode: string;
}