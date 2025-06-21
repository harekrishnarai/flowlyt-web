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
  let stepCount = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (line.startsWith(`${jobId}:`)) {
      jobFound = true;
      continue;
    }
    
    if (jobFound) {
      // Check if we've moved to another job
      if (line.match(/^[a-zA-Z_][a-zA-Z0-9_-]*:$/) && !line.includes('steps:')) {
        break;
      }
      
      // Look for step indicators
      if (line.startsWith('- name:') || line.startsWith('- uses:') || line.startsWith('- run:')) {
        if (stepCount === stepIndex) {
          return i + 1;
        }
        stepCount++;
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