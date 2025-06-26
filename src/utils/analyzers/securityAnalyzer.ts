import { WorkflowData, AnalysisResult } from '../../types/workflow';
import { findLineNumber, findStepLineNumber, extractCodeSnippet, extractStepSnippet } from '../yamlParser';
import { GitHubAnalysisContext } from '../workflowAnalyzer';
import { getSHARecommendation, isActionInDatabase, isVersionOutdated } from '../actionHashDatabase';

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
  const processedLines = new Set<string>(); // Track processed line+type combinations to avoid duplicates
  
  // Enhanced secret patterns for comprehensive detection (ordered by specificity)
  const secretPatterns = [
    // Most specific patterns first
    { pattern: /aws_access_key_id\s*[:=]\s*['"]\w+['"]/, name: 'AWS access key', priority: 1 },
    { pattern: /aws_secret_access_key\s*[:=]\s*['"]\w+['"]/, name: 'AWS secret key', priority: 1 },
    { pattern: /github_token\s*[:=]\s*['"]\w+['"]/, name: 'GitHub token', priority: 1 },
    { pattern: /api_key\s*[:=]\s*['"]\w+['"]/, name: 'API key', priority: 1 },
    { pattern: /client_secret\s*[:=]\s*['"]\w+['"]/, name: 'client secret', priority: 1 },
    { pattern: /private_key\s*[:=]\s*['"]\w+['"]/, name: 'private key', priority: 1 },
    { pattern: /ssh_key\s*[:=]\s*['"]\w+['"]/, name: 'SSH key', priority: 1 },
    { pattern: /database_url\s*[:=]\s*['"]\w+['"]/, name: 'database URL', priority: 1 },
    { pattern: /connection_string\s*[:=]\s*['"]\w+['"]/, name: 'connection string', priority: 1 },
    // JWT tokens (very specific pattern)
    { pattern: /['"]\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+['"]/, name: 'JWT token', priority: 2 },
    // Less specific patterns
    { pattern: /password\s*[:=]\s*['"]\w+['"]/, name: 'password', priority: 3 },
    { pattern: /token\s*[:=]\s*['"]\w+['"]/, name: 'token', priority: 3 },
    { pattern: /key\s*[:=]\s*['"]\w+['"]/, name: 'key', priority: 3 },
    { pattern: /secret\s*[:=]\s*['"]\w+['"]/, name: 'secret', priority: 3 },
    // Generic patterns (lowest priority)
    { pattern: /['"]\b[A-Za-z0-9+/]{40,}={0,2}['"]/, name: 'potential base64 secret', priority: 4 },
    { pattern: /['"]\b[A-Za-z0-9_-]{20,}['"]/, name: 'potential token', priority: 5 },
  ];
  
  // Group patterns by line and only keep the highest priority match per line
  const lineMatches = new Map<number, { pattern: any, match: RegExpMatchArray }>();
  
  secretPatterns.forEach(({ pattern, name, priority }) => {
    const matches = content.matchAll(new RegExp(pattern.source, 'gi'));
    for (const match of matches) {
      // Skip if it's clearly referencing a secret (contains ${{ secrets. or env.)
      if (match[0].includes('${{') || match[0].includes('secrets.') || match[0].includes('env.')) {
        continue;
      }
      
      const lineNumber = findLineNumber(content, match[0]);
      const existingMatch = lineMatches.get(lineNumber);
      
      // Only keep this match if it's higher priority (lower number = higher priority)
      if (!existingMatch || priority < existingMatch.pattern.priority) {
        lineMatches.set(lineNumber, { 
          pattern: { pattern, name, priority }, 
          match 
        });
      }
    }
  });
  
  // Process the deduplicated matches
  lineMatches.forEach(({ pattern, match }) => {
    const lineNumber = findLineNumber(content, match[0]);
    const githubLink = createGitHubLink(githubContext, lineNumber);
    const codeSnippet = extractCodeSnippet(content, lineNumber, 2);
    
    results.push({
      id: `hardcoded-${pattern.name.replace(/\s+/g, '-')}-${lineNumber}`,
      type: 'security',
      severity: 'error',
      title: `Hardcoded ${pattern.name} detected`,
      description: `Found potential hardcoded ${pattern.name} in workflow. Use GitHub Secrets instead.`,
      file: fileName,
      location: { line: lineNumber },
      suggestion: `Store sensitive values in GitHub Secrets and reference them using \${{ secrets.SECRET_NAME }}`,
      links: ['https://docs.github.com/en/actions/security-guides/encrypted-secrets'],
      githubUrl: githubLink,
      codeSnippet: codeSnippet || undefined
    });
  });

  // Check for sensitive information in logs/output with deduplication
  const sensitiveLogPatterns = [
    { pattern: /echo.*password/i, type: 'password logging' },
    { pattern: /echo.*token/i, type: 'token logging' },
    { pattern: /echo.*secret/i, type: 'secret logging' },
    { pattern: /echo.*key/i, type: 'key logging' },
    { pattern: /print.*password/i, type: 'password logging' },
    { pattern: /print.*token/i, type: 'token logging' },
    { pattern: /printf.*password/i, type: 'password logging' },
    { pattern: /console\.log.*password/i, type: 'password logging' },
    { pattern: /console\.log.*token/i, type: 'token logging' },
    { pattern: /cat.*\.env/i, type: 'environment file access' },
    { pattern: /cat.*config/i, type: 'config file access' },
  ];

  const logLineMatches = new Map<number, { pattern: any, match: RegExpMatchArray }>();

  sensitiveLogPatterns.forEach(({ pattern, type }) => {
    const matches = content.matchAll(new RegExp(pattern.source, 'gi'));
    for (const match of matches) {
      const lineNumber = findLineNumber(content, match[0]);
      const lineKey = `${lineNumber}-sensitive-log`;
      
      if (!processedLines.has(lineKey)) {
        logLineMatches.set(lineNumber, { pattern: { pattern, type }, match });
        processedLines.add(lineKey);
      }
    }
  });

  logLineMatches.forEach(({ pattern, match }) => {
    const lineNumber = findLineNumber(content, match[0]);
    const githubLink = createGitHubLink(githubContext, lineNumber);
    const codeSnippet = extractCodeSnippet(content, lineNumber, 2);
    
    results.push({
      id: `sensitive-log-${lineNumber}`,
      type: 'security',
      severity: 'warning',
      title: 'Potential sensitive information in logs',
      description: `Command may expose sensitive information in logs: ${match[0]} (${pattern.type})`,
      file: fileName,
      location: { line: lineNumber },
      suggestion: 'Avoid printing sensitive information to logs. Use secure methods for debugging.',
      links: ['https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions'],
      githubUrl: githubLink,
      codeSnippet: codeSnippet || undefined
    });
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
      const codeSnippet = extractCodeSnippet(content, lineNumber, 2);
      
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
        githubUrl: githubLink,
        codeSnippet: codeSnippet || undefined
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
      const codeSnippet = extractCodeSnippet(content, lineNumber, 2);
      
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
        githubUrl: githubLink,
        codeSnippet: codeSnippet || undefined
      });
    }
  });
  
  // Check for overly permissive permissions
  if (workflow.permissions) {
    const permissions = workflow.permissions;
    if (permissions === 'write-all' || (typeof permissions === 'object' && permissions.contents === 'write')) {
      const lineNumber = findLineNumber(content, 'permissions:');
      const githubLink = createGitHubLink(githubContext, lineNumber);
      const codeSnippet = extractCodeSnippet(content, lineNumber, 3);
      
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
        githubUrl: githubLink,
        codeSnippet: codeSnippet || undefined
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
        const codeSnippet = extractStepSnippet(content, jobId, stepIndex);
        
        // Enhanced SHA pinning analysis with specific recommendations
        if (!step.uses.includes('@')) {
          // No version specified at all
          const recommendation = getSHARecommendation(step.uses);
          const suggestionText = recommendation 
            ? `Pin to specific version: ${step.uses}@${recommendation.recommendedSHA} (${recommendation.recommendedVersion})`
            : 'Pin actions to specific versions or SHA hashes for better security';

          results.push({
            id: `unpinned-action-${jobId}-${stepIndex}`,
            type: 'security',
            severity: 'error',
            title: 'Unpinned action version',
            description: `Step uses '${step.uses}' without any version specification`,
            file: fileName,
            location: { job: jobId, step: stepIndex, line: stepLineNumber },
            suggestion: suggestionText,
            links: ['https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions'],
            githubUrl: githubLink,
            codeSnippet: codeSnippet || undefined
          });
        } else {
          // Version is specified, analyze pinning strategy
          const [actionName, version] = step.uses.split('@');
          
          // Check if it's using a SHA (40 character hex string)
          const isSHA = /^[a-f0-9]{40}$/i.test(version);
          
          if (isSHA) {
            // Already using SHA - check if it's current
            if (isActionInDatabase(actionName)) {
              const recommendation = getSHARecommendation(actionName, version);
              if (recommendation && recommendation.isUpgrade) {
                results.push({
                  id: `outdated-sha-${jobId}-${stepIndex}`,
                  type: 'security',
                  severity: 'info',
                  title: 'Consider updating to latest SHA',
                  description: `Action '${step.uses}' uses an older SHA. Consider updating to latest stable version`,
                  file: fileName,
                  location: { job: jobId, step: stepIndex, line: stepLineNumber },
                  suggestion: `Update to latest: ${actionName}@${recommendation.recommendedSHA} (${recommendation.recommendedVersion})`,
                  links: ['https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions'],
                  githubUrl: githubLink,
                  codeSnippet: codeSnippet || undefined
                });
              }
            }
          } else {
            // Not using SHA - provide specific recommendations
            const actionOwner = actionName.split('/')[0];
            const isOfficialGitHubAction = ['actions', 'github'].includes(actionOwner);
            const recommendation = getSHARecommendation(actionName, version);
            
            if (!isOfficialGitHubAction) {
              // Third-party action should use SHA
              const suggestionText = recommendation 
                ? `Pin to SHA: ${actionName}@${recommendation.recommendedSHA} # ${recommendation.recommendedVersion}`
                : `Pin to specific SHA commit instead of '${version}'`;

              results.push({
                id: `non-sha-pinned-${jobId}-${stepIndex}`,
                type: 'security',
                severity: 'warning',
                title: 'Action not pinned to SHA',
                description: `Third-party action '${step.uses}' is pinned to '${version}' instead of a SHA commit`,
                file: fileName,
                location: { job: jobId, step: stepIndex, line: stepLineNumber },
                suggestion: suggestionText,
                links: ['https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions#using-third-party-actions'],
                githubUrl: githubLink,
                codeSnippet: codeSnippet || undefined
              });
            } else if (version.startsWith('v') && version.includes('.')) {
              // Official actions - suggest SHA for maximum security
              const suggestionText = recommendation 
                ? `For maximum security, pin to SHA: ${actionName}@${recommendation.recommendedSHA} # ${recommendation.recommendedVersion}`
                : 'Consider SHA pinning for maximum security';

              results.push({
                id: `semantic-version-${jobId}-${stepIndex}`,
                type: 'security',
                severity: 'info',
                title: 'Consider SHA pinning for enhanced security',
                description: `Official action '${step.uses}' uses semantic versioning. Consider SHA pinning for maximum security`,
                file: fileName,
                location: { job: jobId, step: stepIndex, line: stepLineNumber },
                suggestion: suggestionText,
                links: ['https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions#using-third-party-actions'],
                githubUrl: githubLink,
                codeSnippet: codeSnippet || undefined
              });
            }

            // Check for outdated versions
            if (isActionInDatabase(actionName) && isVersionOutdated(actionName, version)) {
              const latestRecommendation = getSHARecommendation(actionName);
              if (latestRecommendation) {
                results.push({
                  id: `outdated-version-${jobId}-${stepIndex}`,
                  type: 'security',
                  severity: 'warning',
                  title: 'Outdated action version',
                  description: `Action '${step.uses}' is using an outdated version`,
                  file: fileName,
                  location: { job: jobId, step: stepIndex, line: stepLineNumber },
                  suggestion: `Update to latest: ${actionName}@${latestRecommendation.recommendedSHA} # ${latestRecommendation.recommendedVersion}`,
                  links: ['https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions'],
                  githubUrl: githubLink,
                  codeSnippet: codeSnippet || undefined
                });
              }
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
            githubUrl: githubLink,
            codeSnippet: codeSnippet || undefined
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
      const codeSnippet = extractCodeSnippet(content, lineNumber, 2);
      
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
        githubUrl: githubLink,
        codeSnippet: codeSnippet || undefined
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
      const codeSnippet = extractCodeSnippet(content, lineNumber, 2);
      
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
        githubUrl: githubLink,
        codeSnippet: codeSnippet || undefined
      });
    }
  });

  return results;
}