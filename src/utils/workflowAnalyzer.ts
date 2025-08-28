import { WorkflowFile, AnalysisReport, AnalysisResult } from '../types/workflow';
import { analyzeSecurityIssuesWithReachability } from './analyzers/securityAnalyzer';
import { analyzePerformanceIssues } from './analyzers/performanceAnalyzer';
import { analyzeBestPractices } from './analyzers/bestPracticesAnalyzer';
import { analyzeDependencyIssues } from './analyzers/dependencyAnalyzer';
import { analyzeStructureIssues } from './analyzers/structureAnalyzer';
import { analyzeCallGraph, generateCallGraphInsights } from './analyzers/callGraphAnalyzer';
import { analyzeWorkflowContext, filterResultsByContext, addContextualRecommendations } from './contextAnalyzer';

// GitHub integration info for analyzers
export interface GitHubAnalysisContext {
  repoUrl?: string;
  filePath?: string;
  branch?: string;
}

function createGitHubAnalysisContext(file: WorkflowFile): GitHubAnalysisContext {
  if (file.source === 'github' && file.repoUrl && file.filePath) {
    return {
      repoUrl: file.repoUrl,
      filePath: file.filePath,
      branch: 'main' // Default branch, could be enhanced to detect actual branch
    };
  }
  return {};
}

export function analyzeWorkflow(file: WorkflowFile): AnalysisReport {
  if (!file.parsed) {
    return {
      fileId: file.id,
      fileName: file.name,
      results: [{
        id: 'parse-error',
        type: 'structure',
        severity: 'error',
        title: 'YAML Parsing Error',
        description: file.error || 'Failed to parse workflow file',
        file: file.name,
        location: { line: 1 },
        suggestion: 'Check YAML syntax and structure'
      }],
      summary: {
        totalIssues: 1,
        errorCount: 1,
        warningCount: 0,
        infoCount: 0,
        score: 0
      }
    };
  }

  const githubContext = createGitHubAnalysisContext(file);

  // Analyze workflow context for intelligent filtering
  const context = analyzeWorkflowContext(file.parsed, file.name, file.content);

  // Analyze call graph and dependencies
  const { results: callGraphResults, callGraphData } = analyzeCallGraph(
    file.parsed, 
    file.name, 
    file.content, 
    githubContext
  );

  // Analyze security issues with reachability analysis to reduce false positives
  const securityAnalysis = analyzeSecurityIssuesWithReachability(
    file.parsed, 
    file.name, 
    file.content, 
    githubContext
  );

  let results: AnalysisResult[] = [
    ...securityAnalysis.results, // Use enhanced security results with reachability data
    ...analyzePerformanceIssues(file.parsed, file.name, file.content, githubContext),
    ...analyzeBestPractices(file.parsed, file.name, file.content, githubContext),
    ...analyzeDependencyIssues(file.parsed, file.name, file.content, githubContext),
    ...analyzeStructureIssues(file.parsed, file.name, file.content, githubContext),
    ...callGraphResults,
    ...generateCallGraphInsights(callGraphData),
    ...securityAnalysis.insights // Add reachability insights
  ];

  // Apply context-based filtering and adjustments
  results = filterResultsByContext(results, context);
  results = addContextualRecommendations(results, context, file.name);

  const errorCount = results.filter(r => r.severity === 'error').length;
  const warningCount = results.filter(r => r.severity === 'warning').length;
  const infoCount = results.filter(r => r.severity === 'info').length;

  // Enhanced scoring algorithm that considers workflow context
  let score = 100;
  
  if (results.length > 0) {
    // Weight issues based on severity and context
    const criticalIssues = errorCount * 3;
    const importantIssues = warningCount * 2;
    const minorIssues = infoCount * 0.5; // Reduced weight for info issues
    
    // Adjust scoring based on workflow complexity
    const complexityFactor = context.isComplexWorkflow ? 1.2 : 0.8;
    const productionFactor = context.hasProductionIndicators ? 1.3 : 1.0;
    
    const weightedIssues = (criticalIssues + importantIssues + minorIssues) * complexityFactor * productionFactor;
    const maxPossibleIssues = context.isComplexWorkflow ? 30 : 15;
    
    score = Math.max(0, Math.round(100 - (weightedIssues / maxPossibleIssues) * 100));
    
    // Bonus points for good practices
    if (errorCount === 0) score = Math.min(100, score + 5);
    if (warningCount === 0 && errorCount === 0) score = Math.min(100, score + 5);
  }

  return {
    fileId: file.id,
    fileName: file.name,
    results,
    callGraphData: {
      jobDependencies: callGraphData.jobDependencies,
      actionUsage: callGraphData.actionUsage,
      criticalPaths: callGraphData.criticalPaths,
      isolatedJobs: callGraphData.isolatedJobs
    },
    reachabilityData: {
      stats: securityAnalysis.reachabilityStats,
      executionContext: {
        triggers: Array.isArray(file.parsed.on) ? file.parsed.on : 
                  typeof file.parsed.on === 'string' ? [file.parsed.on] : 
                  Object.keys(file.parsed.on || {}),
        hasPrivilegedTriggers: ['workflow_run', 'pull_request_target', 'repository_dispatch'].some(t => 
          file.content.includes(t)
        ),
        hasSecrets: file.content.includes('secrets.') || file.content.includes('${{ secrets'),
        conditionalJobs: Object.values(file.parsed.jobs).filter(job => job.if).length
      },
      insights: securityAnalysis.insights
    },
    summary: {
      totalIssues: results.length,
      errorCount,
      warningCount,
      infoCount,
      score
    }
  };
}

