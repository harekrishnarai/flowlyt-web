import { useState, useMemo } from 'react';
import {
  Shield,
  Zap,
  CheckCircle,
  Package,
  GitBranch,
  AlertTriangle,
  BarChart3,
  Network,
  Copy,
  GitCommit,
  ArrowRight,
  Eye,
  Search,
  X,
  AlertCircle,
  Info,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  ExternalLink,
  Download,
  Filter,
  FileText,
  RefreshCw,
  FileCode,
  Layers // Added icon for "All Files"
} from 'lucide-react';
import { AnalysisReport, WorkflowFile } from '../types/workflow';
import { generateMarkdownReport, generatePDFReport } from '../utils/workflowAnalyzer';
import AnalysisCharts from './charts/AnalysisCharts';
import CallGraphVisualization from './charts/CallGraphVisualization';
import { ReachabilityAnalysis } from './charts/ReachabilityAnalysis';
import NetworkEndpointsView from './charts/NetworkEndpointsView';
import CLISection from './CLISection';
import ResultSummaryDashboard from './ResultSummaryDashboard';
import EmptyState from './EmptyState';
import Tooltip from './Tooltip';

interface AnalysisResultsProps {
  reports: AnalysisReport[];
  workflowFiles?: WorkflowFile[];
  onExport: () => void;
  onNewAnalysis: () => void;
}

