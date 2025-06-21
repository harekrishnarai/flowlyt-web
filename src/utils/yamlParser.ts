import yaml from 'js-yaml';
import { WorkflowData, WorkflowFile } from '../types/workflow';

export function parseWorkflowFile(file: WorkflowFile): WorkflowFile {
  try {
    const lines = file.content.split('\n');
    const parsed = yaml.load(file.content) as WorkflowData;
    
    // Validate basic workflow structure
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Invalid YAML structure');
    }
    
    if (!parsed.jobs || typeof parsed.jobs !== 'object') {
      throw new Error('Workflow must contain jobs');
    }
    
    if (!parsed.on) {
      throw new Error('Workflow must specify triggers (on)');
    }
    
    return {
      ...file,
      parsed,
      lines,
      error: undefined
    };
  } catch (error) {
    return {
      ...file,
      parsed: undefined,
      lines: file.content.split('\n'),
      error: error instanceof Error ? error.message : 'Failed to parse YAML'
    };
  }
}

export function findLineNumber(content: string, searchText: string): number {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(searchText)) {
      return i + 1; // Line numbers are 1-based
    }
  }
  return 0;
}

export function findJobLineNumber(content: string, jobId: string): number {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith(`${jobId}:`) && lines[i].includes(':')) {
      return i + 1;
    }
  }
  return 0;
}

export function findStepLineNumber(content: string, jobId: string, stepIndex: number): number {
  const lines = content.split('\n');
  let jobFound = false;
  let stepsFound = false;
  let stepCount = 0;
  let indentLevel = -1;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    
    // Find the job
    if (trimmedLine.startsWith(`${jobId}:`)) {
      jobFound = true;
      indentLevel = line.search(/\S/); // Get indentation level
      continue;
    }
    
    if (jobFound) {
      const currentIndent = line.search(/\S/);
      
      // If we're back to the same or lesser indentation level, we've left this job
      if (currentIndent >= 0 && currentIndent <= indentLevel && trimmedLine.match(/^[a-zA-Z_][a-zA-Z0-9_-]*:/)) {
        break;
      }
      
      // Look for steps section
      if (trimmedLine === 'steps:') {
        stepsFound = true;
        continue;
      }
      
      if (stepsFound) {
        // Look for step indicators (must start with dash and be properly indented)
        if (trimmedLine.startsWith('-') && (trimmedLine.includes('name:') || trimmedLine.includes('uses:') || trimmedLine.includes('run:'))) {
          if (stepCount === stepIndex) {
            return i + 1;
          }
          stepCount++;
        }
        // Also check for multi-line steps where the dash is on its own line
        else if (trimmedLine === '-') {
          if (stepCount === stepIndex) {
            return i + 1;
          }
          stepCount++;
        }
      }
    }
  }
  
  return 0;
}

export function validateWorkflowSchema(workflow: WorkflowData): string[] {
  const errors: string[] = [];
  
  // Check jobs
  Object.entries(workflow.jobs).forEach(([jobId, job]) => {
    if (!job['runs-on']) {
      errors.push(`Job '${jobId}' is missing 'runs-on' specification`);
    }
    
    if (!job.steps || !Array.isArray(job.steps) || job.steps.length === 0) {
      errors.push(`Job '${jobId}' must have at least one step`);
    }
    
    // Validate steps
    job.steps.forEach((step, index) => {
      if (!step.uses && !step.run) {
        errors.push(`Job '${jobId}', step ${index + 1}: must specify either 'uses' or 'run'`);
      }
    });
  });
  
  return errors;
}

/**
 * Extract a code snippet around a specific line number with context
 */
export function extractCodeSnippet(
  content: string, 
  targetLine: number, 
  contextLines: number = 3
): { content: string; startLine: number; endLine: number; highlightLine: number } | null {
  if (!targetLine || targetLine <= 0) {
    return null;
  }

  const lines = content.split('\n');
  const totalLines = lines.length;
  
  // Calculate start and end lines with context
  const startLine = Math.max(1, targetLine - contextLines);
  const endLine = Math.min(totalLines, targetLine + contextLines);
  
  // Extract the snippet
  const snippetLines = lines.slice(startLine - 1, endLine);
  const snippetContent = snippetLines.join('\n');
  
  // Calculate the highlight line within the snippet (1-based)
  const highlightLine = targetLine - startLine + 1;
  
  return {
    content: snippetContent,
    startLine,
    endLine,
    highlightLine
  };
}

/**
 * Extract a code snippet for a specific job
 */
export function extractJobSnippet(content: string, jobId: string): { content: string; startLine: number; endLine: number } | null {
  const lines = content.split('\n');
  let jobStartLine = -1;
  let jobEndLine = -1;
  let jobIndentLevel = -1;

  // Find job start
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    
    if (trimmedLine.startsWith(`${jobId}:`)) {
      jobStartLine = i + 1;
      jobIndentLevel = line.search(/\S/);
      break;
    }
  }

  if (jobStartLine === -1) return null;

  // Find job end
  for (let i = jobStartLine; i < lines.length; i++) {
    const line = lines[i];
    const currentIndent = line.search(/\S/);
    
    // If we find another job at the same level or higher, we've reached the end
    if (currentIndent >= 0 && currentIndent <= jobIndentLevel && line.trim().match(/^[a-zA-Z_][a-zA-Z0-9_-]*:/) && i > jobStartLine) {
      jobEndLine = i;
      break;
    }
  }

  // If no end found, use end of file
  if (jobEndLine === -1) {
    jobEndLine = lines.length;
  }

  const jobLines = lines.slice(jobStartLine - 1, jobEndLine);
  return {
    content: jobLines.join('\n'),
    startLine: jobStartLine,
    endLine: jobEndLine
  };
}

/**
 * Extract a code snippet for a specific step within a job
 */
export function extractStepSnippet(content: string, jobId: string, stepIndex: number): { content: string; startLine: number; endLine: number; highlightLine: number } | null {
  const stepLineNumber = findStepLineNumber(content, jobId, stepIndex);
  if (!stepLineNumber) return null;

  const lines = content.split('\n');
  let stepStartLine = stepLineNumber;
  let stepEndLine = stepLineNumber;
  let stepIndentLevel = -1;
  let foundStepStart = false;

  // Find the actual step start and its indentation
  for (let i = stepLineNumber - 1; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    
    if (trimmedLine.startsWith('-') && !foundStepStart) {
      stepStartLine = i + 1;
      stepIndentLevel = line.search(/\S/);
      foundStepStart = true;
      continue;
    }

    if (foundStepStart) {
      const currentIndent = line.search(/\S/);
      
      // If we find another step (starts with -) at the same level, we've reached the end
      if (currentIndent >= 0 && currentIndent <= stepIndentLevel && trimmedLine.startsWith('-')) {
        stepEndLine = i;
        break;
      }
      
      // If we find content at job level or higher, we've reached the end
      if (currentIndent >= 0 && currentIndent < stepIndentLevel && trimmedLine.match(/^[a-zA-Z_]/)) {
        stepEndLine = i;
        break;
      }
    }
  }

  // If no end found, look for next step or job
  if (stepEndLine === stepLineNumber) {
    stepEndLine = Math.min(lines.length, stepStartLine + 10); // Default to 10 lines max
  }

  const stepLines = lines.slice(stepStartLine - 1, stepEndLine);
  return {
    content: stepLines.join('\n'),
    startLine: stepStartLine,
    endLine: stepEndLine,
    highlightLine: stepLineNumber - stepStartLine + 1
  };
}