export function generateMarkdownReport(reports: AnalysisReport[]): string {
  const totalFiles = reports.length;
  const totalIssues = reports.reduce((sum, report) => sum + report.summary.totalIssues, 0);
  const averageScore = reports.reduce((sum, report) => sum + report.summary.score, 0) / totalFiles;

  let markdown = `# 🔍 GitHub Actions Workflow Analysis Report\n\n`;
  markdown += `**Generated**: ${new Date().toLocaleString()}\n`;
  markdown += `**Files Analyzed**: ${totalFiles}\n`;
  markdown += `**Total Issues**: ${totalIssues}\n`;
  markdown += `**Average Score**: ${averageScore.toFixed(1)}/100\n`;
  markdown += `**Enhanced with**: Code context snippets for better issue understanding\n`;
  markdown += `**Analyzed with**: [Flowlyt](https://github.com/harekrishnarai/flowlyt) - Advanced GitHub Actions Analyzer\n\n`;

  markdown += `## 📊 Analysis Summary\n\n`;
  
  // Summary by severity
  const totalErrors = reports.reduce((sum, r) => sum + r.summary.errorCount, 0);
  const totalWarnings = reports.reduce((sum, r) => sum + r.summary.warningCount, 0);
  const totalInfo = reports.reduce((sum, r) => sum + r.summary.infoCount, 0);
  
  markdown += `| Severity | Count | Description |\n`;
  markdown += `|----------|-------|-------------|\n`;
  markdown += `| ❌ Error | ${totalErrors} | Critical issues requiring immediate attention |\n`;
  markdown += `| ⚠️ Warning | ${totalWarnings} | Important issues that should be addressed |\n`;
  markdown += `| ℹ️ Info | ${totalInfo} | Informational notices and suggestions |\n\n`;

  // Add top issues section
  const allIssues = reports.flatMap(r => r.results);
  const criticalIssues = allIssues.filter(i => i.severity === 'error').slice(0, 3);
  
  if (criticalIssues.length > 0) {
    markdown += `## 🚨 Top Critical Issues\n\n`;
    criticalIssues.forEach((issue, index) => {
      markdown += `${index + 1}. **${issue.title}** (${issue.file})\n`;
      markdown += `   - ${issue.description}\n`;
      if (issue.suggestion) {
        markdown += `   - 💡 *${issue.suggestion}*\n`;
      }
      markdown += `\n`;
    });
  }

  markdown += `---\n\n`;

  reports.forEach(report => {
    markdown += `## 📄 ${report.fileName}\n\n`;
    
    // Score with visual indicator
    const scoreEmoji = report.summary.score >= 80 ? '🟢' : report.summary.score >= 60 ? '🟡' : '🔴';
    markdown += `**${scoreEmoji} Score**: ${report.summary.score}/100\n`;
    markdown += `**Issues Found**: ${report.summary.errorCount} errors, ${report.summary.warningCount} warnings, ${report.summary.infoCount} info\n\n`;

    if (report.results.length > 0) {
      // Group issues by type for better organization
      const issuesByType = report.results.reduce((acc, result) => {
        if (!acc[result.type]) acc[result.type] = [];
        acc[result.type].push(result);
        return acc;
      }, {} as Record<string, typeof report.results>);

      Object.entries(issuesByType).forEach(([type, issues]) => {
        const typeEmoji = type === 'security' ? '🔒' : 
                         type === 'performance' ? '⚡' : 
                         type === 'best-practices' ? '✨' : 
                         type === 'dependency' ? '📦' : '🏗️';
        
        markdown += `### ${typeEmoji} ${type.charAt(0).toUpperCase() + type.slice(1).replace('-', ' ')} Issues (${issues.length})\n\n`;
        
        issues.forEach(result => {
          const emoji = result.severity === 'error' ? '❌' : result.severity === 'warning' ? '⚠️' : 'ℹ️';
          markdown += `#### ${emoji} ${result.title}\n\n`;
          
          // Issue metadata table
          markdown += `| Property | Value |\n`;
          markdown += `|----------|-------|\n`;
          markdown += `| **Type** | ${result.type} |\n`;
          markdown += `| **Severity** | ${result.severity} |\n`;
          
          if (result.location) {
            let locationStr = '';
            if (result.location.line) locationStr += `Line ${result.location.line}`;
            if (result.location.job) locationStr += `, Job: ${result.location.job}`;
            if (result.location.step !== undefined) locationStr += `, Step: ${result.location.step + 1}`;
            markdown += `| **Location** | ${locationStr} |\n`;
          }
          
          markdown += `\n**Description**: ${result.description}\n\n`;
          
          if (result.suggestion) {
            markdown += `💡 **Suggestion**: ${result.suggestion}\n\n`;
          }

          if (result.codeSnippet) {
            markdown += `\n**📝 Code Context** (Lines ${result.codeSnippet.startLine}-${result.codeSnippet.endLine}):\n`;
            markdown += `\`\`\`yaml\n`;
            
            // Add line numbers and highlighting
            const lines = result.codeSnippet.content.split('\n');
            lines.forEach((line, index) => {
              const lineNumber = result.codeSnippet!.startLine + index;
              const isHighlighted = result.codeSnippet!.highlightLine && 
                lineNumber === result.codeSnippet!.startLine + result.codeSnippet!.highlightLine - 1;
              
              // Add line number prefix
              const prefix = `${lineNumber.toString().padStart(3, ' ')}: `;
              markdown += `${prefix}${line}${isHighlighted ? ' # ⚠️ Issue detected here' : ''}\n`;
            });
            
            markdown += `\`\`\`\n`;
            
            if (result.codeSnippet.highlightLine) {
              markdown += `> ⚠️ **Issue located at line ${result.codeSnippet.startLine + result.codeSnippet.highlightLine - 1}**\n`;
            }
            markdown += `\n`;
          }
          
          if (result.links && result.links.length > 0) {
            markdown += `**📚 References**:\n`;
            result.links.forEach(link => {
              markdown += `- [${link}](${link})\n`;
            });
            markdown += `\n`;
          }
          
          markdown += `---\n\n`;
        });
      });
    } else {
      markdown += `✅ **Excellent!** No issues found in this workflow file.\n\n`;
    }
  });

  markdown += `\n---\n\n`;
  markdown += `## 🎯 Quick Action Items\n\n`;
  
  const actionItems = reports.flatMap(r => r.results)
    .filter(i => i.severity === 'error')
    .slice(0, 5)
    .map((issue, index) => `${index + 1}. **${issue.file}**: ${issue.title} - ${issue.suggestion || 'Review and fix this issue'}`);
  
  if (actionItems.length > 0) {
    actionItems.forEach(item => markdown += `${item}\n`);
  } else {
    markdown += `🎉 **Great job!** No critical issues found that require immediate action.\n`;
  }
  
  markdown += `\n## 📈 Improvement Suggestions\n\n`;
  markdown += `- **Security**: Always pin actions to specific SHA commits for better security\n`;
  markdown += `- **Performance**: Implement caching strategies to speed up your workflows\n`;
  markdown += `- **Maintainability**: Add clear names and descriptions to all jobs and steps\n`;
  markdown += `- **Monitoring**: Set up proper error handling and notifications\n`;
  markdown += `- **Documentation**: Keep your workflow files well-documented and organized\n`;
  
  markdown += `\n---\n\n`;
  markdown += `<div align="center">\n\n`;
  markdown += `### 🚀 Powered by Flowlyt\n\n`;
  markdown += `*Advanced GitHub Actions Workflow Analyzer with Code Context*\n\n`;
  markdown += `[🌟 Star on GitHub](https://github.com/harekrishnarai/flowlyt) | [📖 Documentation](https://github.com/harekrishnarai/flowlyt#readme) | [🐛 Report Issues](https://github.com/harekrishnarai/flowlyt/issues)\n\n`;
  markdown += `**Features:**\n`;
  markdown += `- 🔍 Comprehensive security analysis with 50+ detection patterns\n`;
  markdown += `- 📝 Code snippet extraction for better issue understanding\n`;
  markdown += `- ⚡ Performance optimization recommendations\n`;
  markdown += `- 🎯 Best practices validation and suggestions\n`;
  markdown += `- 📊 Beautiful reports in Markdown and PDF formats\n\n`;
  markdown += `</div>\n`;

  return markdown;
}

