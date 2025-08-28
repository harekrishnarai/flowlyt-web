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

  // Check for dangerous checkout patterns
  const dangerousCheckoutPatterns = [
    /workflow_run|pull_request_target/,
    /actions\/checkout/
  ];

  // Check if workflow uses dangerous triggers with checkout
  const hasDangerousTrigger = dangerousCheckoutPatterns[0].test(content);
  const hasCheckout = dangerousCheckoutPatterns[1].test(content);

  if (hasDangerousTrigger && hasCheckout) {
    const triggerLineNumber = findLineNumber(content, dangerousCheckoutPatterns[0].source);
    const checkoutLineNumber = findLineNumber(content, dangerousCheckoutPatterns[1].source);
    const githubLink = createGitHubLink(githubContext, triggerLineNumber);
    const codeSnippet = extractCodeSnippet(content, triggerLineNumber, 3);

    results.push({
      id: `dangerous-checkout-${Date.now()}`,
      type: 'security',
      severity: 'error',
      title: 'Dangerous checkout with privileged trigger',
      description: 'Workflow uses workflow_run or pull_request_target trigger with explicit checkout, which can lead to code injection',
      file: fileName,
      location: { line: triggerLineNumber },
      suggestion: 'Avoid explicit checkout with privileged triggers. Use actions/checkout with specific ref or skip checkout entirely.',
      links: ['https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions'],
      githubUrl: githubLink,
      codeSnippet: codeSnippet || undefined
    });
  }

  // Check for dangerous actions with untrusted artifacts
  const dangerousActionPatterns = [
    /actions\/download-artifact/,
    /actions\/upload-artifact/
  ];

  dangerousActionPatterns.forEach(pattern => {
    const matches = content.matchAll(new RegExp(pattern.source, 'gi'));
    for (const match of matches) {
      const lineNumber = findLineNumber(content, match[0]);
      const githubLink = createGitHubLink(githubContext, lineNumber);
      const codeSnippet = extractCodeSnippet(content, lineNumber, 2);

      results.push({
        id: `dangerous-action-${Date.now()}-${Math.random()}`,
        type: 'security',
        severity: 'warning',
        title: 'Dangerous artifact action usage',
        description: `Using '${match[0]}' which can be dangerous with untrusted artifacts from workflow_run triggers`,
        file: fileName,
        location: { line: lineNumber },
        suggestion: 'Validate artifact contents before use. Consider using artifact verification or restricting to trusted sources.',
        links: ['https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions'],
        githubUrl: githubLink,
        codeSnippet: codeSnippet || undefined
      });
    }
  });

  // Check for dangerous writes to GITHUB_ENV/GITHUB_OUTPUT
  const dangerousWritePatterns = [
    /echo.*>>.*GITHUB_ENV/i,
    /echo.*>>.*GITHUB_OUTPUT/i,
    /printf.*>>.*GITHUB_ENV/i,
    /printf.*>>.*GITHUB_OUTPUT/i,
    /set-output.*name/i, // deprecated but still check
  ];

  dangerousWritePatterns.forEach(pattern => {
    const matches = content.matchAll(new RegExp(pattern.source, 'gi'));
    for (const match of matches) {
      const lineNumber = findLineNumber(content, match[0]);
      const githubLink = createGitHubLink(githubContext, lineNumber);
      const codeSnippet = extractCodeSnippet(content, lineNumber, 2);

      results.push({
        id: `dangerous-write-${Date.now()}-${Math.random()}`,
        type: 'security',
        severity: 'error',
        title: 'Dangerous environment/output write',
        description: `Writing to GITHUB_ENV or GITHUB_OUTPUT with potentially user-controlled content: ${match[0]}`,
        file: fileName,
        location: { line: lineNumber },
        suggestion: 'Sanitize user input before writing to environment variables or outputs. Use built-in actions for safer output setting.',
        links: ['https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions'],
        githubUrl: githubLink,
        codeSnippet: codeSnippet || undefined
      });
    }
  });

  // Check for expression injection vulnerabilities
  const expressionInjectionPatterns = [
    /\$\{\{.*github\.event\.issue\.title.*\}\}/i,
    /\$\{\{.*github\.event\.issue\.body.*\}\}/i,
    /\$\{\{.*github\.event\.pull_request\.title.*\}\}/i,
    /\$\{\{.*github\.event\.pull_request\.body.*\}\}/i,
    /\$\{\{.*github\.event\.comment\.body.*\}\}/i,
    /\$\{\{.*github\.event\.review\.body.*\}\}/i,
    /\$\{\{.*github\.event\.pages.*\.page_name.*\}\}/i,
    /\$\{\{.*github\.event\.commits.*\.message.*\}\}/i,
    /\$\{\{.*github\.event\.head_commit\.message.*\}\}/i,
    /\$\{\{.*github\.event\.head_commit\.author\.email.*\}\}/i,
    /\$\{\{.*github\.event\.head_commit\.author\.name.*\}\}/i,
    /\$\{\{.*github\.event\.commits.*\.author\.email.*\}\}/i,
    /\$\{\{.*github\.event\.commits.*\.author\.name.*\}\}/i,
    /\$\{\{.*github\.event\.pull_request\.head\.ref.*\}\}/i,
    /\$\{\{.*github\.event\.pull_request\.head\.label.*\}\}/i,
    /\$\{\{.*github\.event\.pull_request\.head\.repo\.default_branch.*\}\}/i,
    /\$\{\{.*github\.head_ref.*\}\}/i,
    /\$\{\{.*env\..*\}\}/i,
    /\$\{\{.*steps\..*\.outputs\..*\}\}/i,
    /\$\{\{.*needs\..*\.outputs\..*\}\}/i,
  ];

  expressionInjectionPatterns.forEach(pattern => {
    const matches = content.matchAll(new RegExp(pattern.source, 'gi'));
    for (const match of matches) {
      // Skip if it's properly sanitized (basic check for quotes or sanitization functions)
      if (match[0].includes('toJSON') || match[0].includes('fromJSON') || match[0].includes('contains')) {
        continue;
      }

      const lineNumber = findLineNumber(content, match[0]);
      const githubLink = createGitHubLink(githubContext, lineNumber);
      const codeSnippet = extractCodeSnippet(content, lineNumber, 2);

      results.push({
        id: `expression-injection-${Date.now()}-${Math.random()}`,
        type: 'security',
        severity: 'error',
        title: 'Potential expression injection',
        description: `Using user-controlled GitHub context without sanitization: ${match[0]}`,
        file: fileName,
        location: { line: lineNumber },
        suggestion: 'Sanitize user input before using in expressions. Use actions/github-script for safer processing.',
        links: ['https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions'],
        githubUrl: githubLink,
        codeSnippet: codeSnippet || undefined
      });
    }
  });

  // Check for self-hosted runners (non-ephemeral)
  const selfHostedRunnerPatterns = [
    /runs-on:\s*['"]?self-hosted['"]?/i,
    /runs-on:\s*['"]?[^'"]*-hosted[^'"]*['"]?/i,
    /runs-on:\s*\[.*self-hosted.*\]/i,
  ];

  selfHostedRunnerPatterns.forEach(pattern => {
    const matches = content.matchAll(new RegExp(pattern.source, 'gi'));
    for (const match of matches) {
      const lineNumber = findLineNumber(content, match[0]);
      const githubLink = createGitHubLink(githubContext, lineNumber);
      const codeSnippet = extractCodeSnippet(content, lineNumber, 2);

      results.push({
        id: `runner-label-${Date.now()}-${Math.random()}`,
        type: 'security',
        severity: 'warning',
        title: 'Self-hosted runner usage',
        description: 'Using self-hosted runners which may not be ephemeral and could be backdoored',
        file: fileName,
        location: { line: lineNumber },
        suggestion: 'Ensure self-hosted runners are ephemeral. Use GitHub-hosted runners when possible.',
        links: ['https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions'],
        githubUrl: githubLink,
        codeSnippet: codeSnippet || undefined
      });
    }
  });

  // Check for unsecure commands (set-env usage)
  const unsecureCommandPatterns = [
    /set-env/i,
    /ACTIONS_ALLOW_UNSECURE_COMMANDS/i,
  ];

  unsecureCommandPatterns.forEach(pattern => {
    const matches = content.matchAll(new RegExp(pattern.source, 'gi'));
    for (const match of matches) {
      const lineNumber = findLineNumber(content, match[0]);
      const githubLink = createGitHubLink(githubContext, lineNumber);
      const codeSnippet = extractCodeSnippet(content, lineNumber, 2);

      results.push({
        id: `unsecure-commands-${Date.now()}-${Math.random()}`,
        type: 'security',
        severity: 'error',
        title: 'Deprecated unsecure commands',
        description: `Using deprecated set-env command or ACTIONS_ALLOW_UNSECURE_COMMANDS: ${match[0]}`,
        file: fileName,
        location: { line: lineNumber },
        suggestion: 'Use $GITHUB_ENV and $GITHUB_OUTPUT instead of set-env. Remove ACTIONS_ALLOW_UNSECURE_COMMANDS.',
        links: ['https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions'],
        githubUrl: githubLink,
        codeSnippet: codeSnippet || undefined
      });
    }
  });

  // Check for bot check bypass patterns
  const botCheckPatterns = [
    /if:\s*github\.actor\s*==\s*['"]dependabot\[bot\]['"]/i,
    /if:\s*github\.actor\s*==\s*['"]dependabot['"]/i,
  ];

  botCheckPatterns.forEach(pattern => {
    const matches = content.matchAll(new RegExp(pattern.source, 'gi'));
    for (const match of matches) {
      const lineNumber = findLineNumber(content, match[0]);
      const githubLink = createGitHubLink(githubContext, lineNumber);
      const codeSnippet = extractCodeSnippet(content, lineNumber, 2);

      results.push({
        id: `bot-check-${Date.now()}-${Math.random()}`,
        type: 'security',
        severity: 'warning',
        title: 'Dependabot check bypass vulnerability',
        description: 'Workflow can be bypassed by triggering Dependabot on a forked repository',
        file: fileName,
        location: { line: lineNumber },
        suggestion: 'Use github.event.pull_request.head.repo.full_name to verify the source repository.',
        links: ['https://www.synacktiv.com/publications/github-actions-exploitation-dependabot'],
        githubUrl: githubLink,
        codeSnippet: codeSnippet || undefined
      });
    }
  });

  // Check for dangerous artifact uploads
  const dangerousArtifactPatterns = [
    /actions\/upload-artifact/i,
    /upload-artifact/i,
  ];

  dangerousArtifactPatterns.forEach(pattern => {
    const matches = content.matchAll(new RegExp(pattern.source, 'gi'));
    for (const match of matches) {
      const lineNumber = findLineNumber(content, match[0]);
      const githubLink = createGitHubLink(githubContext, lineNumber);
      const codeSnippet = extractCodeSnippet(content, lineNumber, 3);

      results.push({
        id: `dangerous-artefact-${Date.now()}-${Math.random()}`,
        type: 'security',
        severity: 'info',
        title: 'Artifact upload detected',
        description: 'Uploading artifacts - ensure no sensitive files like .git/config are included',
        file: fileName,
        location: { line: lineNumber },
        suggestion: 'Review artifact contents to ensure no sensitive files are included. Use .gitignore patterns.',
        links: ['https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions'],
        githubUrl: githubLink,
        codeSnippet: codeSnippet || undefined
      });
    }
  });

  // Check for local action usage
  const localActionPatterns = [
    /uses:\s*\.\//i,
    /uses:\s*\.\./i,
    /uses:\s*['"]?\.\/[^'"]*['"]?/i,
  ];

  localActionPatterns.forEach(pattern => {
    const matches = content.matchAll(new RegExp(pattern.source, 'gi'));
    for (const match of matches) {
      const lineNumber = findLineNumber(content, match[0]);
      const githubLink = createGitHubLink(githubContext, lineNumber);
      const codeSnippet = extractCodeSnippet(content, lineNumber, 2);

      results.push({
        id: `local-action-${Date.now()}-${Math.random()}`,
        type: 'security',
        severity: 'warning',
        title: 'Local action usage',
        description: 'Using local GitHub action which cannot be analyzed for vulnerabilities',
        file: fileName,
        location: { line: lineNumber },
        suggestion: 'Consider using published actions with SHA pinning, or audit local actions thoroughly.',
        links: ['https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions'],
        githubUrl: githubLink,
        codeSnippet: codeSnippet || undefined
      });
    }
  });

  // Check for OIDC actions
  const oidcActionPatterns = [
    /aws-actions\/configure-aws-credentials/i,
    /azure\/login/i,
    /google-github-actions\/auth/i,
    /google-github-actions\/setup-gcloud/i,
  ];

  oidcActionPatterns.forEach(pattern => {
    const matches = content.matchAll(new RegExp(pattern.source, 'gi'));
    for (const match of matches) {
      const lineNumber = findLineNumber(content, match[0]);
      const githubLink = createGitHubLink(githubContext, lineNumber);
      const codeSnippet = extractCodeSnippet(content, lineNumber, 2);

      results.push({
        id: `oidc-action-${Date.now()}-${Math.random()}`,
        type: 'security',
        severity: 'info',
        title: 'OIDC action detected',
        description: 'Using OIDC action for cloud provider access - review permissions carefully',
        file: fileName,
        location: { line: lineNumber },
        suggestion: 'Review the permissions granted by this OIDC action and ensure they follow least privilege.',
        links: ['https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions'],
        githubUrl: githubLink,
        codeSnippet: codeSnippet || undefined
      });
    }
  });

  // Check for credentials in services configuration
  const credentialsPatterns = [
    /services:\s*\w+:\s*credentials/i,
    /services:\s*\w+:\s*auth/i,
    /services:\s*\w+:\s*token/i,
  ];

  credentialsPatterns.forEach(pattern => {
    const matches = content.matchAll(new RegExp(pattern.source, 'gi'));
    for (const match of matches) {
      const lineNumber = findLineNumber(content, match[0]);
      const githubLink = createGitHubLink(githubContext, lineNumber);
      const codeSnippet = extractCodeSnippet(content, lineNumber, 3);

      results.push({
        id: `credentials-${Date.now()}-${Math.random()}`,
        type: 'security',
        severity: 'warning',
        title: 'Credentials in services configuration',
        description: 'Services configuration contains credentials - use secrets instead',
        file: fileName,
        location: { line: lineNumber },
        suggestion: 'Use GitHub secrets for service authentication instead of hardcoding credentials.',
        links: ['https://docs.github.com/en/actions/security-guides/encrypted-secrets'],
        githubUrl: githubLink,
        codeSnippet: codeSnippet || undefined
      });
    }
  });

  // Check for potential repo-jacking vulnerabilities
  // For now, flag actions from less common organizations that might be typos
  const suspiciousOrgs = [
    /uses:\s*['"]?github\/[^'"]*['"]?/i, // github org (should be actions/github)
    /uses:\s*['"]?action\/[^'"]*['"]?/i, // action org (should be actions/)
    /uses:\s*['"]?workflow\/[^'"]*['"]?/i, // workflow org
  ];

  suspiciousOrgs.forEach(pattern => {
    const matches = content.matchAll(new RegExp(pattern.source, 'gi'));
    for (const match of matches) {
      const lineNumber = findLineNumber(content, match[0]);
      const githubLink = createGitHubLink(githubContext, lineNumber);
      const codeSnippet = extractCodeSnippet(content, lineNumber, 2);

      results.push({
        id: `repo-jacking-${Date.now()}-${Math.random()}`,
        type: 'security',
        severity: 'warning',
        title: 'Potential repo-jacking vulnerability',
        description: `Action reference may be vulnerable to repo-jacking: ${match[0]}`,
        file: fileName,
        location: { line: lineNumber },
        suggestion: 'Verify the organization/user exists and the action is legitimate. Use SHA pinning for additional security.',
        links: ['https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions'],
        githubUrl: githubLink,
        codeSnippet: codeSnippet || undefined
      });
    }
  });

  // Check for shell script issues (shellcheck-like)
  const shellcheckPatterns = [
    /\$\([^\)]*\)/g, // Unquoted command substitution
    /rm\s+-[rf]+\s+\*/i, // Dangerous rm commands
    /chmod\s+777/i, // Overly permissive chmod
    /sudo\s+.*\|\s*sh/i, // Sudo piped to shell
    /curl.*\|\s*bash/i, // Curl piped to bash
    /wget.*\|\s*bash/i, // Wget piped to bash
  ];

  shellcheckPatterns.forEach(pattern => {
    const matches = content.matchAll(new RegExp(pattern.source, 'gi'));
    for (const match of matches) {
      const lineNumber = findLineNumber(content, match[0]);
      const githubLink = createGitHubLink(githubContext, lineNumber);
      const codeSnippet = extractCodeSnippet(content, lineNumber, 2);

      results.push({
        id: `shellcheck-${Date.now()}-${Math.random()}`,
        type: 'security',
        severity: 'warning',
        title: 'Shell script security issue',
        description: `Potential shell script vulnerability: ${match[0]}`,
        file: fileName,
        location: { line: lineNumber },
        suggestion: 'Review shell script for security issues. Consider using shellcheck for comprehensive analysis.',
        links: ['https://www.shellcheck.net/'],
        githubUrl: githubLink,
        codeSnippet: codeSnippet || undefined
      });
    }
  });

  return results;
}