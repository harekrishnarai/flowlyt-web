import { WorkflowData, AnalysisResult } from '../../types/workflow';
import { findLineNumber, findStepLineNumber } from '../yamlParser';
import { GitHubAnalysisContext } from '../workflowAnalyzer';

// Helper function to create GitHub permalink for specific line
function createGitHubLink(githubContext: GitHubAnalysisContext, lineNumber?: number): string | undefined {
  if (!githubContext.repoUrl || !githubContext.filePath || !lineNumber) {
    return undefined;
  }
  
  const branch = githubContext.branch || 'main';
  return `${githubContext.repoUrl}/blob/${branch}/${githubContext.filePath}#L${lineNumber}`;
}

export function analyzeSecurityIssues(
  workflow: WorkflowData, 
  fileName: string, 
  content: string, 
  githubContext: GitHubAnalysisContext = {}
): AnalysisResult[] {
  const results: AnalysisResult[] = [];
  
  // Enhanced secret patterns for comprehensive detection
  const secretPatterns = [
    { pattern: /password\s*[:=]\s*['"]\w+['"]/, name: 'password' },
    { pattern: /token\s*[:=]\s*['"]\w+['"]/, name: 'token' },
    { pattern: /key\s*[:=]\s*['"]\w+['"]/, name: 'API key' },
    { pattern: /secret\s*[:=]\s*['"]\w+['"]/, name: 'secret' },
    { pattern: /aws_access_key_id\s*[:=]\s*['"]\w+['"]/, name: 'AWS access key' },
    { pattern: /aws_secret_access_key\s*[:=]\s*['"]\w+['"]/, name: 'AWS secret key' },
    { pattern: /github_token\s*[:=]\s*['"]\w+['"]/, name: 'GitHub token' },
    { pattern: /api_key\s*[:=]\s*['"]\w+['"]/, name: 'API key' },
    { pattern: /client_secret\s*[:=]\s*['"]\w+['"]/, name: 'client secret' },
    { pattern: /private_key\s*[:=]\s*['"]\w+['"]/, name: 'private key' },
    { pattern: /ssh_key\s*[:=]\s*['"]\w+['"]/, name: 'SSH key' },
    { pattern: /database_url\s*[:=]\s*['"]\w+['"]/, name: 'database URL' },
    { pattern: /connection_string\s*[:=]\s*['"]\w+['"]/, name: 'connection string' },
    // Common token formats
    { pattern: /['"]\b[A-Za-z0-9_-]{20,}['"]/, name: 'potential token' },
    // Base64 encoded secrets (common pattern)
    { pattern: /['"]\b[A-Za-z0-9+/]{40,}={0,2}['"]/, name: 'potential base64 secret' },
    // JWT tokens
    { pattern: /['"]\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+['"]/, name: 'JWT token' },
  ];
  
  secretPatterns.forEach(({ pattern, name }) => {
    const matches = content.matchAll(new RegExp(pattern.source, 'gi'));
    for (const match of matches) {
      // Skip if it's clearly referencing a secret (contains ${{ secrets. or env.)
      if (match[0].includes('${{') || match[0].includes('secrets.') || match[0].includes('env.')) {
        continue;
      }
      
      const lineNumber = findLineNumber(content, match[0]);
      const githubLink = createGitHubLink(githubContext, lineNumber);
      
      results.push({
        id: `hardcoded-${name}-${Date.now()}-${Math.random()}`,
        type: 'security',
        severity: 'error',
        title: `Hardcoded ${name} detected`,
        description: `Found potential hardcoded ${name} in workflow. Use GitHub Secrets instead.`,
        file: fileName,
        location: { line: lineNumber },
        suggestion: `Store sensitive values in GitHub Secrets and reference them using \${{ secrets.SECRET_NAME }}`,
        links: ['https://docs.github.com/en/actions/security-guides/encrypted-secrets'],
        githubUrl: githubLink
      });
    }
  });

  // Check for sensitive information in logs/output
  const sensitiveLogPatterns = [
    /echo.*password/i,
    /echo.*token/i,
    /echo.*secret/i,
    /echo.*key/i,
    /print.*password/i,
    /print.*token/i,
    /printf.*password/i,
    /console\.log.*password/i,
    /console\.log.*token/i,
    /cat.*\.env/i,
    /cat.*config/i,
  ];

  sensitiveLogPatterns.forEach(pattern => {
    const matches = content.matchAll(new RegExp(pattern.source, 'gi'));
    for (const match of matches) {
      const lineNumber = findLineNumber(content, match[0]);
      const githubLink = createGitHubLink(githubContext, lineNumber);
      
      results.push({
        id: `sensitive-log-${Date.now()}-${Math.random()}`,
        type: 'security',
        severity: 'warning',
        title: 'Potential sensitive information in logs',
        description: `Command may expose sensitive information in logs: ${match[0]}`,
        file: fileName,
        location: { line: lineNumber },
        suggestion: 'Avoid printing sensitive information to logs. Use secure methods for debugging.',
        links: ['https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions'],
        githubUrl: githubLink
      });
    }
  });

  // Check for malicious network calls and data exfiltration
  const suspiciousNetworkPatterns = [
    /curl.*http[s]?:\/\/(?!github\.com|api\.github\.com|raw\.githubusercontent\.com)/i,
    /wget.*http[s]?:\/\/(?!github\.com|api\.github\.com|raw\.githubusercontent\.com)/i,
    /fetch.*http[s]?:\/\/(?!github\.com|api\.github\.com|raw\.githubusercontent\.com)/i,
    /nc\s+\d+\.\d+\.\d+\.\d+/i, // netcat to IP address
    /telnet\s+\d+\.\d+\.\d+\.\d+/i,
    /scp.*@/i, // SCP transfers
    /rsync.*@/i, // rsync transfers
    /mail\s+/i, // email commands
    /sendmail/i,
    /base64.*\|.*curl/i, // base64 encoding piped to curl (common exfiltration)
    /tar.*\|.*curl/i, // archive and send
  ];

  suspiciousNetworkPatterns.forEach(pattern => {
    const matches = content.matchAll(new RegExp(pattern.source, 'gi'));
    for (const match of matches) {
      const lineNumber = findLineNumber(content, match[0]);
      const githubLink = createGitHubLink(githubContext, lineNumber);
      
      results.push({
        id: `suspicious-network-${Date.now()}-${Math.random()}`,
        type: 'security',
        severity: 'error',
        title: 'Suspicious network activity detected',
        description: `Potentially malicious network call or data exfiltration: ${match[0]}`,
        file: fileName,
        location: { line: lineNumber },
        suggestion: 'Review this network activity carefully. Ensure it\'s legitimate and not exfiltrating sensitive data.',
        links: ['https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions'],
        githubUrl: githubLink
      });
    }
  });

  // Check for environment variable exfiltration
  const envExfiltrationPatterns = [
    /env\s*\|\s*curl/i,
    /printenv\s*\|\s*curl/i,
    /export\s*\|\s*curl/i,
    /set\s*\|\s*curl/i,
    /env.*base64/i,
    /printenv.*base64/i,
  ];

  envExfiltrationPatterns.forEach(pattern => {
    const matches = content.matchAll(new RegExp(pattern.source, 'gi'));
    for (const match of matches) {
      const lineNumber = findLineNumber(content, match[0]);
      const githubLink = createGitHubLink(githubContext, lineNumber);
      
      results.push({
        id: `env-exfiltration-${Date.now()}-${Math.random()}`,
        type: 'security',
        severity: 'error',
        title: 'Environment variable exfiltration detected',
        description: `Command may be exfiltrating environment variables: ${match[0]}`,
        file: fileName,
        location: { line: lineNumber },
        suggestion: 'This pattern suggests environment variable exfiltration. Remove or secure this command.',
        links: ['https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions'],
        githubUrl: githubLink
      });
    }
  });
  
  // Check for overly permissive permissions
  if (workflow.permissions) {
    const permissions = workflow.permissions;
    if (permissions === 'write-all' || (typeof permissions === 'object' && permissions.contents === 'write')) {
      const lineNumber = findLineNumber(content, 'permissions:');
      const githubLink = createGitHubLink(githubContext, lineNumber);
      
      results.push({
        id: `permissions-${Date.now()}`,
        type: 'security',
        severity: 'warning',
        title: 'Overly permissive workflow permissions',
        description: 'Workflow has write permissions that may be unnecessary.',
        file: fileName,
        location: { line: lineNumber },
        suggestion: 'Use minimal required permissions. Consider using job-level permissions instead.',
        links: ['https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions#permissions'],
        githubUrl: githubLink
      });
    }
  }
  
  // Check for third-party actions without pinned versions and SHA pinning
  Object.entries(workflow.jobs).forEach(([jobId, job]) => {
    // Skip if job doesn't have steps or steps is not an array
    if (!job.steps || !Array.isArray(job.steps)) {
      return;
    }
    
    job.steps.forEach((step, stepIndex) => {
      const stepLineNumber = findStepLineNumber(content, jobId, stepIndex);
      
      if (step.uses) {
        const githubLink = createGitHubLink(githubContext, stepLineNumber);
        
        // Check for unpinned actions (no version at all)
        if (!step.uses.includes('@')) {
          results.push({
            id: `unpinned-action-${jobId}-${stepIndex}`,
            type: 'security',
            severity: 'error',
            title: 'Unpinned action version',
            description: `Step uses '${step.uses}' without any version specification`,
            file: fileName,
            location: { job: jobId, step: stepIndex, line: stepLineNumber },
            suggestion: 'Pin actions to specific versions or SHA hashes for better security',
            links: ['https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions'],
            githubUrl: githubLink
          });
        } else {
          // Check for version pinning vs SHA pinning
          const [actionName, version] = step.uses.split('@');
          
          // Check if it's using a SHA (40 character hex string)
          const isSHA = /^[a-f0-9]{40}$/i.test(version);
          
          // Check if it's using a tag/branch instead of SHA
          if (!isSHA && version) {
            // Allow official GitHub actions to use semantic versions, but warn about others
            const actionOwner = actionName.split('/')[0];
            const isOfficialGitHubAction = ['actions', 'github'].includes(actionOwner);
            
            if (!isOfficialGitHubAction) {
              results.push({
                id: `non-sha-pinned-${jobId}-${stepIndex}`,
                type: 'security',
                severity: 'warning',
                title: 'Action not pinned to SHA',
                description: `Third-party action '${step.uses}' is pinned to '${version}' instead of a SHA commit`,
                file: fileName,
                location: { job: jobId, step: stepIndex, line: stepLineNumber },
                suggestion: 'For maximum security, pin third-party actions to specific SHA commits instead of tags or branches',
                links: ['https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions#using-third-party-actions'],
                githubUrl: githubLink
              });
            } else if (version.startsWith('v') && version.includes('.')) {
              // Official actions using semantic versioning - this is acceptable but inform about SHA option
              results.push({
                id: `semantic-version-${jobId}-${stepIndex}`,
                type: 'security',
                severity: 'info',
                title: 'Consider SHA pinning for enhanced security',
                description: `Official action '${step.uses}' uses semantic versioning. Consider SHA pinning for maximum security`,
                file: fileName,
                location: { job: jobId, step: stepIndex, line: stepLineNumber },
                suggestion: 'While semantic versioning is acceptable for official actions, SHA pinning provides the highest security guarantee',
                links: ['https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions#using-third-party-actions'],
                githubUrl: githubLink
              });
            }
          }
        }
        
        // Check for actions from untrusted sources (enhanced detection)
        const actionOwner = step.uses.split('/')[0];
        const trustedOwners = [
          'actions', 'github', 'docker', 'microsoft', 'azure', 'aws-actions', 
          'google-github-actions', 'hashicorp', 'codecov', 'sonarqube-quality-gate-action'
        ];
        
        if (!trustedOwners.includes(actionOwner)) {
          const severity = step.uses.includes('@') && /^[a-f0-9]{40}$/i.test(step.uses.split('@')[1]) ? 'info' : 'warning';
          
          results.push({
            id: `untrusted-action-${jobId}-${stepIndex}`,
            type: 'security',
            severity: severity,
            title: 'Third-party action usage',
            description: `Using action from '${actionOwner}' - verify trustworthiness and security practices`,
            file: fileName,
            location: { job: jobId, step: stepIndex, line: stepLineNumber },
            suggestion: 'Review the action source code, check its reputation, and ensure it\'s pinned to a specific SHA for security',
            links: ['https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions'],
            githubUrl: githubLink
          });
        }
      }
    });
  });
  
  // Check for insecure script execution patterns
  const insecureScriptPatterns = [
    /eval\s*\(/i,
    /exec\s*\(/i,
    /system\s*\(/i,
    /shell_exec/i,
    /passthru/i,
    /\|\s*sh\s*$/i,
    /\|\s*bash\s*$/i,
    /\|\s*zsh\s*$/i,
    /wget.*\|\s*sh/i,
    /curl.*\|\s*sh/i,
    /curl.*\|\s*bash/i,
  ];

  insecureScriptPatterns.forEach(pattern => {
    const matches = content.matchAll(new RegExp(pattern.source, 'gi'));
    for (const match of matches) {
      const lineNumber = findLineNumber(content, match[0]);
      const githubLink = createGitHubLink(githubContext, lineNumber);
      
      results.push({
        id: `insecure-script-${Date.now()}-${Math.random()}`,
        type: 'security',
        severity: 'warning',
        title: 'Insecure script execution pattern',
        description: `Potentially dangerous script execution: ${match[0]}`,
        file: fileName,
        location: { line: lineNumber },
        suggestion: 'Avoid piping untrusted content to shell interpreters. Validate and sanitize all inputs.',
        links: ['https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions'],
        githubUrl: githubLink
      });
    }
  });

  // Check for potential supply chain attacks
  const supplyChainPatterns = [
    /npm\s+install.*-g/i, // Global npm installs
    /pip\s+install.*git\+/i, // Pip install from git
    /gem\s+install.*--source/i, // Gem install from custom source
    /go\s+get.*\/\.\.\./i, // Go get with relative paths
    /docker\s+run.*--privileged/i, // Privileged Docker containers
    /sudo\s+.*install/i, // Sudo installations
  ];

  supplyChainPatterns.forEach(pattern => {
    const matches = content.matchAll(new RegExp(pattern.source, 'gi'));
    for (const match of matches) {
      const lineNumber = findLineNumber(content, match[0]);
      const githubLink = createGitHubLink(githubContext, lineNumber);
      
      results.push({
        id: `supply-chain-risk-${Date.now()}-${Math.random()}`,
        type: 'security',
        severity: 'info',
        title: 'Potential supply chain security risk',
        description: `Command may introduce supply chain vulnerabilities: ${match[0]}`,
        file: fileName,
        location: { line: lineNumber },
        suggestion: 'Review the security of packages/dependencies being installed. Use lock files and verify checksums when possible.',
        links: ['https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions'],
        githubUrl: githubLink
      });
    }
  });

  return results;
}