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