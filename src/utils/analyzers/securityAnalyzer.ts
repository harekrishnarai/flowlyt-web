import { WorkflowData, AnalysisResult } from '../../types/workflow';
import { findLineNumber, findJobLineNumber, findStepLineNumber, extractCodeSnippet, extractStepSnippet } from '../yamlParser';
import { GitHubAnalysisContext } from '../workflowAnalyzer';
import { getSHARecommendation, isActionInDatabase, isVersionOutdated } from '../actionHashDatabase';
import { 
  enhanceSecurityAnalysisWithReachability, 
  SecurityIssueWithReachability, 
  generateReachabilityInsights 
} from './reachabilityAnalyzer';

// Helper function to create GitHub permalink for specific line
function createGitHubLink(githubContext: GitHubAnalysisContext, lineNumber?: number): string | undefined {
  if (!githubContext.repoUrl || !githubContext.filePath || !lineNumber) {
    return undefined;
  }
  
  const branch = githubContext.branch || 'main';
  return `${githubContext.repoUrl}/blob/${branch}/${githubContext.filePath}#L${lineNumber}`;
}

// Trusted action owners - actions from these organizations are considered more reliable
const TRUSTED_ACTION_OWNERS = [
  'actions', 'github', 'docker', 'microsoft', 'azure', 'aws-actions', 
  'google-github-actions', 'hashicorp', 'codecov', 'sonarqube-quality-gate-action'
];

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
  ];
  
  // Group patterns by line and only keep the highest priority match per line
  const lineMatches = new Map<number, { pattern: { pattern: RegExp, name: string, priority: number }, match: RegExpMatchArray }>();
  
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
    { pattern: /echo.*\$\{\{.*secrets\./i, type: 'secret value logging' },
    { pattern: /echo.*password/i, type: 'password logging' },
    { pattern: /echo.*token/i, type: 'token logging' },
    { pattern: /echo.*secret/i, type: 'secret logging' },
    { pattern: /print.*password/i, type: 'password logging' },
    { pattern: /print.*token/i, type: 'token logging' },
    { pattern: /printf.*password/i, type: 'password logging' },
    { pattern: /console\.log.*password/i, type: 'password logging' },
    { pattern: /console\.log.*token/i, type: 'token logging' },
    { pattern: /cat\s+\.env\b/i, type: 'environment file access' },
  ];

  const logLineMatches = new Map<number, { pattern: { pattern: RegExp, type: string }, match: RegExpMatchArray }>();
  const contentLines = content.split('\n');

  sensitiveLogPatterns.forEach(({ pattern, type }) => {
    const matches = content.matchAll(new RegExp(pattern.source, 'gi'));
    for (const match of matches) {
      const lineNumber = findLineNumber(content, match[0]);
      // Skip comment lines
      const matchedLine = contentLines[lineNumber - 1]?.trim() || '';
      if (matchedLine.startsWith('#')) continue;

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
  // Only match in actual run steps, not comments
  const suspiciousNetworkPatterns = [
    /nc\s+\d+\.\d+\.\d+\.\d+/i, // netcat to IP address
    /telnet\s+\d+\.\d+\.\d+\.\d+/i,
    /base64.*\|.*curl/i, // base64 encoding piped to curl (common exfiltration)
    /tar.*\|.*curl/i, // archive and send
  ];

  suspiciousNetworkPatterns.forEach(pattern => {
    const matches = content.matchAll(new RegExp(pattern.source, 'gi'));
    for (const match of matches) {
      const lineNumber = findLineNumber(content, match[0]);
      // Skip if the matched line is a comment
      const lines = content.split('\n');
      const matchedLine = lines[lineNumber - 1]?.trim() || '';
      if (matchedLine.startsWith('#')) continue;

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
  
  // Check for overly permissive permissions - Enhanced detection
  if (workflow.permissions) {
    const permissions = workflow.permissions;
    const lineNumber = findLineNumber(content, 'permissions:');
    const githubLink = createGitHubLink(githubContext, lineNumber);
    const codeSnippet = extractCodeSnippet(content, lineNumber, 5);
    
    // Check for write-all
    if (permissions === 'write-all') {
      results.push({
        id: `permissions-write-all-${lineNumber}`,
        type: 'security',
        severity: 'error',
        title: 'Dangerous write-all permissions',
        description: 'Workflow uses write-all permissions which grants full write access to all scopes. This violates the principle of least privilege.',
        file: fileName,
        location: { line: lineNumber },
        suggestion: 'Replace write-all with specific, minimal permissions required for the workflow. Define only the permissions actually needed.',
        links: [
          'https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions#permissions',
          'https://docs.github.com/en/actions/security-guides/automatic-token-authentication#permissions-for-the-github_token'
        ],
        githubUrl: githubLink,
        codeSnippet: codeSnippet || undefined
      });
    }
    
    // Check for read-all (still overly broad)
    if (permissions === 'read-all') {
      results.push({
        id: `permissions-read-all-${lineNumber}`,
        type: 'security',
        severity: 'warning',
        title: 'Overly broad read-all permissions',
        description: 'Workflow uses read-all permissions which grants read access to all scopes. Consider specifying only required read permissions.',
        file: fileName,
        location: { line: lineNumber },
        suggestion: 'Replace read-all with specific read permissions for only the required scopes.',
        links: ['https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions#permissions'],
        githubUrl: githubLink,
        codeSnippet: codeSnippet || undefined
      });
    }
    
    // Check for individual overly permissive permissions
    if (typeof permissions === 'object') {
      const dangerousWritePermissions = [
        { key: 'contents', desc: 'Contents write permission allows modifying repository files and releases' },
        { key: 'actions', desc: 'Actions write permission allows modifying workflow files' },
        { key: 'packages', desc: 'Packages write permission allows publishing packages' },
        { key: 'deployments', desc: 'Deployments write permission allows creating deployments' },
        { key: 'security-events', desc: 'Security-events write permission allows modifying security advisories' },
        { key: 'id-token', desc: 'ID-token write permission enables OIDC token requests (verify cloud permissions)' },
      ];
      
      dangerousWritePermissions.forEach(({ key, desc }) => {
        if (permissions[key] === 'write') {
          results.push({
            id: `permissions-${key}-write-${lineNumber}`,
            type: 'security',
            severity: 'warning',
            title: `Potentially excessive ${key} write permission`,
            description: `${desc}. Verify this permission is necessary for the workflow.`,
            file: fileName,
            location: { line: lineNumber },
            suggestion: `Review if ${key}: write is truly needed. Use read permission if possible or remove if not required.`,
            links: ['https://docs.github.com/en/actions/security-guides/automatic-token-authentication#permissions-for-the-github_token'],
            githubUrl: githubLink,
            codeSnippet: codeSnippet || undefined
          });
        }
      });
    }
  }
  
  // Check for missing permissions declaration (token inherits repo settings)
  if (!workflow.permissions) {
    const hasSensitiveOperations = content.includes('secrets.GITHUB_TOKEN') || 
                                   content.includes('github.token') ||
                                   content.includes('GITHUB_TOKEN');
    
    if (hasSensitiveOperations) {
      results.push({
        id: `missing-permissions-declaration`,
        type: 'security',
        severity: 'warning',
        title: 'Missing workflow permissions declaration',
        description: 'Workflow uses GITHUB_TOKEN but does not declare explicit permissions. The token will inherit default repository permissions which may be overly permissive.',
        file: fileName,
        location: { line: 1 },
        suggestion: 'Add an explicit permissions block at the workflow level to follow the principle of least privilege. Start with permissions: {} and add only what is needed.',
        links: [
          'https://docs.github.com/en/actions/security-guides/automatic-token-authentication',
          'https://github.blog/changelog/2023-02-02-github-actions-updating-the-default-github_token-permissions-to-read-only/'
        ]
      });
    }
  }
  
  // Check for dangerous trigger configurations
  const dangerousTriggerPatterns = [
    { 
      trigger: 'pull_request_target', 
      severity: 'error' as const,
      desc: 'pull_request_target runs in the context of the base repository with write access. Never checkout and run untrusted PR code.',
      pattern: /pull_request_target:/
    },
    { 
      trigger: 'workflow_run', 
      severity: 'warning' as const,
      desc: 'workflow_run can be triggered by forked PRs and runs with elevated privileges. Verify artifacts and inputs carefully.',
      pattern: /workflow_run:/
    },
    { 
      trigger: 'issue_comment', 
      severity: 'warning' as const,
      desc: 'issue_comment trigger can be invoked by any user. Implement proper authorization checks before running privileged commands.',
      pattern: /issue_comment:/
    },
    { 
      trigger: 'discussion_comment', 
      severity: 'warning' as const,
      desc: 'discussion_comment trigger can be invoked by any user. Implement authorization checks before running commands.',
      pattern: /discussion_comment:/
    },
  ];
  
  dangerousTriggerPatterns.forEach(({ trigger, severity: baseSeverity, desc, pattern }) => {
    const matches = content.matchAll(new RegExp(pattern.source, 'gi'));
    for (const match of matches) {
      const lineNumber = findLineNumber(content, match[0]);
      const githubLink = createGitHubLink(githubContext, lineNumber);
      const codeSnippet = extractCodeSnippet(content, lineNumber, 4);
      
      // Context-aware severity adjustment for pull_request_target
      let severity = baseSeverity;
      let contextDesc = desc;
      if (trigger === 'pull_request_target') {
        const hasCheckout = /actions\/checkout/i.test(content);
        const checksOutPRHead = /ref:.*\$\{\{.*pull_request.*head/i.test(content) || 
                                /ref:.*\$\{\{.*github\.event\.pull_request\.head\.sha/i.test(content) ||
                                /ref:.*refs\/pull/i.test(content);
        const hasSecrets = /secrets\./i.test(content);
        const hasDockerRun = /docker\s+run/i.test(content);
        
        if (hasCheckout && checksOutPRHead && hasSecrets) {
          severity = 'error';
          contextDesc = 'CRITICAL: pull_request_target checks out PR head code AND uses secrets. This is the classic pwn-request pattern allowing full secret exfiltration by fork attackers.';
        } else if (hasCheckout && checksOutPRHead) {
          severity = 'error';
          contextDesc = 'pull_request_target checks out untrusted PR head code. Even without explicit secrets, the GITHUB_TOKEN has write access.';
        } else if (hasDockerRun && hasSecrets) {
          severity = 'error';
          contextDesc = 'pull_request_target runs Docker containers with secrets. Fork code may be processed with secret access.';
        } else if (hasCheckout && !checksOutPRHead) {
          severity = 'warning';
          contextDesc = 'pull_request_target with checkout (appears to checkout base, not PR head). Verify the ref is not attacker-controlled.';
        } else {
          severity = 'info';
          contextDesc = 'pull_request_target without code checkout. Lower risk — only metadata access. Ensure no user-controlled data flows into commands.';
        }
      }
      
      results.push({
        id: `dangerous-trigger-${trigger}-${lineNumber}`,
        type: 'security',
        severity: severity,
        title: `Security-sensitive trigger: ${trigger}`,
        description: contextDesc,
        file: fileName,
        location: { line: lineNumber },
        suggestion: `Review the security implications of ${trigger}. Implement input validation and authorization checks where applicable.`,
        links: [
          'https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions#potential-impact-of-a-compromised-runner',
          'https://securitylab.github.com/research/github-actions-preventing-pwn-requests/'
        ],
        githubUrl: githubLink,
        codeSnippet: codeSnippet || undefined
      });
    }
  });
  
  // Check for fork security settings with pull_request trigger
  if (content.includes('pull_request:') || content.includes('pull_request_target:')) {
    // Check if workflows could be triggered by forks without restrictions
    const hasForkRestriction = content.includes("github.event.pull_request.head.repo.full_name == github.repository") ||
                               content.includes("github.event.pull_request.head.repo.fork == false") ||
                               content.includes("!github.event.pull_request.head.repo.fork");
    
    if (!hasForkRestriction && content.includes('secrets.')) {
      const lineNumber = findLineNumber(content, 'pull_request');
      results.push({
        id: `fork-secrets-exposure`,
        type: 'security',
        severity: 'warning',
        title: 'Potential secrets exposure to forks',
        description: 'Workflow triggered by pull_request uses secrets but does not check if the PR is from a fork. Secrets are not available to fork PRs by default, but pull_request_target exposes them.',
        file: fileName,
        location: { line: lineNumber },
        suggestion: 'Add a condition to check if PR is from a fork before accessing secrets: if: github.event.pull_request.head.repo.full_name == github.repository',
        links: ['https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions#handling-untrusted-input']
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
        
        // Skip local actions - they are versioned with the repository itself
        // Local actions start with './' or '../' and don't need version pinning
        const isLocalAction = step.uses.startsWith('./') || step.uses.startsWith('../');
        
        // Enhanced SHA pinning analysis with specific recommendations
        // Skip version checking for local actions
        if (!isLocalAction) {
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

              // Outdated version checking handled by dependencyAnalyzer
            }
          }
          
          // Check for actions from untrusted sources
          // Skip SHA-pinned actions — they have minimal supply chain risk
          const actionOwner = step.uses.split('/')[0];
          const versionPart = step.uses.includes('@') ? step.uses.split('@')[1] : '';
          const isSHAPinned = /^[a-f0-9]{40}$/i.test(versionPart);
          
          if (!TRUSTED_ACTION_OWNERS.includes(actionOwner) && !isSHAPinned) {
            results.push({
              id: `untrusted-action-${jobId}-${stepIndex}`,
              type: 'security',
              severity: 'warning',
              title: 'Third-party action usage',
              description: `Using action from '${actionOwner}' - verify trustworthiness and pin to SHA`,
              file: fileName,
              location: { job: jobId, step: stepIndex, line: stepLineNumber },
              suggestion: 'Pin third-party actions to a specific commit SHA to prevent supply chain attacks.',
              links: ['https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions'],
              githubUrl: githubLink,
              codeSnippet: codeSnippet || undefined
            });
          }
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
  // Only flag when expression interpolation (${{ }}) is used, which can contain
  // attacker-controlled values. Plain shell variables are safe.
  const dangerousWritePatterns = [
    /echo.*\$\{\{.*\}\}.*>>.*GITHUB_ENV/i,
    /echo.*\$\{\{.*\}\}.*>>.*GITHUB_OUTPUT/i,
    /printf.*\$\{\{.*\}\}.*>>.*GITHUB_ENV/i,
    /printf.*\$\{\{.*\}\}.*>>.*GITHUB_OUTPUT/i,
    /set-output.*name/i, // deprecated command, always flag
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

  // Check for expression injection vulnerabilities - comprehensive patterns
  // Organized by source category for better detection and reporting
  const expressionInjectionPatterns = [
    // Issue-related injections
    { pattern: /\$\{\{.*github\.event\.issue\.title.*\}\}/i, source: 'issue title', severity: 'error' as const },
    { pattern: /\$\{\{.*github\.event\.issue\.body.*\}\}/i, source: 'issue body', severity: 'error' as const },
    { pattern: /\$\{\{.*github\.event\.issue\.user\.login.*\}\}/i, source: 'issue author', severity: 'warning' as const },
    
    // Pull request-related injections
    { pattern: /\$\{\{.*github\.event\.pull_request\.title.*\}\}/i, source: 'PR title', severity: 'error' as const },
    { pattern: /\$\{\{.*github\.event\.pull_request\.body.*\}\}/i, source: 'PR body', severity: 'error' as const },
    { pattern: /\$\{\{.*github\.event\.pull_request\.head\.ref.*\}\}/i, source: 'PR head ref', severity: 'error' as const },
    { pattern: /\$\{\{.*github\.event\.pull_request\.head\.label.*\}\}/i, source: 'PR head label', severity: 'error' as const },
    { pattern: /\$\{\{.*github\.event\.pull_request\.head\.repo\.default_branch.*\}\}/i, source: 'PR head repo default branch', severity: 'warning' as const },
    { pattern: /\$\{\{.*github\.event\.pull_request\.user\.login.*\}\}/i, source: 'PR author', severity: 'warning' as const },
    
    // Comment-related injections (issues, PRs, discussions)
    { pattern: /\$\{\{.*github\.event\.comment\.body.*\}\}/i, source: 'comment body', severity: 'error' as const },
    { pattern: /\$\{\{.*github\.event\.comment\.user\.login.*\}\}/i, source: 'comment author', severity: 'warning' as const },
    
    // Discussion-related injections (NEW)
    { pattern: /\$\{\{.*github\.event\.discussion\.title.*\}\}/i, source: 'discussion title', severity: 'error' as const },
    { pattern: /\$\{\{.*github\.event\.discussion\.body.*\}\}/i, source: 'discussion body', severity: 'error' as const },
    { pattern: /\$\{\{.*github\.event\.discussion\.user\.login.*\}\}/i, source: 'discussion author', severity: 'warning' as const },
    { pattern: /\$\{\{.*github\.event\.discussion_comment\.body.*\}\}/i, source: 'discussion comment body', severity: 'error' as const },
    { pattern: /\$\{\{.*github\.event\.discussion_comment\.user\.login.*\}\}/i, source: 'discussion comment author', severity: 'warning' as const },
    
    // Review-related injections
    { pattern: /\$\{\{.*github\.event\.review\.body.*\}\}/i, source: 'review body', severity: 'error' as const },
    { pattern: /\$\{\{.*github\.event\.review\.user\.login.*\}\}/i, source: 'review author', severity: 'warning' as const },
    { pattern: /\$\{\{.*github\.event\.review_comment\.body.*\}\}/i, source: 'review comment body', severity: 'error' as const },
    
    // Commit-related injections
    { pattern: /\$\{\{.*github\.event\.commits\[.*\]\.message.*\}\}/i, source: 'commit message', severity: 'error' as const },
    { pattern: /\$\{\{.*github\.event\.commits.*\.message.*\}\}/i, source: 'commit message', severity: 'error' as const },
    { pattern: /\$\{\{.*github\.event\.head_commit\.message.*\}\}/i, source: 'head commit message', severity: 'error' as const },
    { pattern: /\$\{\{.*github\.event\.head_commit\.author\.email.*\}\}/i, source: 'commit author email', severity: 'error' as const },
    { pattern: /\$\{\{.*github\.event\.head_commit\.author\.name.*\}\}/i, source: 'commit author name', severity: 'error' as const },
    { pattern: /\$\{\{.*github\.event\.commits.*\.author\.email.*\}\}/i, source: 'commit author email', severity: 'error' as const },
    { pattern: /\$\{\{.*github\.event\.commits.*\.author\.name.*\}\}/i, source: 'commit author name', severity: 'error' as const },
    
    // Git ref injections
    { pattern: /\$\{\{.*github\.head_ref.*\}\}/i, source: 'head ref', severity: 'error' as const },
    { pattern: /\$\{\{.*github\.base_ref.*\}\}/i, source: 'base ref', severity: 'warning' as const },
    { pattern: /\$\{\{.*github\.ref_name.*\}\}/i, source: 'ref name', severity: 'warning' as const },
    
    // Pages-related injections
    { pattern: /\$\{\{.*github\.event\.pages.*\.page_name.*\}\}/i, source: 'page name', severity: 'error' as const },
    
    // Workflow dispatch inputs (user-controlled)
    { pattern: /\$\{\{.*github\.event\.inputs\..*\}\}/i, source: 'workflow dispatch input', severity: 'warning' as const },
    { pattern: /\$\{\{.*inputs\..*\}\}/i, source: 'workflow input', severity: 'warning' as const },
    
    // Client payload (repository dispatch)
    { pattern: /\$\{\{.*github\.event\.client_payload\..*\}\}/i, source: 'client payload', severity: 'error' as const },
    
    // Release-related injections (NEW)
    { pattern: /\$\{\{.*github\.event\.release\.name.*\}\}/i, source: 'release name', severity: 'warning' as const },
    { pattern: /\$\{\{.*github\.event\.release\.body.*\}\}/i, source: 'release body', severity: 'error' as const },
    { pattern: /\$\{\{.*github\.event\.release\.tag_name.*\}\}/i, source: 'release tag name', severity: 'warning' as const },
    
    // Milestone-related injections (NEW)
    { pattern: /\$\{\{.*github\.event\.milestone\.title.*\}\}/i, source: 'milestone title', severity: 'warning' as const },
    { pattern: /\$\{\{.*github\.event\.milestone\.description.*\}\}/i, source: 'milestone description', severity: 'error' as const },
    
    // Label-related injections (NEW)
    { pattern: /\$\{\{.*github\.event\.label\.name.*\}\}/i, source: 'label name', severity: 'warning' as const },
    { pattern: /\$\{\{.*github\.event\.label\.description.*\}\}/i, source: 'label description', severity: 'warning' as const },
    
    // Project-related injections (NEW)
    { pattern: /\$\{\{.*github\.event\.project\.name.*\}\}/i, source: 'project name', severity: 'warning' as const },
    { pattern: /\$\{\{.*github\.event\.project\.body.*\}\}/i, source: 'project body', severity: 'error' as const },
    { pattern: /\$\{\{.*github\.event\.project_card\.note.*\}\}/i, source: 'project card note', severity: 'error' as const },
    { pattern: /\$\{\{.*github\.event\.project_column\.name.*\}\}/i, source: 'project column name', severity: 'warning' as const },
    
    // Wiki-related injections (NEW)
    { pattern: /\$\{\{.*github\.event\.pages\[.*\]\.title.*\}\}/i, source: 'wiki page title', severity: 'error' as const },
    
    // Check run/suite injections (NEW)
    { pattern: /\$\{\{.*github\.event\.check_run\.name.*\}\}/i, source: 'check run name', severity: 'warning' as const },
    { pattern: /\$\{\{.*github\.event\.check_suite\.head_branch.*\}\}/i, source: 'check suite head branch', severity: 'warning' as const },
    
    // Deployment-related injections (NEW)
    { pattern: /\$\{\{.*github\.event\.deployment\.ref.*\}\}/i, source: 'deployment ref', severity: 'warning' as const },
    { pattern: /\$\{\{.*github\.event\.deployment\.environment.*\}\}/i, source: 'deployment environment', severity: 'warning' as const },
    { pattern: /\$\{\{.*github\.event\.deployment_status\.environment.*\}\}/i, source: 'deployment status environment', severity: 'warning' as const },
    
    // Fork-related injections (NEW)
    { pattern: /\$\{\{.*github\.event\.forkee\.full_name.*\}\}/i, source: 'forked repo name', severity: 'warning' as const },
    
    // Sender-related injections (NEW)
    { pattern: /\$\{\{.*github\.event\.sender\.login.*\}\}/i, source: 'event sender login', severity: 'warning' as const },
    
    // General env and output injections (can propagate untrusted data)
    { pattern: /\$\{\{.*env\..*\}\}/i, source: 'environment variable', severity: 'info' as const },
    { pattern: /\$\{\{.*steps\..*\.outputs\..*\}\}/i, source: 'step output', severity: 'info' as const },
    { pattern: /\$\{\{.*needs\..*\.outputs\..*\}\}/i, source: 'job output', severity: 'info' as const },
  ];

  // Determine if workflow has attacker-reachable triggers (for context-aware severity)
  const hasAttackerReachableTrigger = /pull_request_target:|pull_request:|issue_comment:|discussion_comment:|workflow_run:|fork/i.test(content);

  expressionInjectionPatterns.forEach(({ pattern, source, severity: baseSeverity }) => {
    const matches = content.matchAll(new RegExp(pattern.source, 'gi'));
    for (const match of matches) {
      // Skip if it's properly sanitized (check for quotes or sanitization functions)
      if (match[0].includes('toJSON') || match[0].includes('fromJSON') || match[0].includes('contains')) {
        continue;
      }

      const lineNumber = findLineNumber(content, match[0]);
      // Skip comment lines
      const matchedLine = contentLines[lineNumber - 1]?.trim() || '';
      if (matchedLine.startsWith('#')) continue;

      const githubLink = createGitHubLink(githubContext, lineNumber);
      const codeSnippet = extractCodeSnippet(content, lineNumber, 2);

      // Context-aware: downgrade severity if no attacker-reachable trigger
      let severity = baseSeverity;
      if (!hasAttackerReachableTrigger && baseSeverity === 'error') {
        severity = 'warning' as const;
      }

      results.push({
        id: `expression-injection-${source.replace(/\s+/g, '-')}-${lineNumber}`,
        type: 'security',
        severity: severity,
        title: `Potential expression injection via ${source}`,
        description: `Using user-controlled ${source} without sanitization: ${match[0]}. This can allow command injection attacks.`,
        file: fileName,
        location: { line: lineNumber },
        suggestion: `Avoid using ${source} directly in run commands. Use an intermediate environment variable or actions/github-script for safer processing.`,
        links: [
          'https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions#understanding-the-risk-of-script-injections',
          'https://securitylab.github.com/research/github-actions-untrusted-input/'
        ],
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

  // Check for local action usage (informational only — same repo code)
  const localActionPatterns = [
    /uses:\s*\.\//i,
    /uses:\s*\.\./i,
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
        severity: 'info',
        title: 'Local action usage',
        description: 'Using local action from the same repository. Ensure it is reviewed as part of normal code review.',
        file: fileName,
        location: { line: lineNumber },
        suggestion: 'Local actions are inherently trusted (same repo). Audit them during code review like any other code.',
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
    /\$\([^)]*\)/g, // Unquoted command substitution
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

  // === ADDITIONAL HARDENING STANDARDS ===
  
  // Check for missing timeout-minutes (can lead to runaway jobs)
  Object.entries(workflow.jobs).forEach(([jobId, job]) => {
    // Check if job has timeout-minutes defined
    const hasJobTimeout = job['timeout-minutes'] !== undefined;
    
    if (!hasJobTimeout && job.steps && job.steps.length > 3) {
      const jobLineNumber = findJobLineNumber(content, jobId);
      const githubLink = createGitHubLink(githubContext, jobLineNumber);
      
      results.push({
        id: `missing-timeout-${jobId}`,
        type: 'security',
        severity: 'info',
        title: 'Missing job timeout',
        description: `Job '${jobId}' does not specify timeout-minutes. Long-running or stuck jobs can consume resources and incur costs.`,
        file: fileName,
        location: { job: jobId, line: jobLineNumber },
        suggestion: 'Add timeout-minutes to jobs to prevent runaway executions. Default is 360 minutes (6 hours).',
        links: ['https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions#jobsjob_idtimeout-minutes'],
        githubUrl: githubLink
      });
    }
  });
  
  // Check for concurrency settings (prevent concurrent workflow runs)
  if (!workflow.concurrency && content.includes('deploy')) {
    results.push({
      id: `missing-concurrency-deploy`,
      type: 'security',
      severity: 'info',
      title: 'Missing concurrency control for deployment workflow',
      description: 'Deployment workflow does not specify concurrency settings. Concurrent deployments may cause inconsistent state.',
      file: fileName,
      location: { line: 1 },
      suggestion: 'Add concurrency settings to prevent concurrent deployments: concurrency: { group: deploy-${{ github.ref }}, cancel-in-progress: false }',
      links: ['https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions#concurrency']
    });
  }
  
  // Track which actions receive tokens
  Object.entries(workflow.jobs).forEach(([jobId, job]) => {
    if (!job.steps || !Array.isArray(job.steps)) return;
    
    job.steps.forEach((step, stepIndex) => {
      if (step.uses && step.with) {
        const actionOwner = step.uses.split('/')[0];
        
        // Check if token is passed to untrusted action
        const withKeys = Object.keys(step.with);
        const tokenKeys = withKeys.filter(k => k.toLowerCase().includes('token') || k.toLowerCase().includes('github'));
        
        if (tokenKeys.length > 0 && !TRUSTED_ACTION_OWNERS.includes(actionOwner)) {
          const stepLineNumber = findStepLineNumber(content, jobId, stepIndex);
          const githubLink = createGitHubLink(githubContext, stepLineNumber);
          const codeSnippet = extractStepSnippet(content, jobId, stepIndex);
          
          results.push({
            id: `token-to-untrusted-${jobId}-${stepIndex}`,
            type: 'security',
            severity: 'warning',
            title: 'GITHUB_TOKEN passed to third-party action',
            description: `Token is passed to third-party action '${step.uses}'. Verify the action is trustworthy and requires this token.`,
            file: fileName,
            location: { job: jobId, step: stepIndex, line: stepLineNumber },
            suggestion: 'Review if the third-party action truly needs the token. Consider using a minimal-permission PAT instead.',
            links: ['https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions#using-third-party-actions'],
            githubUrl: githubLink,
            codeSnippet: codeSnippet || undefined
          });
        }
      }
    });
  });
  
  // Check for persist-credentials in checkout (security hardening)
  // Use the parsed workflow to analyze checkout steps
  Object.entries(workflow.jobs).forEach(([jobId, job]) => {
    if (!job.steps || !Array.isArray(job.steps)) return;
    
    job.steps.forEach((step, stepIndex) => {
      if (step.uses && step.uses.includes('actions/checkout')) {
        const hasPersistCredentialsFalse = step.with?.['persist-credentials'] === false || 
                                           step.with?.['persist-credentials'] === 'false';
        
        if (!hasPersistCredentialsFalse) {
          const stepLineNumber = findStepLineNumber(content, jobId, stepIndex);
          const githubLink = createGitHubLink(githubContext, stepLineNumber);
          const codeSnippet = extractStepSnippet(content, jobId, stepIndex);
          
          results.push({
            id: `checkout-persist-credentials-${jobId}-${stepIndex}`,
            type: 'security',
            severity: 'info',
            title: 'Consider disabling persist-credentials in checkout',
            description: 'The checkout action persists credentials by default. For enhanced security, consider disabling this.',
            file: fileName,
            location: { job: jobId, step: stepIndex, line: stepLineNumber },
            suggestion: 'Add "persist-credentials: false" to the checkout step to prevent credential persistence in the repository.',
            links: ['https://github.com/actions/checkout#usage'],
            githubUrl: githubLink,
            codeSnippet: codeSnippet || undefined
          });
        }
      }
    });
  });
  
  // Check for workflow_call without input validation
  // Only flag if workflow_call is in the 'on' section and has inputs defined
  const onSection = workflow.on;
  const hasWorkflowCall = typeof onSection === 'object' && 
                         onSection !== null && 
                         'workflow_call' in onSection;
  
  if (hasWorkflowCall) {
    const workflowCallConfig = (onSection as Record<string, unknown>)['workflow_call'];
    const inputs = typeof workflowCallConfig === 'object' && 
                  workflowCallConfig !== null && 
                  'inputs' in (workflowCallConfig as Record<string, unknown>)
                  ? (workflowCallConfig as Record<string, unknown>)['inputs']
                  : null;
    
    if (inputs && typeof inputs === 'object') {
      const lineNumber = findLineNumber(content, 'workflow_call:');
      results.push({
        id: `workflow-call-validation`,
        type: 'security',
        severity: 'info',
        title: 'Reusable workflow inputs may need validation',
        description: 'Reusable workflow accepts inputs. Ensure all inputs are properly validated before use in run commands.',
        file: fileName,
        location: { line: lineNumber },
        suggestion: 'Validate input values before use in run commands to prevent injection attacks.',
        links: ['https://docs.github.com/en/actions/using-workflows/reusing-workflows#using-inputs-and-secrets-in-a-reusable-workflow']
      });
    }
  }
  
  // Check for GitHub script with potentially dangerous code
  // Use parsed workflow to find github-script steps
  const dangerousScriptPatterns = [
    { pattern: /\bexec\b/, desc: 'exec' },
    { pattern: /child_process/, desc: 'child_process' },
    { pattern: /\brequire\s*\(/, desc: 'require' },
  ];
  
  Object.entries(workflow.jobs).forEach(([jobId, job]) => {
    if (!job.steps || !Array.isArray(job.steps)) return;
    
    job.steps.forEach((step, stepIndex) => {
      if (step.uses && step.uses.includes('github-script') && step.with?.script) {
        const script = String(step.with.script);
        
        for (const { pattern, desc } of dangerousScriptPatterns) {
          if (pattern.test(script)) {
            const stepLineNumber = findStepLineNumber(content, jobId, stepIndex);
            const githubLink = createGitHubLink(githubContext, stepLineNumber);
            const codeSnippet = extractStepSnippet(content, jobId, stepIndex);
            
            results.push({
              id: `github-script-dangerous-${desc}-${jobId}-${stepIndex}`,
              type: 'security',
              severity: 'warning',
              title: 'Potentially dangerous github-script usage',
              description: `The github-script action contains potentially dangerous operation: ${desc}. Review for security implications.`,
              file: fileName,
              location: { job: jobId, step: stepIndex, line: stepLineNumber },
              suggestion: 'Review the script for potential command injection or unsafe operations. Validate all inputs.',
              links: ['https://github.com/actions/github-script'],
              githubUrl: githubLink,
              codeSnippet: codeSnippet || undefined
            });
            break; // Only report once per step
          }
        }
      }
    });
  });
  
  // Check for job-level permissions that inherit from workflow
  Object.entries(workflow.jobs).forEach(([jobId, job]) => {
    if (!job.permissions && workflow.permissions) {
      // Job inherits workflow permissions - this is fine but worth noting for complex workflows
      const jobLineNumber = findJobLineNumber(content, jobId);
      
      // Only flag if workflow has elevated permissions
      if (typeof workflow.permissions === 'object' && 
          (workflow.permissions.contents === 'write' || 
           workflow.permissions.actions === 'write' ||
           workflow.permissions.packages === 'write')) {
        
        results.push({
          id: `inherited-permissions-${jobId}`,
          type: 'security',
          severity: 'info',
          title: `Job '${jobId}' inherits workflow permissions`,
          description: `Job inherits elevated workflow permissions. Consider specifying minimal job-level permissions.`,
          file: fileName,
          location: { job: jobId, line: jobLineNumber },
          suggestion: 'Add explicit permissions block to the job with only the permissions it needs.',
          links: ['https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions#jobsjob_idpermissions']
        });
      }
    }
  });
  
  // Check for environment without protection rules reminder
  Object.entries(workflow.jobs).forEach(([jobId, job]) => {
    if (job.environment) {
      const envValue = job.environment;
      const envName = typeof envValue === 'string' ? envValue : envValue?.name;
      
      if (envName && (envName.toLowerCase().includes('prod') || envName.toLowerCase().includes('production'))) {
        const jobLineNumber = findJobLineNumber(content, jobId);
        
        results.push({
          id: `production-environment-${jobId}`,
          type: 'security',
          severity: 'info',
          title: 'Production environment deployment detected',
          description: `Job '${jobId}' deploys to production environment '${envName}'. Ensure environment protection rules are configured.`,
          file: fileName,
          location: { job: jobId, line: jobLineNumber },
          suggestion: 'Configure environment protection rules including required reviewers and deployment branches.',
          links: ['https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment']
        });
      }
    }
  });

  // === MATRIX_INJECTION ===
  // Detect matrix strategy values used in dangerous shell contexts
  Object.entries(workflow.jobs).forEach(([jobId, job]) => {
    if (!job.steps || !Array.isArray(job.steps)) return;
    const jobStrategy = (job as Record<string, unknown>).strategy as Record<string, unknown> | undefined;
    if (!jobStrategy?.matrix) return;
    const matrixStr = JSON.stringify(jobStrategy.matrix);
    const isUserControlled = matrixStr.includes('fromJSON(inputs.') || matrixStr.includes('fromJSON(github.event.');
    
    job.steps.forEach((step, stepIndex) => {
      if (!step.run) return;
      const matrixVarPattern = /\$\{\{\s*matrix\.([^}]+)\}\}/g;
      const matches = step.run.matchAll(matrixVarPattern);
      for (const match of matches) {
        const dangerousContexts = [
          /\|\s*(sh|bash|zsh)/,
          /eval/,
          />>/,
        ];
        if (isUserControlled || dangerousContexts.some(p => p.test(step.run!))) {
          const stepLineNumber = findStepLineNumber(content, jobId, stepIndex);
          results.push({
            id: `matrix-injection-${jobId}-${stepIndex}`,
            type: 'security',
            severity: 'error',
            title: 'Matrix strategy injection',
            description: `Matrix variable \${{ matrix.${match[1]} }} used in shell context — attacker-controlled matrix values can inject commands`,
            file: fileName,
            location: { job: jobId, step: stepIndex, line: stepLineNumber },
            suggestion: 'Assign matrix values to environment variables instead of interpolating directly in run scripts.',
            links: ['https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions#understanding-the-risk-of-script-injections'],
            githubUrl: createGitHubLink(githubContext, stepLineNumber),
            codeSnippet: extractStepSnippet(content, jobId, stepIndex) || undefined
          });
          break; // one finding per step
        }
      }
    });
  });

  // === SECRETS_INHERIT ===
  // Detect reusable workflows or callers using secrets: inherit
  const secretsInheritPattern = /secrets:\s*inherit/gi;
  const inheritMatches = content.matchAll(secretsInheritPattern);
  for (const match of inheritMatches) {
    const lineNumber = findLineNumber(content, match[0]);
    const matchedLine = content.split('\n')[lineNumber - 1]?.trim() || '';
    if (matchedLine.startsWith('#')) continue;
    results.push({
      id: `secrets-inherit-${lineNumber}`,
      type: 'security',
      severity: 'warning',
      title: 'Unrestricted secret inheritance',
      description: 'Using secrets: inherit passes all repository secrets to the called workflow without restriction.',
      file: fileName,
      location: { line: lineNumber },
      suggestion: 'Explicitly pass only required secrets instead of inheriting all.',
      links: ['https://docs.github.com/en/actions/using-workflows/reusing-workflows#passing-secrets-to-nested-workflows'],
      githubUrl: createGitHubLink(githubContext, lineNumber),
      codeSnippet: extractCodeSnippet(content, lineNumber, 2) || undefined
    });
  }

  // === CONTINUE_ON_ERROR_CRITICAL_JOB ===
  const criticalJobPatterns = ['deploy', 'prod', 'production', 'release', 'publish', 'security', 'auth'];
  Object.entries(workflow.jobs).forEach(([jobId, job]) => {
    const jobAny = job as Record<string, unknown>;
    if (jobAny['continue-on-error'] !== true && jobAny['continue-on-error'] !== 'true') return;
    const jobLower = jobId.toLowerCase();
    const isCritical = criticalJobPatterns.some(p => jobLower.includes(p));
    if (!isCritical) return;
    const lineNumber = findLineNumber(content, jobId + ':');
    results.push({
      id: `continue-on-error-${jobId}`,
      type: 'security',
      severity: 'warning',
      title: 'continue-on-error in critical job',
      description: `Critical job '${jobId}' has continue-on-error enabled, which may mask security failures.`,
      file: fileName,
      location: { job: jobId, line: lineNumber },
      suggestion: 'Remove continue-on-error from security-critical jobs to ensure failures are not silently ignored.',
      links: ['https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions#jobsjob_idcontinue-on-error'],
      githubUrl: createGitHubLink(githubContext, lineNumber)
    });
  });

  // === UNSOUND_CONTAINS ===
  // Detect vulnerable contains() in if conditions
  const unsoundContainsPatterns = [
    /contains\(.*github\.event.*,\s*'[^']*'\)/i,
    /contains\(.*github\.actor.*,\s*'[^']*'\)/i,
    /contains\(.*steps\..*\.outputs.*,\s*'[^']*'\)/i,
  ];
  Object.entries(workflow.jobs).forEach(([jobId, job]) => {
    const jobAny = job as Record<string, unknown>;
    const conditions: { condition: string; context: string; stepIndex?: number }[] = [];
    if (typeof jobAny.if === 'string') conditions.push({ condition: jobAny.if as string, context: 'job' });
    if (job.steps && Array.isArray(job.steps)) {
      job.steps.forEach((step, idx) => {
        if (typeof (step as Record<string, unknown>).if === 'string') {
          conditions.push({ condition: (step as Record<string, unknown>).if as string, context: 'step', stepIndex: idx });
        }
      });
    }
    conditions.forEach(({ condition, context, stepIndex }) => {
      if (!condition.includes('contains(')) return;
      for (const pattern of unsoundContainsPatterns) {
        if (pattern.test(condition)) {
          const lineNumber = findLineNumber(content, condition);
          results.push({
            id: `unsound-contains-${jobId}-${context}-${stepIndex ?? 0}`,
            type: 'security',
            severity: 'error',
            title: 'Bypassable contains() condition',
            description: `Condition uses contains() with user-controlled data: "${condition.substring(0, 80)}". Attackers can include the expected substring in larger malicious input.`,
            file: fileName,
            location: { job: jobId, step: stepIndex, line: lineNumber },
            suggestion: 'Use exact string comparison or startsWith() instead of contains() for security gates.',
            links: ['https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions'],
            githubUrl: createGitHubLink(githubContext, lineNumber)
          });
          break;
        }
      }
    });
  });

  // === CACHE_POISONING (CACHE_RESTORE_KEYS_TOO_BROAD + CACHE_WRITE_IN_PR_WORKFLOW) ===
  const hasPRTrigger = /\bon:\s*\[?.*pull_request[^_]/i.test(content) || /pull_request:/i.test(content);
  Object.entries(workflow.jobs).forEach(([jobId, job]) => {
    if (!job.steps || !Array.isArray(job.steps)) return;
    job.steps.forEach((step, stepIndex) => {
      if (!step.uses) return;
      if (!step.uses.includes('actions/cache')) return;
      const restoreKeys = step.with?.['restore-keys'];
      if (restoreKeys && typeof restoreKeys === 'string') {
        // Check if restore-keys lacks content hash (just a prefix like "npm-")
        if (!restoreKeys.includes('hashFiles') && !restoreKeys.includes('${{')) {
          const stepLineNumber = findStepLineNumber(content, jobId, stepIndex);
          results.push({
            id: `cache-broad-restore-${jobId}-${stepIndex}`,
            type: 'security',
            severity: 'warning',
            title: 'Broad cache restore-keys',
            description: 'Cache restore-keys without content hash allows poisoned caches from other branches to be restored.',
            file: fileName,
            location: { job: jobId, step: stepIndex, line: stepLineNumber },
            suggestion: 'Include hashFiles() in restore-keys or remove overly broad fallback keys.',
            links: ['https://docs.github.com/en/actions/using-workflows/caching-dependencies-to-speed-up-workflows'],
            githubUrl: createGitHubLink(githubContext, stepLineNumber),
            codeSnippet: extractStepSnippet(content, jobId, stepIndex) || undefined
          });
        }
      }
      // Cache write in PR workflow
      if (hasPRTrigger) {
        const stepLineNumber = findStepLineNumber(content, jobId, stepIndex);
        results.push({
          id: `cache-write-pr-${jobId}-${stepIndex}`,
          type: 'security',
          severity: 'info',
          title: 'Cache write in pull_request workflow',
          description: 'Writing cache from a pull_request workflow allows untrusted code to poison the cache for future runs on the default branch.',
          file: fileName,
          location: { job: jobId, step: stepIndex, line: stepLineNumber },
          suggestion: 'Use cache action in read-only mode for PR workflows, or restrict cache scope.',
          links: ['https://docs.github.com/en/actions/using-workflows/caching-dependencies-to-speed-up-workflows#restrictions-for-accessing-a-cache'],
          githubUrl: createGitHubLink(githubContext, stepLineNumber)
        });
      }
    });
  });

  // === ARTIPACKED_VULNERABILITY ===
  // Detect checkout + upload-artifact without path restriction (leaks .git with credentials)
  Object.entries(workflow.jobs).forEach(([jobId, job]) => {
    if (!job.steps || !Array.isArray(job.steps)) return;
    let hasCheckout = false;
    let checkoutHasPersistFalse = false;
    job.steps.forEach((step) => {
      if (step.uses?.includes('actions/checkout')) {
        hasCheckout = true;
        if (step.with?.['persist-credentials'] === false || step.with?.['persist-credentials'] === 'false') {
          checkoutHasPersistFalse = true;
        }
      }
    });
    if (!hasCheckout || checkoutHasPersistFalse) return;

    job.steps.forEach((step, stepIndex) => {
      if (!step.uses?.includes('actions/upload-artifact')) return;
      const path = step.with?.path;
      // Flag if uploading entire directory (. or no path or broad glob)
      if (!path || path === '.' || path === './' || path === '*' || path === '**') {
        const stepLineNumber = findStepLineNumber(content, jobId, stepIndex);
        results.push({
          id: `artipacked-${jobId}-${stepIndex}`,
          type: 'security',
          severity: 'warning',
          title: 'Artifact may leak git credentials',
          description: 'upload-artifact with broad path after checkout (without persist-credentials: false) may include .git directory with tokens.',
          file: fileName,
          location: { job: jobId, step: stepIndex, line: stepLineNumber },
          suggestion: 'Add persist-credentials: false to checkout, or specify explicit paths in upload-artifact.',
          links: ['https://github.com/nikitastupin/pwnhub/blob/main/artipacked.md'],
          githubUrl: createGitHubLink(githubContext, stepLineNumber),
          codeSnippet: extractStepSnippet(content, jobId, stepIndex) || undefined
        });
      }
    });
  });

  // === WORKFLOW_RUN_ARTIFACT_UNTRUSTED ===
  // Detect workflow_run that downloads artifacts without constraining run_id
  const hasWorkflowRunTrigger = /workflow_run:/i.test(content);
  if (hasWorkflowRunTrigger) {
    Object.entries(workflow.jobs).forEach(([jobId, job]) => {
      if (!job.steps || !Array.isArray(job.steps)) return;
      job.steps.forEach((step, stepIndex) => {
        if (!step.uses?.includes('actions/download-artifact') && !step.uses?.includes('dawidd6/action-download-artifact')) return;
        // Check if run_id is constrained
        const runId = step.with?.['run-id'] || step.with?.['run_id'];
        if (!runId) {
          const stepLineNumber = findStepLineNumber(content, jobId, stepIndex);
          results.push({
            id: `workflow-run-artifact-${jobId}-${stepIndex}`,
            type: 'security',
            severity: 'error',
            title: 'Untrusted artifact download in workflow_run',
            description: 'Downloading artifacts in workflow_run without constraining run_id allows supply chain attacks — any workflow run can supply malicious artifacts.',
            file: fileName,
            location: { job: jobId, step: stepIndex, line: stepLineNumber },
            suggestion: 'Constrain artifact download to a specific run_id from the triggering workflow: ${{ github.event.workflow_run.id }}',
            links: ['https://securitylab.github.com/research/github-actions-untrusted-input/'],
            githubUrl: createGitHubLink(githubContext, stepLineNumber),
            codeSnippet: extractStepSnippet(content, jobId, stepIndex) || undefined
          });
        }
      });
    });
  }

  // === DOCKER_EXEC_WITH_SECRETS_ON_FORK_CODE ===
  // Detect docker run with secrets in pull_request_target workflows without --network=none
  const hasPRTargetTrigger = /pull_request_target:/i.test(content);
  if (hasPRTargetTrigger) {
    Object.entries(workflow.jobs).forEach(([jobId, job]) => {
      if (!job.steps || !Array.isArray(job.steps)) return;
      job.steps.forEach((step, stepIndex) => {
        if (!step.run) return;
        const hasDocker = /docker\s+run\b/.test(step.run);
        if (!hasDocker) return;
        if (/--network[=\s]+none/.test(step.run)) return;
        const hasSecretEnv = /(-e|--env)\s+\w*(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)\w*/i.test(step.run) ||
          /(-e|--env)\s+\$\{\{\s*secrets\./i.test(step.run);
        if (!hasSecretEnv) return;
        const stepLineNumber = findStepLineNumber(content, jobId, stepIndex);
        results.push({
          id: `docker-secrets-fork-${jobId}-${stepIndex}`,
          type: 'security',
          severity: 'error',
          title: 'Docker container with secrets on fork code',
          description: 'Docker container receives secrets via environment variables in a pull_request_target workflow without network isolation. Fork code can exfiltrate secrets.',
          file: fileName,
          location: { job: jobId, step: stepIndex, line: stepLineNumber },
          suggestion: 'Add --network=none to docker run, or do not pass secrets to containers processing untrusted code.',
          links: ['https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions'],
          githubUrl: createGitHubLink(githubContext, stepLineNumber),
          codeSnippet: extractStepSnippet(content, jobId, stepIndex) || undefined
        });
      });
    });

    // === AI_AGENT_ON_UNTRUSTED_CODE ===
    // Detect reusable agent workflows called with secrets under pull_request_target
    const agentPatterns = [/review.*pr/i, /agent/i, /ai.*review/i, /code.*review/i, /auto.*review/i, /bot.*respond/i];
    Object.entries(workflow.jobs).forEach(([jobId, job]) => {
      const jobAny = job as Record<string, unknown>;
      const uses = jobAny.uses as string | undefined;
      if (!uses || !uses.includes('.github/workflows/')) return;
      const isAgent = agentPatterns.some(p => p.test(uses));
      if (!isAgent) return;
      // Check if secrets are passed
      const jobContent = content.substring(content.indexOf(jobId + ':'));
      const hasSecrets = /secrets:/i.test(jobContent.substring(0, jobContent.indexOf('\n  ') > 0 ? jobContent.indexOf('\n  ', 100) : 500));
      if (!hasSecrets) return;
      const lineNumber = findLineNumber(content, uses);
      results.push({
        id: `ai-agent-fork-${jobId}`,
        type: 'security',
        severity: 'error',
        title: 'AI agent processes untrusted fork code with secrets',
        description: `Reusable workflow '${uses}' appears to be an AI agent/review bot called with secrets under pull_request_target. Fork code can exploit the agent to exfiltrate secrets.`,
        file: fileName,
        location: { job: jobId, line: lineNumber },
        suggestion: 'Require maintainer approval labels before running agents. Use --network=none in downstream containers. Do not pass secrets to workflows processing fork code.',
        links: ['https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions'],
        githubUrl: createGitHubLink(githubContext, lineNumber)
      });
    });
  }

  // === IMPOSTOR_COMMIT ===
  // Detect git config commands that impersonate users or use variable-based identity
  const knownBotPattern = /user\.(name|email)\s+["']?(github-actions(\[bot\])?|dependabot\[bot\])["']?/i;
  const impostorPatterns = [
    /git\s+config\s+.*user\.name.*\$\{/i,   // Variable-based user name (most dangerous)
    /git\s+config\s+.*user\.email.*\$\{/i,  // Variable-based email
    /git\s+config\s+.*user\.name.*\$\(\(/i, // Command substitution in name
    /git\s+config\s+.*user\.email.*\$\(\(/i,
  ];
  Object.entries(workflow.jobs).forEach(([jobId, job]) => {
    if (!job.steps || !Array.isArray(job.steps)) return;
    job.steps.forEach((step, stepIndex) => {
      if (!step.run) return;
      // Check for variable-based identity (critical) or bot impersonation
      for (const pattern of impostorPatterns) {
        if (pattern.test(step.run)) {
          const stepLineNumber = findStepLineNumber(content, jobId, stepIndex);
          results.push({
            id: `impostor-commit-${jobId}-${stepIndex}`,
            type: 'security',
            severity: 'error',
            title: 'Impostor commit: variable-based git identity',
            description: 'Git user.name or user.email is set from a variable, allowing attacker-controlled commit authorship for supply chain attacks.',
            file: fileName,
            location: { job: jobId, step: stepIndex, line: stepLineNumber },
            suggestion: 'Use a fixed, verified identity or an official action (e.g., peter-evans/create-pull-request) instead of variable-based git config.',
            links: ['https://blog.gruntwork.io/how-to-spoof-any-user-on-github-and-what-to-do-to-prevent-it-e237e95b8deb'],
            githubUrl: createGitHubLink(githubContext, stepLineNumber),
            codeSnippet: extractStepSnippet(content, jobId, stepIndex) || undefined
          });
          return; // one finding per step
        }
      }
      // Check for bot impersonation (lower severity — usually legitimate automation)
      if (/git\s+config\s+.*user\.(name|email)/i.test(step.run) && !knownBotPattern.test(step.run)) {
        // Non-bot, non-variable identity — custom identity that could be impersonation
        const stepLineNumber = findStepLineNumber(content, jobId, stepIndex);
        results.push({
          id: `impostor-commit-${jobId}-${stepIndex}`,
          type: 'security',
          severity: 'warning',
          title: 'Impostor commit: custom git identity',
          description: 'Git commit identity is set to a custom name/email. Verify this is intentional and not impersonating a trusted author.',
          file: fileName,
          location: { job: jobId, step: stepIndex, line: stepLineNumber },
          suggestion: 'Use official GitHub Actions bot identity or a verified service account.',
          links: ['https://blog.gruntwork.io/how-to-spoof-any-user-on-github-and-what-to-do-to-prevent-it-e237e95b8deb'],
          githubUrl: createGitHubLink(githubContext, stepLineNumber),
          codeSnippet: extractStepSnippet(content, jobId, stepIndex) || undefined
        });
      }
    });
  });

  // Deduplicate: keep only one finding per (title + line) combination
  const seen = new Set<string>();
  const dedupedResults = results.filter(r => {
    const key = `${r.title}::${r.location?.line ?? r.location?.step ?? ''}::${r.file}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return dedupedResults;
}

/**
 * Enhanced security analysis with reachability analysis to reduce false positives
 */
export function analyzeSecurityIssuesWithReachability(
  workflow: WorkflowData, 
  fileName: string, 
  content: string, 
  githubContext: GitHubAnalysisContext = {}
): { 
  results: SecurityIssueWithReachability[]; 
  reachabilityStats: {
    totalIssues: number;
    reachableIssues: number;
    highRiskIssues: number;
    mitigatedIssues: number;
  }; 
  insights: AnalysisResult[] 
} {
  // First, run the standard security analysis
  const standardResults = analyzeSecurityIssues(workflow, fileName, content, githubContext);
  
  // Then enhance with reachability analysis
  const { enhancedResults, reachabilityStats } = enhanceSecurityAnalysisWithReachability(
    standardResults,
    workflow,
    content
  );
  
  // Generate additional insights from reachability analysis
  const insights = generateReachabilityInsights(enhancedResults, {
    triggers: Array.isArray(workflow.on) ? workflow.on : 
              typeof workflow.on === 'string' ? [workflow.on] : 
              Object.keys(workflow.on || {}),
    conditions: new Map(),
    environmentalFactors: {
      hasSecrets: content.includes('secrets.') || content.includes('${{ secrets'),
      hasPrivilegedTrigger: ['workflow_run', 'pull_request_target', 'repository_dispatch'].some(t => 
        content.includes(t)
      ),
      hasExternalActions: Object.values(workflow.jobs).some(job =>
        job.steps?.some(step => 
          step.uses && !step.uses.startsWith('actions/') && !step.uses.startsWith('./')
        )
      ),
      hasSelfHosted: content.includes('self-hosted')
    }
  });
  
  return {
    results: enhancedResults,
    reachabilityStats,
    insights
  };
}