const severityConfig = {
  error: { icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
  warning: { icon: AlertTriangle, color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-200' },
  info: { icon: Info, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' }
};

const typeConfig = {
  security: { icon: Shield, color: 'text-red-600', label: 'Security' },
  performance: { icon: Zap, color: 'text-yellow-600', label: 'Performance' },
  'best-practice': { icon: CheckCircle, color: 'text-green-600', label: 'Best Practice' },
  dependency: { icon: Package, color: 'text-purple-600', label: 'Dependency' },
  structure: { icon: GitBranch, color: 'text-blue-600', label: 'Structure' }
};

const isSHASuggestion = (suggestion: string): boolean => {
  return suggestion.includes('@') && 
         (suggestion.includes('Pin to SHA:') || 
          suggestion.includes('Pin to specific') || 
          suggestion.includes('Update to latest:') ||
          suggestion.includes('SHA:'));
};

const extractSHAFromSuggestion = (suggestion: string): { actionName: string; sha: string; version?: string } | null => {
  const shaMatch = suggestion.match(/(\w+\/[\w-]+)@([a-f0-9]{40})(?:\s*#\s*([\w\.-]+))?/i);
  if (shaMatch) {
    return {
      actionName: shaMatch[1],
      sha: shaMatch[2],
      version: shaMatch[3]
    };
  }
  return null;
};

const SHASuggestionBox = ({ suggestion }: { suggestion: string }) => {
  const [copied, setCopied] = useState(false);
  const shaInfo = extractSHAFromSuggestion(suggestion);
  
  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  if (!shaInfo) {
    return (
      <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 transition-colors duration-300 break-words">
        {suggestion}
      </p>
    );
  }

  const fullActionReference = `${shaInfo.actionName}@${shaInfo.sha}`;
  
  return (
    <div className="space-y-3">
      <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 transition-colors duration-300">
        {suggestion.split(fullActionReference)[0]}
      </p>
      
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border border-blue-200 dark:border-blue-800/50 rounded-lg p-3 sm:p-4 transition-all duration-300">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5">
            <GitCommit className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-blue-900 dark:text-blue-100">
                Recommended Action:
              </span>
              {shaInfo.version && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200">
                  {shaInfo.version}
                </span>
              )}
            </div>
            
            <div className="relative group">
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md px-3 py-2 font-mono text-xs sm:text-sm text-gray-900 dark:text-gray-100 transition-colors duration-300">
                <div className="flex items-center justify-between gap-2">
                  <span className="break-all">{fullActionReference}</span>
                  <button
                    onClick={() => handleCopy(fullActionReference)}
                    className="flex-shrink-0 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors opacity-0 group-hover:opacity-100"
                    title="Copy to clipboard"
                  >
                    {copied ? (
                      <CheckCircle className="w-3 h-3 text-green-600" />
                    ) : (
                      <Copy className="w-3 h-3 text-gray-500" />
                    )}
                  </button>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
              <ArrowRight className="w-3 h-3" />
              <span>Copy and replace in your workflow file</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function AnalysisResults({ reports, workflowFiles, onNewAnalysis }: AnalysisResultsProps) {
  // Default to 'all' if multiple reports exist, otherwise the single file ID
  const [selectedFile, setSelectedFile] = useState<string>(reports.length > 1 ? 'all' : reports[0]?.fileId || '');
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [selectedSeverities, setSelectedSeverities] = useState<Set<string>>(new Set());
  const [expandedIssues, setExpandedIssues] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'list' | 'charts' | 'network' | 'callgraph' | 'reachability'>('list');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage] = useState<number>(5);
  const [showExportMenu, setShowExportMenu] = useState<boolean>(false);

  // Helper function to calculate score based on all issues (same method as ResultSummaryDashboard)
  const calculateAggregateScore = (reportsToScore: AnalysisReport[]): number => {
    if (reportsToScore.length === 0) return 0;
    
    let critical = 0;
    let high = 0;
    
    reportsToScore.forEach(report => {
      critical += report.summary.errorCount;
      high += report.summary.warningCount;
    });

    const maxPossibleIssues = reportsToScore.length * 50;
    const totalIssues = reportsToScore.reduce((sum, report) => sum + report.summary.totalIssues, 0);
    return totalIssues === 0 ? 100 : Math.max(0, Math.round((1 - (critical * 10 + high * 5) / maxPossibleIssues) * 100));
  };

  // Get the list of reports to display based on selection
  const activeReports = useMemo(() => {
    return selectedFile === 'all' 
      ? reports 
      : reports.filter(r => r.fileId === selectedFile);
  }, [reports, selectedFile]);

  // Calculate aggregate summary for the sidebar
  const summary = useMemo(() => {
    if (activeReports.length === 0) return { score: 0, errorCount: 0, warningCount: 0, infoCount: 0 };
    if (activeReports.length === 1) return activeReports[0].summary;

    // For multiple files, calculate score based on all issues combined (consistent with ResultSummaryDashboard)
    let totalErrorCount = 0;
    let totalWarningCount = 0;
    let totalInfoCount = 0;

    activeReports.forEach(report => {
      totalErrorCount += report.summary.errorCount;
      totalWarningCount += report.summary.warningCount;
      totalInfoCount += report.summary.infoCount;
    });

    return {
      score: calculateAggregateScore(activeReports),
      errorCount: totalErrorCount,
      warningCount: totalWarningCount,
      infoCount: totalInfoCount
    };
  }, [activeReports]);

  // Combine results from all active reports
  const filteredResults = useMemo(() => {
    // Flatten all results from active reports
    const allResults = activeReports.flatMap(report => report.results);
    
    return allResults.filter(result => {
      const typeMatch = selectedTypes.size === 0 || selectedTypes.has(result.type);
      const severityMatch = selectedSeverities.size === 0 || selectedSeverities.has(result.severity);
      
      const searchMatch = searchQuery === '' || 
        result.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        result.suggestion?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        result.description?.toLowerCase().includes(searchQuery.toLowerCase());
      
      return typeMatch && severityMatch && searchMatch;
    });
  }, [activeReports, selectedTypes, selectedSeverities, searchQuery]);

  // Pagination logic
  const totalPages = Math.ceil(filteredResults.length / itemsPerPage);
  const paginatedResults = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredResults.slice(startIndex, endIndex);
  }, [filteredResults, currentPage, itemsPerPage]);

  // Reset to page 1 when filters change
  const resetPagination = () => setCurrentPage(1);

  const toggleExpanded = (issueId: string) => {
    const newExpanded = new Set(expandedIssues);
    if (newExpanded.has(issueId)) {
      newExpanded.delete(issueId);
    } else {
      newExpanded.add(issueId);
    }
    setExpandedIssues(newExpanded);
  };

  const toggleFilter = (filterSet: Set<string>, setFilter: (set: Set<string>) => void, value: string) => {
    const newSet = new Set(filterSet);
    if (newSet.has(value)) {
      newSet.delete(value);
    } else {
      newSet.add(value);
    }
    setFilter(newSet);
    resetPagination();
  };

  const handleExportMarkdown = () => {
    const markdownReport = generateMarkdownReport(reports);
    const blob = new Blob([markdownReport], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'workflow-analysis-report.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = async () => {
    try {
      const githubFile = reports.find(report => {
        const workflowFile = workflowFiles?.find((wf: WorkflowFile) => wf.id === report.fileId);
        return workflowFile?.source === 'github';
      });
      
      let githubInfo: { repoUrl?: string, owner?: string, repo?: string } | undefined;
      
      if (githubFile) {
        const workflowFile = workflowFiles?.find((wf: WorkflowFile) => wf.id === githubFile.fileId);
        if (workflowFile?.repoUrl) {
          const urlParts = workflowFile.repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
          if (urlParts) {
            githubInfo = {
              repoUrl: workflowFile.repoUrl,
              owner: urlParts[1],
              repo: urlParts[2]
            };
          }
        }
      }
      
      const { blob: pdfBlob, filename } = await generatePDFReport(reports, githubInfo);
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to generate PDF:', error);
    }
  };

  const getScoreColor = (score: number) => {
    if (score === 100) return 'text-green-600 dark:text-green-400';
    if (score >= 80) return 'text-green-600 dark:text-green-400';
    if (score >= 60) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  if (reports.length === 0) {
    return (
      <div className="text-center py-12">
        <GitBranch className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4 transition-colors duration-300" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2 transition-colors duration-300">No workflows analyzed yet</h3>
        <p className="text-gray-600 dark:text-gray-400 transition-colors duration-300">Upload workflow files to see analysis results</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Compact Header with Actions */}
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 transition-colors duration-300">
          Analysis Results
        </h2>
        
        <div className="flex items-center gap-2">
          <button
            onClick={onNewAnalysis}
            className="inline-flex items-center justify-center px-3 py-2 bg-gray-600 dark:bg-gray-700 text-white text-sm font-medium rounded-lg hover:bg-gray-700 dark:hover:bg-gray-600 transition-colors"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">New Analysis</span>
            <span className="sm:hidden">New</span>
          </button>
          
          {/* Export Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="inline-flex items-center justify-center px-3 py-2 bg-blue-600 dark:bg-blue-700 text-white text-sm font-medium rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors"
            >
              <Download className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Export</span>
              <ChevronDown className="w-4 h-4 ml-1" />
            </button>
            
            {showExportMenu && (
              <>
                <div 
                  className="fixed inset-0 z-10" 
                  onClick={() => setShowExportMenu(false)}
                />
                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-20">
                  <button
                    onClick={() => {
                      handleExportMarkdown();
                      setShowExportMenu(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center transition-colors"
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    Export Markdown
                  </button>
                  <button
                    onClick={() => {
                      handleExportPDF();
                      setShowExportMenu(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center transition-colors"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Export PDF
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Summary Dashboard - always shows full summary */}
      <ResultSummaryDashboard reports={reports} />

      {activeReports.length > 0 && (
        <div className="space-y-4">
          {/* Top control bar */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              {/* Tabs */}
              <div className="flex flex-wrap gap-1">
                {[
                  { id: 'list', icon: FileText, label: 'Issue List', tooltip: 'View detailed list of all identified issues' },
                  { id: 'charts', icon: BarChart3, label: 'Analytics', tooltip: 'View statistical analysis and charts' },
                  { id: 'network', icon: Network, label: 'Network', tooltip: 'View network endpoints and external calls' },
                  { id: 'callgraph', icon: GitCommit, label: 'Call Graph', tooltip: 'Visualize action dependencies and calls' },
                  { id: 'reachability', icon: Eye, label: 'Reachability', tooltip: 'Analyze code reachability paths' }
                ].map((tab) => (
                  <Tooltip key={tab.id} content={tab.tooltip} position="bottom">
                    <button
                      onClick={() => setActiveTab(tab.id as any)}
                      className={`h-9 px-3 inline-flex items-center rounded-md text-xs font-medium transition-colors ${
                        activeTab === tab.id
                          ? 'bg-blue-500 text-white'
                          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      <tab.icon className="w-3.5 h-3.5 mr-1.5" />
                      {tab.label}
                    </button>
                  </Tooltip>
                ))}
              </div>

              {/* Spacer for wrap */}
              <div className="flex-1" />

              {/* File + Search aligned */}
              <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto lg:items-center">
                {reports.length > 1 && (
                  <div className="relative w-full sm:w-56 flex-shrink-0">
                    {selectedFile === 'all' ? (
                       <Layers className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 z-10" />
                    ) : (
                       <FileCode className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 z-10" />
                    )}
                    <select
                      value={selectedFile}
                      onChange={(e) => {
                        setSelectedFile(e.target.value);
                        resetPagination();
                      }}
                      className="w-full h-9 pl-9 pr-2.5 text-xs border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-blue-500 appearance-none"
                    >
                      {/* Added "All Files" option */}
                      <option value="all">All Files ({reports.length})</option>
                      {reports.map((report) => (
                        <option key={report.fileId} value={report.fileId}>
                          {workflowFiles?.find(f => f.id === report.fileId)?.name || report.fileId}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                  </div>
                )}

                <div className="relative w-full sm:w-64 min-w-[220px]">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search issues..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      resetPagination();
                    }}
                    className="w-full h-9 pl-9 pr-9 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md text-xs focus:ring-1 focus:ring-blue-500 focus:border-transparent text-gray-900 dark:text-gray-100"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => {
                        setSearchQuery('');
                        resetPagination();
                      }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Content based on active tab - Passing 'activeReports' instead of just 'currentReport' */}
          {activeTab === 'charts' && (
            <AnalysisCharts reports={activeReports} />
          )}

          {activeTab === 'network' && (
            <NetworkEndpointsView reports={activeReports} />
          )}

          {activeTab === 'callgraph' && (
            <CallGraphVisualization reports={activeReports} />
          )}

          {activeTab === 'reachability' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {selectedFile === 'all' 
                  ? `Reachability Analysis - All Files (${activeReports.length})` 
                  : `Reachability Analysis - ${activeReports[0]?.fileName}`}
              </h3>
              {/* ReachabilityAnalysis component might only support one report at a time in your implementation.
                  If so, we map over them. If it supports arrays, pass the array. 
                  Assuming it takes a single report based on previous code: */}
              {activeReports.map(report => (
                 <div key={report.fileId} className="mb-8">
                    {activeReports.length > 1 && <h4 className="text-sm font-medium mb-2 text-gray-500">{report.fileName}</h4>}
                    <ReachabilityAnalysis report={report} />
                 </div>
              ))}
            </div>
          )}
          
          {activeTab === 'list' && (
            <div className="space-y-3">
              {/* Results Grid */}
              <div className="grid gap-6 lg:grid-cols-4">
                {/* Sidebar */}
                <div className="lg:col-span-1 space-y-4 sm:space-y-6 order-2 lg:order-1">
                  {/* Score Card - Uses calculated 'summary' which handles single or all files */}
                  <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 sm:p-6 transition-colors duration-300">
                    <div className="text-center">
                      <Tooltip content="Individual score for this file - how healthy and secure your workflow is (0-100)" position="bottom">
                        <div className={`text-3xl sm:text-4xl font-bold mb-2 ${getScoreColor(summary.score)} transition-colors duration-300`}>
                          {summary.score}
                        </div>
                      </Tooltip>
                      <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-3 sm:mb-4 transition-colors duration-300">
                        {selectedFile === 'all' ? 'Average Score' : 'Overall Score'}
                      </div>
                    </div>
                  </div>

                  {/* Filters */}
                  <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 sm:p-4 transition-colors duration-300">
                    <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-3 sm:mb-4 flex items-center transition-colors duration-300 text-sm sm:text-base">
                      <Filter className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
                      Filters
                    </h3>
                      {/* Type Filters */}
                    <div className="space-y-2 sm:space-y-3 mb-3 sm:mb-4">
                      <h4 className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors duration-300">Type</h4>
                      {Object.entries(typeConfig).map(([type, config]) => {
                        const Icon = config.icon;
                        // Count across all active reports' results
                        const count = activeReports.flatMap(r => r.results).filter(r => r.type === type).length;
                        if (count === 0) return null;
                        
                        const typeDescriptions: Record<string, string> = {
                          security: 'Security vulnerabilities and best practices',
                          performance: 'Performance optimization recommendations',
                          'best-practice': 'Code quality and industry best practices',
                          dependency: 'Issues with action dependencies',
                          structure: 'Workflow structure and organization'
                        };
                        
                        return (
                          <div key={type} className="w-full">
                            <Tooltip content={typeDescriptions[type]} position="right">
                              <label className="flex items-center gap-2 w-full">
                                <input
                                  type="checkbox"
                                  checked={selectedTypes.has(type)}
                                  onChange={() => toggleFilter(selectedTypes, setSelectedTypes, type)}
                                  className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 bg-white dark:bg-gray-700 transition-colors duration-300 flex-shrink-0"
                                />
                                <Icon className={`w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0 ${config.color.replace('text-', 'text-').replace('-600', '-600 dark:text-').replace('-600', '-400')}`} />
                                <span className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 flex-1 min-w-0 truncate transition-colors duration-300">{config.label}</span>
                                <span className="text-xs text-gray-500 dark:text-gray-400 transition-colors duration-300 flex-shrink-0">{count}</span>
                              </label>
                            </Tooltip>
                          </div>
                        );
                      })}
                    </div>

                    {/* Severity Filters */}
                    <div className="space-y-2 sm:space-y-3">
                      <h4 className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors duration-300">Severity</h4>
                      {Object.entries(severityConfig).map(([severity, config]) => {
                        const Icon = config.icon;
                        // Count across all active reports' results
                        const count = activeReports.flatMap(r => r.results).filter(r => r.severity === severity).length;
                        if (count === 0) return null;
                        
                        const severityDescriptions: Record<string, string> = {
                          error: 'High-priority issues requiring immediate action',
                          warning: 'Medium-priority issues that should be addressed',
                          info: 'Informational messages and suggestions'
                        };
                        
                        return (
                          <div key={severity} className="w-full">
                            <Tooltip content={severityDescriptions[severity]} position="right">
                              <label className="flex items-center gap-2 w-full">
                                <input
                                  type="checkbox"
                                  checked={selectedSeverities.has(severity)}
                                  onChange={() => toggleFilter(selectedSeverities, setSelectedSeverities, severity)}
                                  className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 bg-white dark:bg-gray-700 transition-colors duration-300 flex-shrink-0"
                                />
                                <Icon className={`w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0 ${config.color.replace('text-', 'text-').replace('-600', '-600 dark:text-').replace('-600', '-400')}`} />
                                <span className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 flex-1 min-w-0 truncate capitalize transition-colors duration-300">{severity}</span>
                                <span className="text-xs text-gray-500 dark:text-gray-400 transition-colors duration-300 flex-shrink-0">{count}</span>
                              </label>
                            </Tooltip>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Results Column */}
                <div className="lg:col-span-3 order-1 lg:order-2">
                  {filteredResults.length === 0 ? (
                    activeReports.every(r => r.results.length === 0) ? (
                      <EmptyState 
                        fileName={selectedFile === 'all' ? 'All Files' : (workflowFiles?.find(f => f.id === selectedFile)?.name || 'workflow')} 
                        onNewAnalysis={onNewAnalysis}
                        onExport={handleExportMarkdown}
                      />
                    ) : (
                      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 sm:p-8 text-center transition-colors duration-300">
                        <p className="text-gray-600 dark:text-gray-400">No issues match your current filters.</p>
                        <button
                          onClick={() => {
                            setSelectedTypes(new Set());
                            setSelectedSeverities(new Set());
                            setSearchQuery('');
                            resetPagination();
                          }}
                          className="mt-4 text-blue-600 dark:text-blue-400 hover:underline text-sm"
                        >
                          Clear all filters
                        </button>
                      </div>
                    )
                  ) : (
                    <div className="space-y-3 sm:space-y-4">
                      {paginatedResults.map((result, index) => {
                        // Create a unique key because multiple files might have issues with same ID if you are using basic indexing
                        const uniqueKey = `${result.id}-${index}`;
                        const severityInfo = severityConfig[result.severity];
                        const typeInfo = typeConfig[result.type];
                        const SeverityIcon = severityInfo.icon;
                        const TypeIcon = typeInfo.icon;
                        const isExpanded = expandedIssues.has(result.id); // Note: IDs might clash if not unique across files. Ideally result.id is globally unique.
                        
                        // Find which file this result belongs to (optional, for display)
                        const sourceReport = reports.find(r => r.results.includes(result));

                        return (
                          <div
                            key={uniqueKey}
                            className={`bg-white dark:bg-gray-800 border rounded-lg shadow-sm hover:shadow-md transition-all duration-300 ${severityInfo.border.replace('border-', 'border-').replace('-200', '-200 dark:border-').replace('-200', '-600')} overflow-hidden`}
                          >
                            <div
                              className="p-3 sm:p-4 cursor-pointer"
                              onClick={() => toggleExpanded(result.id)}
                            >
                              <div className="flex items-start gap-3">
                                <Tooltip content={`${result.severity.charAt(0).toUpperCase() + result.severity.slice(1)} severity`} position="right">
                                  <div className={`p-1.5 sm:p-2 rounded-lg flex-shrink-0 cursor-help ${severityInfo.bg.replace('bg-', 'bg-').replace('-50', '-50 dark:bg-opacity-20')}`}>
                                    <SeverityIcon className={`w-4 h-4 sm:w-5 sm:h-5 ${severityInfo.color.replace('text-', 'text-').replace('-600', '-600 dark:text-').replace('-600', '-400')}`} />
                                  </div>
                                </Tooltip>
                                
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mb-2">
                                    <h3 className="font-medium text-gray-900 dark:text-gray-100 transition-colors duration-300 text-sm sm:text-base break-words">{result.title}</h3>
                                    <Tooltip content={typeConfig[result.type].label} position="top">
                                      <div className="flex items-center gap-1 flex-shrink-0 cursor-help">
                                        <TypeIcon className={`w-3 h-3 sm:w-4 sm:h-4 ${typeInfo.color.replace('text-', 'text-').replace('-600', '-600 dark:text-').replace('-600', '-400')}`} />
                                        <span className="text-xs text-gray-500 dark:text-gray-400 transition-colors duration-300">{typeInfo.label}</span>
                                      </div>
                                    </Tooltip>
                                    {/* Show filename if 'All Files' is selected */}
                                    {selectedFile === 'all' && sourceReport && (
                                      <Tooltip content={`Part of ${sourceReport.fileName}`} position="top">
                                        <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 cursor-help">
                                          {sourceReport.fileName}
                                        </span>
                                      </Tooltip>
                                    )}
                                  </div>
                                  
                                  <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-2 transition-colors duration-300 break-words">{result.description}</p>
                                  
                                  {result.location && (
                                    <div className="text-xs text-gray-500 dark:text-gray-400 transition-colors duration-300 break-all">
                                      {result.location.line && (
                                        result.githubUrl ? (
                                          <a 
                                            href={result.githubUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline transition-colors duration-300"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <ExternalLink className="w-3 h-3 mr-1 flex-shrink-0" />
                                            <span className="truncate">Line: {result.location.line}</span>
                                          </a>
                                        ) : (
                                          `Line: ${result.location.line}`
                                        )
                                      )}
                                      {result.location.job && <span className="block sm:inline sm:ml-2">Job: {result.location.job}</span>}
                                      {result.location.step && <span className="block sm:inline sm:ml-2">Step: {result.location.step}</span>}
                                      
                                      {/* Mobile filename badge */}
                                      {selectedFile === 'all' && sourceReport && (
                                        <div className="mt-1 sm:hidden">
                                           <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                                            in {sourceReport.fileName}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                                
                                <div className="flex-shrink-0">
                                  {isExpanded ? (
                                    <ChevronDown className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 dark:text-gray-500 transition-colors duration-300" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 dark:text-gray-500 transition-colors duration-300" />
                                  )}
                                </div>
                              </div>
                            </div>

                            {isExpanded && (
                              <div className="border-t border-gray-100 dark:border-gray-700 p-3 sm:p-4 space-y-3 sm:space-y-4 transition-colors duration-300">
                                {result.suggestion && (
                                  <div>
                                    <h4 className="text-xs sm:text-sm font-medium text-gray-900 dark:text-gray-100 mb-2 transition-colors duration-300">
                                      {isSHASuggestion(result.suggestion) ? 'SHA Pinning Recommendation' : 'Suggestion'}
                                    </h4>
                                    <SHASuggestionBox suggestion={result.suggestion} />
                                  </div>
                                )}

                                {result.codeSnippet && (
                                  <div>
                                    <h4 className="text-xs sm:text-sm font-medium text-gray-900 dark:text-gray-100 mb-2 transition-colors duration-300">Code Context</h4>
                                    <div className="relative bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden transition-colors duration-300">
                                      <div className="absolute top-2 right-2 text-xs text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 px-1.5 sm:px-2 py-1 rounded border dark:border-gray-600 transition-colors duration-300 z-10">
                                        Lines {result.codeSnippet.startLine}-{result.codeSnippet.endLine}
                                      </div>
                                      <div className="overflow-x-auto">
                                        <pre className="p-3 sm:p-4 text-xs sm:text-sm">
                                          <code className="language-yaml text-gray-800 dark:text-gray-200 transition-colors duration-300">
                                            {result.codeSnippet.content.split('\n').map((line, index) => {
                                              const lineNumber = result.codeSnippet!.startLine + index;
                                              const isHighlighted = result.codeSnippet!.highlightLine && 
                                                lineNumber === result.codeSnippet!.startLine + result.codeSnippet!.highlightLine - 1;
                                              
                                              return (
                                                <div 
                                                  key={index} 
                                                  className={`flex ${isHighlighted ? 'bg-yellow-100 dark:bg-yellow-900/30 -mx-3 sm:-mx-4 px-3 sm:px-4' : ''} transition-colors duration-300`}
                                                >
                                                  <span className="text-gray-400 dark:text-gray-500 mr-2 sm:mr-4 select-none w-6 sm:w-8 text-right flex-shrink-0 transition-colors duration-300 font-mono">
                                                    {lineNumber}
                                                  </span>
                                                  <span className="flex-1 break-all sm:break-normal font-mono whitespace-pre-wrap">{line}</span>
                                                </div>
                                              );
                                            })}
                                          </code>
                                        </pre>
                                      </div>
                                    </div>
                                  </div>
                                )}
                                
                                {result.links && result.links.length > 0 && (
                                  <div>
                                    <h4 className="text-xs sm:text-sm font-medium text-gray-900 dark:text-gray-100 mb-2 transition-colors duration-300">References</h4>
                                    <div className="space-y-1">
                                      {result.links.map((link, index) => (
                                        <a
                                          key={index}
                                          href={link}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-start text-xs sm:text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors duration-300 break-all"
                                        >
                                          <ExternalLink className="w-3 h-3 mr-1 flex-shrink-0 mt-0.5" />
                                          <span className="break-all">{link}</span>
                                        </a>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      
                      {/* Pagination Controls at Bottom */}
                      {filteredResults.length > itemsPerPage && (
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 mt-4 border-t border-gray-200 dark:border-gray-700">
                          <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                            Showing {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, filteredResults.length)} of {filteredResults.length} issues
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                              disabled={currentPage === 1}
                              className="inline-flex items-center px-3 py-2 text-xs sm:text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              title="Previous page"
                            >
                              <ChevronLeft className="w-4 h-4 mr-1" />
                              <span className="hidden sm:inline">Previous</span>
                            </button>
                            
                            <div className="flex items-center gap-1">
                              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                                let pageNum;
                                if (totalPages <= 5) {
                                  pageNum = i + 1;
                                } else if (currentPage <= 3) {
                                  pageNum = i + 1;
                                } else if (currentPage >= totalPages - 2) {
                                  pageNum = totalPages - 4 + i;
                                } else {
                                  pageNum = currentPage - 2 + i;
                                }
                                
                                return (
                                  <button
                                    key={pageNum}
                                    onClick={() => setCurrentPage(pageNum)}
                                    className={`w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center text-xs sm:text-sm font-medium rounded-lg transition-colors ${
                                      currentPage === pageNum
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                                    }`}
                                  >
                                    {pageNum}
                                  </button>
                                );
                              })}
                            </div>
                            
                            <button
                              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                              disabled={currentPage === totalPages}
                              className="inline-flex items-center px-3 py-2 text-xs sm:text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              title="Next page"
                            >
                              <span className="hidden sm:inline">Next</span>
                              <ChevronRight className="w-4 h-4 ml-1" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* CLI Section - shown after results */}
      <CLISection />
    </div>
  );
}