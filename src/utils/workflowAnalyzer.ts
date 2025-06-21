import { WorkflowFile, AnalysisReport, AnalysisResult } from '../types/workflow';
import { analyzeSecurityIssues } from './analyzers/securityAnalyzer';
import { analyzePerformanceIssues } from './analyzers/performanceAnalyzer';
import { analyzeBestPractices } from './analyzers/bestPracticesAnalyzer';
import { analyzeDependencyIssues } from './analyzers/dependencyAnalyzer';
import { analyzeStructureIssues } from './analyzers/structureAnalyzer';

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

  const results: AnalysisResult[] = [
    ...analyzeSecurityIssues(file.parsed, file.name, file.content, githubContext),
    ...analyzePerformanceIssues(file.parsed, file.name, file.content, githubContext),
    ...analyzeBestPractices(file.parsed, file.name, file.content, githubContext),
    ...analyzeDependencyIssues(file.parsed, file.name, file.content, githubContext),
    ...analyzeStructureIssues(file.parsed, file.name, file.content, githubContext)
  ];

  const errorCount = results.filter(r => r.severity === 'error').length;
  const warningCount = results.filter(r => r.severity === 'warning').length;
  const infoCount = results.filter(r => r.severity === 'info').length;

  // Calculate score (0-100)
  let score = 100;
  
  if (results.length > 0) {
    const maxPossibleIssues = 20;
    const weightedIssues = errorCount * 3 + warningCount * 2 + infoCount * 1;
    score = Math.max(0, Math.round(100 - (weightedIssues / maxPossibleIssues) * 100));
  }

  return {
    fileId: file.id,
    fileName: file.name,
    results,
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

  let markdown = `# GitHub Actions Workflow Analysis Report\n\n`;
  markdown += `**Generated**: ${new Date().toLocaleString()}\n`;
  markdown += `**Files Analyzed**: ${totalFiles}\n`;
  markdown += `**Total Issues**: ${totalIssues}\n`;
  markdown += `**Average Score**: ${averageScore.toFixed(1)}/100\n`;
  markdown += `**Analyzed with**: [Flowlyt](https://github.com/harekrishnarai/flowlyt)\n\n`;

  reports.forEach(report => {
    markdown += `## ${report.fileName}\n\n`;
    markdown += `**Score**: ${report.summary.score}/100\n`;
    markdown += `**Issues**: ${report.summary.errorCount} errors, ${report.summary.warningCount} warnings, ${report.summary.infoCount} info\n\n`;

    if (report.results.length > 0) {
      report.results.forEach(result => {
        const emoji = result.severity === 'error' ? '❌' : result.severity === 'warning' ? '⚠️' : 'ℹ️';
        markdown += `### ${emoji} ${result.title}\n\n`;
        markdown += `**Type**: ${result.type}\n`;
        markdown += `**Severity**: ${result.severity}\n`;
        markdown += `**Description**: ${result.description}\n`;
        
        if (result.location) {
          markdown += `**Location**: `;
          if (result.location.line) markdown += `Line ${result.location.line}`;
          if (result.location.job) markdown += `, Job: ${result.location.job}`;
          if (result.location.step !== undefined) markdown += `, Step: ${result.location.step + 1}`;
          markdown += `\n`;
        }
        
        if (result.suggestion) {
          markdown += `**Suggestion**: ${result.suggestion}\n`;
        }
        
        if (result.links && result.links.length > 0) {
          markdown += `**References**:\n`;
          result.links.forEach(link => {
            markdown += `- [${link}](${link})\n`;
          });
        }
        
        markdown += `\n`;
      });
    } else {
      markdown += `✅ No issues found!\n\n`;
    }
  });

  markdown += `\n---\n\n`;
  markdown += `*This report was generated by [Flowlyt](https://github.com/harekrishnarai/flowlyt) - GitHub Actions Workflow Analyzer*\n`;

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
      const addHeader = () => {
        // Modern gradient header
        doc.setFillColor(...colors.gradient1);
        doc.rect(0, 0, pageWidth, 30, 'F');
        
        // Add subtle gradient effect with overlays
        doc.setFillColor(...colors.gradient2);
        doc.setGState(new doc.GState({ opacity: 0.7 }));
        doc.rect(0, 0, pageWidth / 2, 30, 'F');
        doc.setGState(new doc.GState({ opacity: 1.0 }));
        
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
        
        // Reset colors
        doc.setTextColor(...colors.text);
        doc.setFont('helvetica', 'normal');
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.1);
      };

      const addFooter = (pageNum: number, totalPages: number) => {
        doc.setFontSize(8);
        doc.setTextColor(...colors.secondary);
        doc.text('Generated by Flowlyt - Enterprise Workflow Analysis Tool', 20, pageHeight - 15);
        doc.text(`Page ${pageNum} of ${totalPages}`, pageWidth - 40, pageHeight - 15);
        doc.text(new Date().toLocaleString(), pageWidth - 80, pageHeight - 8);
      };

      const checkNewPage = (requiredSpace: number = 50) => {
        if (yPosition + requiredSpace > pageHeight - 30) {
          doc.addPage();
          addHeader();
          yPosition = 40;
          return true;
        }
        return false;
      };

      const addSectionHeader = (title: string, color: [number, number, number] = colors.primary) => {
        checkNewPage(25);
        doc.setFillColor(...color);
        doc.rect(15, yPosition - 5, pageWidth - 30, 15, 'F');
        doc.setTextColor(...colors.white);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(title, 20, yPosition + 5);
        doc.setTextColor(...colors.text);
        doc.setFont('helvetica', 'normal');
        yPosition += 20;
      };

      const addMetricBox = (label: string, value: string, color: [number, number, number], x: number, width: number = 40) => {
        // Box background
        doc.setFillColor(...colors.lightGrey);
        doc.rect(x, yPosition, width, 25, 'F');
        
        // Box border
        doc.setDrawColor(...color);
        doc.setLineWidth(2);
        doc.rect(x, yPosition, width, 25, 'S');
        
        // Value
        doc.setTextColor(...color);
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        const valueWidth = doc.getTextWidth(value);
        doc.text(value, x + (width - valueWidth) / 2, yPosition + 12);
        
        // Label
        doc.setTextColor(...colors.text);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        const labelWidth = doc.getTextWidth(label);
        doc.text(label, x + (width - labelWidth) / 2, yPosition + 20);
        
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

      // Page 1: Executive Summary
      addHeader();
      yPosition = 40;

      // Executive Summary Section
      addSectionHeader('Executive Summary', colors.primary);
      
      doc.setFontSize(11);
      const summaryText = `This comprehensive analysis report provides detailed insights into ${totalFiles} GitHub Actions workflow file${totalFiles !== 1 ? 's' : ''} examined for security vulnerabilities, performance optimization opportunities, best practice adherence, dependency management, and structural integrity.`;
      const splitSummary = doc.splitTextToSize(summaryText, pageWidth - 40);
      doc.text(splitSummary, 20, yPosition);
      yPosition += splitSummary.length * 5 + 15;

      // Key Metrics Dashboard
      addSectionHeader('Key Metrics Dashboard', colors.info);
      
      // First row of metrics
      addMetricBox('Files Analyzed', totalFiles.toString(), colors.primary, 20, 35);
      addMetricBox('Total Issues', totalIssues.toString(), colors.warning, 65, 35);
      addMetricBox('Average Score', `${averageScore.toFixed(1)}/100`, 
        averageScore >= 80 ? colors.success : averageScore >= 60 ? colors.warning : colors.error, 110, 40);
      addMetricBox('Critical Errors', totalErrors.toString(), colors.error, 160, 35);
      
      yPosition += 35;
      
      // Second row of metrics
      addMetricBox('Warnings', totalWarnings.toString(), colors.warning, 20, 35);
      addMetricBox('Info Items', totalInfo.toString(), colors.info, 65, 35);
      
      const securityIssues = reports.reduce((sum, report) => 
        sum + report.results.filter(r => r.type === 'security').length, 0);
      const performanceIssues = reports.reduce((sum, report) => 
        sum + report.results.filter(r => r.type === 'performance').length, 0);
      
      addMetricBox('Security Issues', securityIssues.toString(), colors.error, 110, 40);
      addMetricBox('Performance', performanceIssues.toString(), colors.warning, 160, 35);
      
      yPosition += 50;

      // Risk Assessment
      addSectionHeader('Risk Assessment', colors.error);
      
      const riskLevel = totalErrors > 0 ? 'HIGH' : totalWarnings > 5 ? 'MEDIUM' : 'LOW';
      const riskColor = riskLevel === 'HIGH' ? colors.error : riskLevel === 'MEDIUM' ? colors.warning : colors.success;
      
      doc.setFontSize(12);
      doc.text('Overall Risk Level:', 20, yPosition);
      doc.setTextColor(...riskColor);
      doc.setFont('helvetica', 'bold');
      doc.text(riskLevel, 80, yPosition);
      doc.setTextColor(...colors.text);
      doc.setFont('helvetica', 'normal');
      yPosition += 15;

      const recommendations = [
        totalErrors > 0 ? '• Immediate attention required for critical security and structural issues' : null,
        totalWarnings > 5 ? '• Review and address performance and best practice warnings' : null,
        securityIssues > 0 ? '• Implement security hardening measures for workflow actions' : null,
        averageScore < 80 ? '• Comprehensive workflow optimization recommended' : null,
        '• Regular monitoring and analysis of workflow changes recommended'
      ].filter(Boolean);

      doc.setFontSize(10);
      recommendations.forEach(rec => {
        if (rec) {
          const splitRec = doc.splitTextToSize(rec, pageWidth - 40);
          doc.text(splitRec, 20, yPosition);
          yPosition += splitRec.length * 5 + 3;
        }
      });

      // Analysis Methodology
      yPosition += 10;
      addSectionHeader('Analysis Methodology', colors.secondary);
      
      const methodology = [
        '• Security Analysis: Scans for hardcoded secrets, permission misconfigurations, and unsafe action usage',
        '• Performance Review: Identifies caching opportunities, redundant operations, and optimization potential',
        '• Best Practices: Ensures proper naming conventions, documentation, and error handling',
        '• Dependency Management: Checks for outdated actions and suggests version pinning strategies',
        '• Structural Integrity: Validates job dependencies and workflow complexity'
      ];

      doc.setFontSize(10);
      methodology.forEach(item => {
        const splitItem = doc.splitTextToSize(item, pageWidth - 40);
        doc.text(splitItem, 20, yPosition);
        yPosition += splitItem.length * 5 + 3;
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

        // File header
        addSectionHeader(`File Analysis: ${report.fileName}`, colors.primary);
        
        // File score card
        const scoreColor = report.summary.score >= 80 ? colors.success : 
                          report.summary.score >= 60 ? colors.warning : colors.error;
        
        addMetricBox('Score', `${report.summary.score}/100`, scoreColor, 20, 40);
        addMetricBox('Errors', report.summary.errorCount.toString(), colors.error, 70, 30);
        addMetricBox('Warnings', report.summary.warningCount.toString(), colors.warning, 110, 30);
        addMetricBox('Info', report.summary.infoCount.toString(), colors.info, 150, 30);
        
        yPosition += 40;

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
              doc.setTextColor(...colors.text);
              doc.setFont('helvetica', 'normal');
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
          doc.setTextColor(...colors.text);
          doc.setFont('helvetica', 'normal');
          yPosition += 25;
          
          doc.setFontSize(11);
          doc.text('This workflow follows all security, performance, and best practice guidelines.', 25, yPosition);
        }

        addFooter(currentPage, Math.ceil(reports.length) + 2);
      });

      // Final page: Summary and next steps
      doc.addPage();
      addHeader();
      currentPage++;
      yPosition = 40;

      addSectionHeader('Action Plan & Next Steps', colors.primary);
      
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

      actionItems.forEach((item) => {
        checkNewPage(25);
        
        const priorityColor = item.priority === 'HIGH' ? colors.error :
                             item.priority === 'MEDIUM' ? colors.warning : colors.info;
        
        // Priority badge
        doc.setFillColor(...priorityColor);
        doc.rect(20, yPosition, 25, 8, 'F');
        doc.setTextColor(...colors.white);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text(item.priority, 22, yPosition + 5);
        
        // Action item details
        doc.setTextColor(...colors.text);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text(item.title, 50, yPosition + 5);
        doc.setFont('helvetica', 'normal');
        yPosition += 10;
        
        doc.setFontSize(10);
        doc.text(item.description, 20, yPosition);
        yPosition += 5;
        
        doc.setFontSize(9);
        doc.setTextColor(...colors.secondary);
        doc.text(`Recommended timeframe: ${item.timeframe}`, 20, yPosition);
        doc.setTextColor(...colors.text);
        yPosition += 15;
      });

      // Tool information
      yPosition += 10;
      addSectionHeader('About Flowlyt', colors.info);
      
      doc.setFontSize(10);
      const aboutText = [
        'Flowlyt is an enterprise-grade GitHub Actions workflow analysis tool designed to help',
        'organizations maintain secure, performant, and well-structured CI/CD pipelines.',
        '',
        'Key Features:',
        '• Comprehensive security vulnerability scanning',
        '• Performance optimization recommendations',
        '• Best practice compliance checking',
        '• Dependency management analysis',
        '• Structural integrity validation',
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

      // Generate and return the PDF blob
      const pdfBlob = new Blob([doc.output('blob')], { type: 'application/pdf' });
      resolve(pdfBlob);
    });
  });
}