export function generatePDFReport(reports: AnalysisReport[], githubInfo?: { repoUrl?: string, owner?: string, repo?: string }): Promise<{ blob: Blob, filename: string }> {
  return new Promise((resolve) => {
    import('jspdf').then(({ jsPDF }) => {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.width;
      const pageHeight = doc.internal.pageSize.height;
      let yPosition = 30;
      
      const colors = {
        primary: [33, 150, 243] as [number, number, number],
        secondary: [96, 125, 139] as [number, number, number],
        success: [76, 175, 80] as [number, number, number],
        warning: [255, 193, 7] as [number, number, number],
        error: [244, 67, 54] as [number, number, number],
        info: [3, 169, 244] as [number, number, number],
        text: [33, 33, 33] as [number, number, number],
        lightGrey: [245, 245, 245] as [number, number, number],
        white: [255, 255, 255] as [number, number, number],
        accent: [103, 58, 183] as [number, number, number],
        darkBlue: [25, 118, 210] as [number, number, number],
        gradient1: [63, 81, 181] as [number, number, number],
        gradient2: [48, 63, 159] as [number, number, number]
      };

      // Generate dynamic filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      let filename: string;
      
      if (githubInfo?.owner && githubInfo?.repo) {
        filename = `${githubInfo.owner}-${githubInfo.repo}-workflow-analysis.pdf`;
      } else {
        const firstFileName = reports[0]?.fileName?.replace(/\.(yml|yaml)$/, '') || 'workflow';
        filename = `${firstFileName}-analysis-${timestamp}.pdf`;
      }

      // Helper functions
      const resetTextFormatting = () => {
        doc.setTextColor(...colors.text);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
      };

      // Helper function to render code snippets
      const renderCodeSnippet = (codeSnippet: any, maxWidth: number) => {
        if (!codeSnippet) return 0;
        
        const codeLines = codeSnippet.content.split('\n');
        const snippetHeight = 8 + (codeLines.length * 4) + 8; // Header + lines + padding
        
        checkNewPage(snippetHeight + 10);
        
        // Code snippet header
        doc.setFillColor(240, 240, 240); // Light gray background
        doc.rect(30, yPosition, maxWidth - 60, 6, 'F');
        doc.setTextColor(...colors.secondary);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.text(`Code Context (Lines ${codeSnippet.startLine}-${codeSnippet.endLine})`, 32, yPosition + 4);
        yPosition += 8;
        
        // Code snippet background
        doc.setFillColor(248, 248, 248); // Very light gray for code
        const codeBlockHeight = codeLines.length * 4 + 4;
        doc.rect(30, yPosition, maxWidth - 60, codeBlockHeight, 'F');
        
        // Code snippet border
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.1);
        doc.rect(30, yPosition, maxWidth - 60, codeBlockHeight);
        
        // Render code lines
        doc.setTextColor(...colors.text);
        doc.setFont('courier', 'normal'); // Monospace font for code
        doc.setFontSize(7);
        
        codeLines.forEach((line: string, index: number) => {
          const lineNumber = codeSnippet.startLine + index;
          const isHighlighted = codeSnippet.highlightLine && 
            lineNumber === codeSnippet.startLine + codeSnippet.highlightLine - 1;
          
          const currentY = yPosition + 3 + (index * 4);
          
          // Highlight the problematic line
          if (isHighlighted) {
            doc.setFillColor(255, 251, 204); // Light yellow highlight
            doc.rect(32, currentY - 2, maxWidth - 64, 4, 'F');
          }
          
          // Line number (right-aligned in a small column)
          doc.setTextColor(150, 150, 150);
          doc.setFont('courier', 'normal');
          const lineNumStr = lineNumber.toString().padStart(3, ' ');
          doc.text(lineNumStr, 34, currentY);
          
          // Code content
          doc.setTextColor(...colors.text);
          const codeContent = line.substring(0, 80); // Truncate long lines
          doc.text(codeContent, 45, currentY);
        });
        
        yPosition += codeBlockHeight + 4;
        resetTextFormatting();
        
        return snippetHeight;
      };

      // Helper function to render best practices sections
      const renderBestPracticesSection = (practices: Array<{category: string, practices: string[]}>) => {
        practices.forEach(section => {
          checkNewPage(25);
          
          // Category header with modern styling
          doc.setFillColor(...colors.secondary);
          doc.roundedRect(20, yPosition - 3, pageWidth - 40, 12, 2, 2, 'F');
          doc.setTextColor(...colors.white);
          doc.setFontSize(12);
          doc.setFont('helvetica', 'bold');
          doc.text(section.category, 25, yPosition + 5);
          
          // Reset formatting after colored background
          resetTextFormatting();
          yPosition += 15;

          section.practices.forEach(practice => {
            checkNewPage(8);
            doc.setFontSize(10);
            const practiceText = doc.splitTextToSize(`• ${practice}`, pageWidth - 50);
            doc.text(practiceText, 25, yPosition);
            yPosition += practiceText.length * 5 + 3;
          });

          yPosition += 8;
        });
      };

      // Helper function to add best practices pages
      const addBestPracticesPages = () => {
        // Page 1: Security Best Practices
        doc.addPage();
        addHeader();
        currentPage++;
        yPosition = 40;

        addSectionHeader('GitHub Actions Security Best Practices', colors.error, 'Essential security guidelines for secure CI/CD workflows');

        const securityPractices = [
          {
            category: 'Secret Management',
            practices: [
              'Use GitHub Secrets for all sensitive data (API keys, passwords, tokens)',
              'Never hardcode secrets directly in workflow files',
              'Implement secret rotation policies and regular audits',
              'Use environment-specific secrets with appropriate scoping',
              'Consider using external secret management solutions for enterprise environments'
            ]
          },
          {
            category: 'Action Security',
            practices: [
              'Pin actions to specific SHA commits instead of using tags or branches',
              'Regularly review and update action versions for security patches',
              'Audit third-party actions before use in production workflows',
              'Implement action allowlisting in enterprise environments',
              'Use official actions from verified publishers when possible'
            ]
          },
          {
            category: 'Permission Management',
            practices: [
              'Follow principle of least privilege for workflow permissions',
              'Explicitly define required permissions using "permissions" key',
              'Avoid using "write-all" or overly broad permissions',
              'Regularly audit workflow permissions and access patterns',
              'Implement branch protection rules and required status checks'
            ]
          },
          {
            category: 'Code Security',
            practices: [
              'Implement code scanning and vulnerability assessments',
              'Use dependency scanning for security vulnerabilities',
              'Validate all inputs and sanitize user-provided data',
              'Implement proper error handling without exposing sensitive information',
              'Use security-focused linting and static analysis tools'
            ]
          }
        ];

        renderBestPracticesSection(securityPractices);

        // Page 2: Performance Best Practices
        doc.addPage();
        addHeader();
        currentPage++;
        yPosition = 40;

        addSectionHeader('Performance Optimization Best Practices', colors.warning, 'Strategies for efficient and fast CI/CD workflows');

        const performancePractices = [
          {
            category: 'Caching Strategies',
            practices: [
              'Implement dependency caching for package managers (npm, pip, maven, etc.)',
              'Cache build artifacts and intermediate results',
              'Use action-specific caching mechanisms when available',
              'Implement cache invalidation strategies for optimal performance',
              'Monitor cache hit rates and adjust strategies accordingly'
            ]
          },
          {
            category: 'Parallel Execution',
            practices: [
              'Use job parallelization for independent tasks',
              'Implement matrix builds for multi-environment testing',
              'Optimize job dependencies to minimize sequential execution',
              'Balance resource usage across concurrent jobs',
              'Consider workflow splitting for large monorepos'
            ]
          },
          {
            category: 'Resource Optimization',
            practices: [
              'Choose appropriate runner types for specific workloads',
              'Optimize Docker image usage and implement image caching',
              'Minimize workflow run duration to reduce costs',
              'Implement conditional execution to skip unnecessary steps',
              'Use workflow artifacts efficiently for data sharing between jobs'
            ]
          },
          {
            category: 'Monitoring & Metrics',
            practices: [
              'Implement workflow performance monitoring and alerting',
              'Track build times and resource usage patterns',
              'Set up failure notifications and automated remediation',
              'Monitor runner queue times and capacity planning',
              'Implement cost tracking and optimization strategies'
            ]
          }
        ];

        renderBestPracticesSection(performancePractices);

        // Page 3: Maintenance Best Practices
        doc.addPage();
        addHeader();
        currentPage++;
        yPosition = 40;

        addSectionHeader('Workflow Maintenance & Documentation', colors.info, 'Best practices for maintainable and well-documented workflows');

        const maintenancePractices = [
          {
            category: 'Documentation Standards',
            practices: [
              'Maintain comprehensive README documentation for all workflows',
              'Document workflow triggers, inputs, and expected outputs',
              'Include troubleshooting guides and common issue resolution',
              'Maintain changelog for workflow modifications',
              'Document dependencies and integration requirements'
            ]
          },
          {
            category: 'Code Organization',
            practices: [
              'Use consistent naming conventions for workflows and jobs',
              'Organize workflows logically by purpose and environment',
              'Implement reusable workflows and composite actions',
              'Maintain clean and readable YAML structure',
              'Use meaningful job and step names with clear descriptions'
            ]
          },
          {
            category: 'Version Control',
            practices: [
              'Implement proper branching strategies for workflow changes',
              'Use pull requests for all workflow modifications',
              'Maintain separate workflows for different environments',
              'Implement workflow testing and validation processes',
              'Tag stable workflow versions for production use'
            ]
          },
          {
            category: 'Compliance & Governance',
            practices: [
              'Implement organizational workflow policies and standards',
              'Maintain audit trails for all workflow executions',
              'Ensure compliance with industry regulations and standards',
              'Implement workflow approval processes for critical changes',
              'Regular workflow security and compliance reviews'
            ]
          }
        ];

        renderBestPracticesSection(maintenancePractices);

        // Add footer for all best practices pages (simplified footer approach)
        const totalPages = Math.ceil(reports.length) + 5;
        addFooter(currentPage - 2, totalPages);
        addFooter(currentPage - 1, totalPages);
        addFooter(currentPage, totalPages);
      };

      const addHeader = () => {
        // Modern gradient header using multiple rectangles for gradient effect
        doc.setFillColor(...colors.gradient1);
        doc.rect(0, 0, pageWidth, 30, 'F');
        
        // Add layered gradient effect
        doc.setFillColor(...colors.gradient2);
        doc.rect(0, 0, pageWidth / 2, 30, 'F');
        
        // Title with enhanced typography
        doc.setTextColor(...colors.white);
        doc.setFontSize(20);
        doc.setFont('helvetica', 'bold');
        doc.text('FLOWLYT', 20, 12);
        
        doc.setFontSize(14);
        doc.setFont('helvetica', 'normal');
        doc.text('GitHub Actions Workflow Analysis Report', 20, 22);
        
        // Add decorative line
        doc.setDrawColor(...colors.white);
        doc.setLineWidth(1);
        doc.line(20, 25, pageWidth - 20, 25);
        
        // Reset everything to default
        resetTextFormatting();
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.1);
      };

      const addFooter = (pageNum: number, totalPages: number) => {
        // Modern footer with gradient background
        doc.setFillColor(...colors.lightGrey);
        doc.rect(0, pageHeight - 20, pageWidth, 20, 'F');
        
        // Footer content
        doc.setFontSize(8);
        doc.setTextColor(...colors.secondary);
        doc.setFont('helvetica', 'normal');
        doc.text('Generated by Flowlyt - Enterprise Workflow Analysis Platform', 20, pageHeight - 12);
        
        // Page number with modern styling
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        const pageText = `${pageNum} / ${totalPages}`;
        const pageTextWidth = doc.getTextWidth(pageText);
        doc.text(pageText, pageWidth - 20 - pageTextWidth, pageHeight - 12);
        
        // Timestamp
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        const timeText = new Date().toLocaleString();
        const timeTextWidth = doc.getTextWidth(timeText);
        doc.text(timeText, pageWidth - 20 - timeTextWidth, pageHeight - 5);
        
        // Decorative line
        doc.setDrawColor(...colors.primary);
        doc.setLineWidth(0.5);
        doc.line(20, pageHeight - 18, pageWidth - 20, pageHeight - 18);
        
        // Reset
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.1);
        doc.setTextColor(...colors.text);
      };

      const checkNewPage = (requiredSpace: number = 50) => {
        if (yPosition + requiredSpace > pageHeight - 35) {
          doc.addPage();
          addHeader();
          yPosition = 45;
          return true;
        }
        return false;
      };

      const addSectionHeader = (title: string, color: [number, number, number] = colors.primary, subtitle?: string) => {
        checkNewPage(30);
        
        // Modern section header with rounded corners effect
        doc.setFillColor(...color);
        doc.roundedRect(15, yPosition - 5, pageWidth - 30, 18, 2, 2, 'F');
        
        // Title
        doc.setTextColor(...colors.white);
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text(title, 20, yPosition + 7);
        
        // Reset colors after title and move past the colored background
        resetTextFormatting();
        yPosition += 25;
        
        // Subtitle if provided - render AFTER the colored background with proper formatting
        if (subtitle) {
          doc.setFontSize(11);
          doc.setTextColor(...colors.secondary);
          doc.setFont('helvetica', 'italic');
          const splitSubtitle = doc.splitTextToSize(subtitle, pageWidth - 40);
          doc.text(splitSubtitle, 20, yPosition);
          yPosition += splitSubtitle.length * 5 + 10;
          
          // Reset formatting again
          resetTextFormatting();
        }
      };

      const addMetricBox = (label: string, value: string, color: [number, number, number], x: number, width: number = 40, height: number = 28) => {
        // Modern card-style metric box with shadow effect
        doc.setFillColor(240, 240, 240);
        doc.roundedRect(x + 1, yPosition + 1, width, height, 3, 3, 'F'); // Shadow
        
        doc.setFillColor(...colors.white);
        doc.roundedRect(x, yPosition, width, height, 3, 3, 'F');
        
        // Colored top border
        doc.setFillColor(...color);
        doc.roundedRect(x, yPosition, width, 4, 3, 3, 'F');
        
        // Value with enhanced typography
        doc.setTextColor(...color);
        doc.setFontSize(20);
        doc.setFont('helvetica', 'bold');
        const valueWidth = doc.getTextWidth(value);
        doc.text(value, x + (width - valueWidth) / 2, yPosition + 18);
        
        // Label
        doc.setTextColor(...colors.text);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        const labelWidth = doc.getTextWidth(label);
        doc.text(label, x + (width - labelWidth) / 2, yPosition + 24);
        
        // Subtle border
        doc.setDrawColor(220, 220, 220);
        doc.setLineWidth(0.3);
        doc.roundedRect(x, yPosition, width, height, 3, 3, 'S');
        
        // Reset
        doc.setLineWidth(0.1);
        doc.setDrawColor(0, 0, 0);
      };

      // Calculate totals for executive summary
      const totalFiles = reports.length;
      const totalIssues = reports.reduce((sum, report) => sum + report.summary.totalIssues, 0);
      const totalErrors = reports.reduce((sum, report) => sum + report.summary.errorCount, 0);
      const totalWarnings = reports.reduce((sum, report) => sum + report.summary.warningCount, 0);
      const totalInfo = reports.reduce((sum, report) => sum + report.summary.infoCount, 0);
      const averageScore = reports.reduce((sum, report) => sum + report.summary.score, 0) / totalFiles;

      // Page 1: Executive Summary with Repository Information
      addHeader();
      yPosition = 50;

      // Repository Information Section (if GitHub repo)
      if (githubInfo?.repoUrl && githubInfo?.owner && githubInfo?.repo) {
        addSectionHeader('Repository Analysis Overview', colors.darkBlue, 
          `Comprehensive workflow security and performance assessment for ${githubInfo.owner}/${githubInfo.repo}`);
        
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...colors.primary);
        doc.text(`Repository: ${githubInfo.owner}/${githubInfo.repo}`, 20, yPosition);
        yPosition += 8;
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...colors.secondary);
        doc.text(`Source: ${githubInfo.repoUrl}`, 20, yPosition);
        doc.setTextColor(...colors.text);
        yPosition += 15;
        
        const repoSummaryText = `This analysis provides a comprehensive evaluation of GitHub Actions workflows within the ${githubInfo.repo} repository. Our enterprise-grade scanning engine has examined ${totalFiles} workflow file${totalFiles !== 1 ? 's' : ''} across multiple dimensions including security vulnerabilities, performance bottlenecks, compliance with industry best practices, dependency management strategies, and overall architectural integrity.`;
        
        // Ensure text color is set correctly for summary
        resetTextFormatting();
        const splitRepoSummary = doc.splitTextToSize(repoSummaryText, pageWidth - 40);
        doc.text(splitRepoSummary, 20, yPosition);
        yPosition += splitRepoSummary.length * 5 + 20;
      } else {
        addSectionHeader('Workflow Analysis Overview', colors.darkBlue, 
          `Enterprise-grade analysis of uploaded workflow configurations`);
        
        const uploadSummaryText = `This comprehensive analysis report provides detailed insights into ${totalFiles} GitHub Actions workflow file${totalFiles !== 1 ? 's' : ''} that have been uploaded for examination. Our advanced analysis engine has conducted a thorough evaluation across multiple critical dimensions including security vulnerabilities, performance optimization opportunities, adherence to industry best practices, dependency management protocols, and structural integrity assessment.`;
        
        // Ensure text color is set correctly for summary
        resetTextFormatting();
        const splitUploadSummary = doc.splitTextToSize(uploadSummaryText, pageWidth - 40);
        doc.text(splitUploadSummary, 20, yPosition);
        yPosition += splitUploadSummary.length * 5 + 20;
      }

      // Key Metrics Dashboard with Modern Layout
      addSectionHeader('Executive Dashboard', colors.info, 'Key performance indicators and risk metrics');
      
      // First row of metrics with enhanced spacing
      addMetricBox('Files Analyzed', totalFiles.toString(), colors.primary, 20, 38, 32);
      addMetricBox('Total Issues', totalIssues.toString(), colors.warning, 68, 38, 32);
      addMetricBox('Quality Score', `${averageScore.toFixed(1)}/100`, 
        averageScore >= 80 ? colors.success : averageScore >= 60 ? colors.warning : colors.error, 116, 42, 32);
      addMetricBox('Critical Errors', totalErrors.toString(), colors.error, 168, 38, 32);
      
      yPosition += 42;
      
      // Second row of metrics
      addMetricBox('Warnings', totalWarnings.toString(), colors.warning, 20, 38, 32);
      addMetricBox('Info Items', totalInfo.toString(), colors.info, 68, 38, 32);
      
      const securityIssues = reports.reduce((sum, report) => 
        sum + report.results.filter(r => r.type === 'security').length, 0);
      const performanceIssues = reports.reduce((sum, report) => 
        sum + report.results.filter(r => r.type === 'performance').length, 0);
      
      addMetricBox('Security Issues', securityIssues.toString(), colors.error, 116, 42, 32);
      addMetricBox('Performance', performanceIssues.toString(), colors.warning, 168, 38, 32);
      
      yPosition += 55;

      // Enhanced Risk Assessment with Visual Indicators
      addSectionHeader('Risk Assessment & Strategic Recommendations', colors.error, 'Comprehensive security and operational risk evaluation');
      
      const riskLevel = totalErrors > 0 ? 'HIGH' : totalWarnings > 5 ? 'MEDIUM' : 'LOW';
      const riskColor = riskLevel === 'HIGH' ? colors.error : riskLevel === 'MEDIUM' ? colors.warning : colors.success;
      
      // Risk level indicator with modern styling
      doc.setFillColor(...riskColor);
      doc.roundedRect(20, yPosition - 2, 80, 16, 3, 3, 'F');
      doc.setTextColor(...colors.white);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text(`RISK LEVEL: ${riskLevel}`, 25, yPosition + 8);
      
      // Risk score calculation - reset formatting first
      const riskScore = Math.max(0, Math.min(100, (totalErrors * 15 + totalWarnings * 5 + securityIssues * 10)));
      resetTextFormatting();
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.text(`Risk Score: ${riskScore}/100`, 110, yPosition + 8);
      yPosition += 25;

      // Detailed risk analysis
      const riskAnalysis = [
        `Security Posture: ${securityIssues === 0 ? 'Strong - No security vulnerabilities detected' : `${securityIssues} security issue${securityIssues !== 1 ? 's' : ''} requiring immediate attention`}`,
        `Operational Stability: ${totalErrors === 0 ? 'Stable - No critical errors found' : `${totalErrors} critical error${totalErrors !== 1 ? 's' : ''} may impact workflow execution`}`,
        `Performance Optimization: ${performanceIssues === 0 ? 'Optimized - No performance issues detected' : `${performanceIssues} optimization opportunit${performanceIssues !== 1 ? 'ies' : 'y'} identified`}`,
        `Compliance Status: ${averageScore >= 80 ? 'Compliant - Workflows follow industry best practices' : 'Non-compliant - Multiple best practice violations detected'}`
      ];

      // Ensure text color is set correctly for analysis
      resetTextFormatting();
      doc.setFontSize(10);
      riskAnalysis.forEach(analysis => {
        const splitAnalysis = doc.splitTextToSize(`• ${analysis}`, pageWidth - 40);
        doc.text(splitAnalysis, 20, yPosition);
        yPosition += splitAnalysis.length * 5 + 3;
      });

      yPosition += 10;

      // Strategic Recommendations with Priority Levels
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...colors.primary);
      doc.text('Strategic Recommendations:', 20, yPosition);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...colors.text);
      yPosition += 10;

      const strategicRecommendations = [
        { 
          priority: 'CRITICAL', 
          text: 'Immediate security remediation required for identified vulnerabilities',
          show: totalErrors > 0,
          color: colors.error
        },
        { 
          priority: 'HIGH', 
          text: 'Implement comprehensive workflow monitoring and alerting systems',
          show: totalWarnings > 3,
          color: colors.warning
        },
        { 
          priority: 'MEDIUM', 
          text: 'Establish regular security audits and compliance reviews',
          show: securityIssues > 0,
          color: colors.info
        },
        { 
          priority: 'LOW', 
          text: 'Optimize workflow performance and resource utilization',
          show: performanceIssues > 0,
          color: colors.success
        }
      ].filter(rec => rec.show);

      strategicRecommendations.forEach(rec => {
        doc.setFillColor(...rec.color);
        doc.roundedRect(20, yPosition - 2, 25, 8, 2, 2, 'F');
        doc.setTextColor(...colors.white);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.text(rec.priority, 22, yPosition + 3);
        
        doc.setTextColor(...colors.text);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        const recText = doc.splitTextToSize(rec.text, pageWidth - 60);
        doc.text(recText, 50, yPosition + 2);
        yPosition += Math.max(8, recText.length * 5) + 3;
      });

      if (strategicRecommendations.length === 0) {
        doc.setFontSize(10);
        doc.setTextColor(...colors.success);
        doc.text('✓ All workflows demonstrate excellent security and operational practices', 20, yPosition);
        yPosition += 10;
      }

      // Enhanced Analysis Methodology
      yPosition += 15;
      addSectionHeader('Analysis Methodology & Standards', colors.secondary, 'Industry-leading assessment framework and compliance standards');
      
      const methodologyDetails = [
        {
          category: 'Security Analysis Framework',
          description: 'Advanced threat detection scanning for hardcoded secrets, permission misconfigurations, unsafe action usage, supply chain vulnerabilities, and compliance with OWASP CI/CD security guidelines.'
        },
        {
          category: 'Performance Optimization Assessment',
          description: 'Comprehensive evaluation of caching strategies, resource utilization, parallel execution opportunities, dependency management, and workflow execution efficiency metrics.'
        },
        {
          category: 'Best Practices Compliance',
          description: 'Systematic review against industry standards including proper naming conventions, comprehensive documentation, error handling protocols, and maintainability guidelines.'
        },
        {
          category: 'Dependency Management Evaluation',
          description: 'Analysis of action versioning strategies, security vulnerability assessments, update policies, and supply chain risk management practices.'
        },
        {
          category: 'Structural Integrity Validation',
          description: 'Assessment of workflow architecture, job dependencies, conditional logic, error propagation, and overall system reliability patterns.'
        }
      ];

      doc.setFontSize(10);
      methodologyDetails.forEach(method => {
        checkNewPage(20);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...colors.primary);
        doc.text(`${method.category}:`, 20, yPosition);
        yPosition += 6;
        
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...colors.text);
        const splitDesc = doc.splitTextToSize(method.description, pageWidth - 40);
        doc.text(splitDesc, 20, yPosition);
        yPosition += splitDesc.length * 5 + 8;
      });

      // Keep track of pages for footer
      let currentPage = 1;
      addFooter(currentPage, Math.ceil(reports.length) + 2);

      // Page 2: Individual File Analysis
      reports.forEach((report) => {
        doc.addPage();
        addHeader();
        currentPage++;
        yPosition = 40;

        // File header with enhanced styling
        addSectionHeader(`Detailed Analysis: ${report.fileName}`, colors.primary, 
          `Comprehensive evaluation of workflow security, performance, and compliance`);
        
        // Enhanced file score card with modern metrics
        const scoreColor = report.summary.score >= 80 ? colors.success : 
                          report.summary.score >= 60 ? colors.warning : colors.error;
        
        addMetricBox('Quality Score', `${report.summary.score}/100`, scoreColor, 20, 45, 32);
        addMetricBox('Errors', report.summary.errorCount.toString(), colors.error, 75, 32, 32);
        addMetricBox('Warnings', report.summary.warningCount.toString(), colors.warning, 117, 32, 32);
        addMetricBox('Info', report.summary.infoCount.toString(), colors.info, 159, 32, 32);
        
        yPosition += 45;

        // Issues breakdown by category
        if (report.results.length > 0) {
          addSectionHeader('Issues by Category', colors.secondary);
          
          const issuesByType = {
            security: report.results.filter(r => r.type === 'security'),
            performance: report.results.filter(r => r.type === 'performance'),
            'best-practice': report.results.filter(r => r.type === 'best-practice'),
            dependency: report.results.filter(r => r.type === 'dependency'),
            structure: report.results.filter(r => r.type === 'structure')
          };

          Object.entries(issuesByType).forEach(([type, issues]) => {
            if (issues.length > 0) {
              checkNewPage(15);
              
              // Category header
              doc.setFontSize(12);
              doc.setFont('helvetica', 'bold');
              const typeColor = type === 'security' ? colors.error : 
                               type === 'performance' ? colors.warning : 
                               type === 'dependency' ? colors.info : colors.primary;
              
              // Create a subtle background for category header
              doc.setFillColor(...typeColor);
              doc.rect(20, yPosition - 3, pageWidth - 40, 12, 'F');
              doc.setTextColor(...colors.white);
              doc.text(`${type.charAt(0).toUpperCase() + type.slice(1).replace('-', ' ')} Issues (${issues.length})`, 25, yPosition + 5);
              
              // Reset text formatting after colored background
              resetTextFormatting();
              yPosition += 15;

              // Issues list
              issues.slice(0, 5).forEach((issue) => {
                checkNewPage(20);
                
                // Use text-based severity indicators instead of emoji for PDF compatibility
                const severitySymbol = issue.severity === 'error' ? '[ERROR]' : 
                                     issue.severity === 'warning' ? '[WARN]' : '[INFO]';
                const severityColor = issue.severity === 'error' ? colors.error : 
                                     issue.severity === 'warning' ? colors.warning : colors.info;
                
                doc.setFontSize(10);
                doc.setFont('helvetica', 'bold');
                
                // Draw severity indicator with color
                doc.setTextColor(...severityColor);
                doc.text(severitySymbol, 25, yPosition);
                
                // Reset color for title
                doc.setTextColor(...colors.text);
                const severityWidth = doc.getTextWidth(severitySymbol);
                doc.text(issue.title, 25 + severityWidth + 3, yPosition);
                doc.setFont('helvetica', 'normal');
                yPosition += 8;
                
                doc.setFontSize(9);
                doc.setTextColor(...colors.text);
                const descriptionText = doc.splitTextToSize(issue.description, pageWidth - 50);
                doc.text(descriptionText, 30, yPosition);
                yPosition += descriptionText.length * 4 + 2;
                
                if (issue.location?.line) {
                  doc.setTextColor(...colors.secondary);
                  doc.setFontSize(8);
                  const locationText = `Location: Line ${issue.location.line}${issue.location.job ? `, Job: ${issue.location.job}` : ''}`;
                  doc.text(locationText, 30, yPosition);
                  doc.setTextColor(...colors.text);
                  yPosition += 4;
                }
                
                // Render code snippet if available
                if (issue.codeSnippet) {
                  yPosition += 2;
                  renderCodeSnippet(issue.codeSnippet, pageWidth);
                  yPosition += 2;
                }
                
                if (issue.suggestion) {
                  doc.setTextColor(...colors.success);
                  doc.setFontSize(8);
                  doc.setFont('helvetica', 'italic');
                  const suggestionText = doc.splitTextToSize(`Suggestion: ${issue.suggestion}`, pageWidth - 50);
                  doc.text(suggestionText, 30, yPosition);
                  doc.setTextColor(...colors.text);
                  doc.setFont('helvetica', 'normal');
                  yPosition += suggestionText.length * 4;
                }
                
                yPosition += 6;
              });

              if (issues.length > 5) {
                doc.setFontSize(9);
                doc.setTextColor(...colors.secondary);
                doc.setFont('helvetica', 'italic');
                doc.text(`... and ${issues.length - 5} more ${type.replace('-', ' ')} issues (view full report for details)`, 30, yPosition);
                doc.setTextColor(...colors.text);
                doc.setFont('helvetica', 'normal');
                yPosition += 8;
              }
              
              yPosition += 5;
            }
          });

          // Recommendations section
          addSectionHeader('Recommendations', colors.success);
          
          const criticalRecommendations = report.results
            .filter(r => r.severity === 'error' && r.suggestion)
            .slice(0, 3);
            
          if (criticalRecommendations.length > 0) {
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.text('Priority Actions:', 20, yPosition);
            doc.setFont('helvetica', 'normal');
            yPosition += 8;
            
            criticalRecommendations.forEach((rec, index) => {
              checkNewPage(15);
              doc.setFontSize(10);
              const recText = doc.splitTextToSize(`${index + 1}. ${rec.suggestion}`, pageWidth - 40);
              doc.text(recText, 25, yPosition);
              yPosition += recText.length * 5 + 3;
            });
          }

          const generalRecommendations = [
            'Review and update action versions to latest stable releases',
            'Implement proper secret management using GitHub Secrets',
            'Add comprehensive error handling and retry logic',
            'Optimize workflow performance with dependency caching',
            'Document complex workflow logic with inline comments'
          ];

          if (yPosition < pageHeight - 60) {
            yPosition += 10;
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.text('General Best Practices:', 20, yPosition);
            doc.setFont('helvetica', 'normal');
            yPosition += 8;
            
            generalRecommendations.forEach(rec => {
              checkNewPage(10);
              doc.setFontSize(10);
              const recText = doc.splitTextToSize(`• ${rec}`, pageWidth - 40);
              doc.text(recText, 25, yPosition);
              yPosition += recText.length * 5 + 2;
            });
          }
        } else {
          // No issues found
          checkNewPage(30);
          doc.setFillColor(...colors.success);
          doc.rect(20, yPosition, pageWidth - 40, 20, 'F');
          doc.setTextColor(...colors.white);
          doc.setFontSize(14);
          doc.setFont('helvetica', 'bold');
          doc.text('✓ No Issues Found!', 25, yPosition + 12);
          
          // Reset text formatting after colored background
          resetTextFormatting();
          yPosition += 25;
          
          doc.setFontSize(11);
          doc.text('This workflow follows all security, performance, and best practice guidelines.', 25, yPosition);
        }

        addFooter(currentPage, Math.ceil(reports.length) + 5); // Updated page count for new pages
      });

      // NEW: Add Generic Best Practices Pages
      addBestPracticesPages();

      // Final page: Summary and next steps
      doc.addPage();
      addHeader();
      currentPage++;
      yPosition = 40;

      addSectionHeader('Action Plan & Next Steps', colors.primary, 'Prioritized recommendations based on analysis findings');
      
      const actionItems = [
        {
          priority: 'HIGH',
          title: 'Address Critical Security Issues',
          description: `${totalErrors} critical errors require immediate attention`,
          timeframe: 'Within 24 hours',
          show: totalErrors > 0
        },
        {
          priority: 'MEDIUM',
          title: 'Performance Optimization',
          description: `${totalWarnings} warnings should be reviewed and resolved`,
          timeframe: 'Within 1 week',
          show: totalWarnings > 0
        },
        {
          priority: 'LOW',
          title: 'Best Practice Implementation',
          description: `${totalInfo} recommendations for workflow improvement`,
          timeframe: 'Within 1 month',
          show: totalInfo > 0
        }
      ].filter(item => item.show);

      // Add some spacing before action items
      yPosition += 5;

      actionItems.forEach((item, index) => {
        checkNewPage(35);
        
        const priorityColor = item.priority === 'HIGH' ? colors.error :
                             item.priority === 'MEDIUM' ? colors.warning : colors.info;
        
        // Add spacing between items
        if (index > 0) {
          yPosition += 10;
        }
        
        // Priority badge with better styling
        doc.setFillColor(...priorityColor);
        doc.roundedRect(20, yPosition, 30, 10, 2, 2, 'F');
        doc.setTextColor(...colors.white);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        const priorityWidth = doc.getTextWidth(item.priority);
        doc.text(item.priority, 20 + (30 - priorityWidth) / 2, yPosition + 7);
        
        // Action item title with proper spacing
        resetTextFormatting();
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...colors.text);
        doc.text(item.title, 60, yPosition + 7);
        yPosition += 15;
        
        // Description with proper indentation
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...colors.text);
        doc.text(item.description, 25, yPosition);
        yPosition += 8;
        
        // Timeframe with better styling
        doc.setFontSize(10);
        doc.setTextColor(...colors.secondary);
        doc.setFont('helvetica', 'italic');
        doc.text(`Recommended timeframe: ${item.timeframe}`, 25, yPosition);
        yPosition += 6;
        
        // Add separator line except for last item
        if (index < actionItems.length - 1) {
          doc.setDrawColor(...colors.lightGrey);
          doc.setLineWidth(0.5);
          doc.line(20, yPosition + 5, pageWidth - 20, yPosition + 5);
          doc.setDrawColor(0, 0, 0);
          doc.setLineWidth(0.1);
        }
        
        resetTextFormatting();
      });

      // Tool information with analysis insights
      yPosition += 10;
      addSectionHeader('About This Analysis', colors.info);
      
      doc.setFontSize(10);
      const aboutText = [
        'Flowlyt is an enterprise-grade GitHub Actions workflow analysis tool designed to help',
        'organizations maintain secure, performant, and well-structured CI/CD pipelines.',
        '',
        'Analysis Quality Insights:',
        `• Analyzed ${totalFiles} workflow file${totalFiles !== 1 ? 's' : ''} with context-aware intelligence`,
        `• Applied ${totalErrors + totalWarnings + totalInfo} recommendations with smart filtering`,
        `• Detected workflow types and complexity for targeted analysis`,
        `• Reduced false positives through intelligent context analysis`,
        '',
        'Key Features:',
        '• Comprehensive security vulnerability scanning',
        '• Performance optimization recommendations',
        '• Context-aware best practice compliance checking',
        '• Intelligent dependency management analysis',
        '• Structural integrity validation with smart filtering',
        '',
        'For more information, visit: https://github.com/harekrishnarai/flowlyt'
      ];

      aboutText.forEach(line => {
        if (line === '') {
          yPosition += 3;
        } else {
          checkNewPage(8);
          doc.text(line, 20, yPosition);
          yPosition += 5;
        }
      });

      addFooter(currentPage, currentPage);

      // Generate and return the PDF blob with filename
      const pdfBlob = new Blob([doc.output('blob')], { type: 'application/pdf' });
      resolve({ blob: pdfBlob, filename });
    });
  });
}