import { useState, useMemo } from 'react';
import { 
  Shield, 
  Zap, 
  CheckCircle, 
  Package, 
  GitBranch, 
  AlertTriangle, 
  AlertCircle, 
  Info,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Download,
  Filter,
  FileText,
  RefreshCw,
  BarChart3,
  Network,
  Copy,
  GitCommit,
  ArrowRight,
  Eye
} from 'lucide-react';
import { AnalysisReport, WorkflowFile } from '../types/workflow';
import { generateMarkdownReport, generatePDFReport } from '../utils/workflowAnalyzer';
import AnalysisCharts from './charts/AnalysisCharts';
import CallGraphVisualization from './charts/CallGraphVisualization';
import { ReachabilityAnalysis } from './charts/ReachabilityAnalysis';
import NetworkEndpointsView from './charts/NetworkEndpointsView';
import CLISection from './CLISection';

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

// Helper function to detect SHA-related suggestions
const isSHASuggestion = (suggestion: string): boolean => {
  return suggestion.includes('@') && 
         (suggestion.includes('Pin to SHA:') || 
          suggestion.includes('Pin to specific') || 
          suggestion.includes('Update to latest:') ||
          suggestion.includes('SHA:'));
};

// Helper function to extract action and SHA from suggestion
const extractSHAFromSuggestion = (suggestion: string): { actionName: string; sha: string; version?: string } | null => {
  // Match patterns like "Pin to SHA: actions/checkout@692973e3d937129bcbf40652eb9f2f61becf3332 # v4.1.7"
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

// SHA Suggestion Component
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
      
      {/* Beautiful SHA display box */}
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
  const [selectedFile, setSelectedFile] = useState<string>(reports[0]?.fileId || '');
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [selectedSeverities, setSelectedSeverities] = useState<Set<string>>(new Set());
  const [expandedIssues, setExpandedIssues] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'list' | 'charts' | 'network' | 'callgraph' | 'reachability'>('list');

  const currentReport = reports.find(r => r.fileId === selectedFile);

  const filteredResults = useMemo(() => {
    if (!currentReport) return [];
    
    return currentReport.results.filter(result => {
      const typeMatch = selectedTypes.size === 0 || selectedTypes.has(result.type);
      const severityMatch = selectedSeverities.size === 0 || selectedSeverities.has(result.severity);
      return typeMatch && severityMatch;
    });
  }, [currentReport, selectedTypes, selectedSeverities]);

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
      // Extract GitHub information from the first GitHub-sourced file
      const githubFile = reports.find(report => {
        const workflowFile = workflowFiles?.find((wf: WorkflowFile) => wf.id === report.fileId);
        return workflowFile?.source === 'github';
      });
      
      let githubInfo: { repoUrl?: string, owner?: string, repo?: string } | undefined;
      
      if (githubFile) {
        const workflowFile = workflowFiles?.find((wf: WorkflowFile) => wf.id === githubFile.fileId);
        if (workflowFile?.repoUrl) {
          // Extract owner and repo from repoUrl: https://github.com/owner/repo
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

  if (reports.length === 0) {
    return (
      <div className="text-center py-12">
        <GitBranch className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4 transition-colors duration-300" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2 transition-colors duration-300">No workflows analyzed yet</h3>
        <p className="text-gray-600 dark:text-gray-400 transition-colors duration-300">Upload workflow files to see analysis results</p>
      </div>
    );
  }

  const getScoreColor = (score: number) => {
    if (score === 100) return 'text-green-600 dark:text-green-400';
    if (score >= 80) return 'text-green-600 dark:text-green-400';
    if (score >= 60) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  return (
    <div className="space-y-6">      {/* Header */}
      <div className="flex flex-col space-y-4 lg:flex-row lg:items-center lg:justify-between lg:space-y-0">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 transition-colors duration-300 truncate">Analysis Results</h2>
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mt-1 transition-colors duration-300">
            {reports.length} file{reports.length !== 1 ? 's' : ''} analyzed
          </p>
        </div>
        
        <div className="flex flex-col xs:flex-row gap-2 lg:flex-shrink-0">
          <button
            onClick={onNewAnalysis}
            className="inline-flex items-center justify-center px-3 sm:px-4 py-2 bg-gray-600 dark:bg-gray-700 text-white text-sm sm:text-base font-medium rounded-lg hover:bg-gray-700 dark:hover:bg-gray-600 transition-colors min-h-[44px] w-full xs:w-auto"
          >
            <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
            <span className="truncate">New Analysis</span>
          </button>
          <button
            onClick={handleExportMarkdown}
            className="inline-flex items-center justify-center px-3 sm:px-4 py-2 bg-blue-600 dark:bg-blue-700 text-white text-sm sm:text-base font-medium rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors min-h-[44px] w-full xs:w-auto"
          >
            <FileText className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
            <span className="hidden sm:inline">Export Markdown</span>
            <span className="sm:hidden">Markdown</span>
          </button>
          <button
            onClick={handleExportPDF}
            className="inline-flex items-center justify-center px-3 sm:px-4 py-2 bg-purple-600 dark:bg-purple-700 text-white text-sm sm:text-base font-medium rounded-lg hover:bg-purple-700 dark:hover:bg-purple-600 transition-colors min-h-[44px] w-full xs:w-auto"
          >
            <Download className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
            <span className="hidden sm:inline">Export PDF</span>
            <span className="sm:hidden">PDF</span>
          </button>
        </div>
      </div>      {/* File Selector */}
      {reports.length > 1 && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 transition-colors duration-300">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 transition-colors duration-300">
            Select File
          </label>
          <select
            value={selectedFile}
            onChange={(e) => setSelectedFile(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 transition-colors duration-300 text-sm sm:text-base"
          >
            {reports.map((report) => (
              <option key={report.fileId} value={report.fileId}>
                {report.fileName}
              </option>
            ))}
          </select>
        </div>
      )}

      {currentReport && (
        <div className="space-y-6">          {/* View Toggle Tabs */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-1 transition-colors duration-300 overflow-x-auto">
            <div className="flex space-x-1 min-w-max">
              <button
                onClick={() => setActiveTab('list')}
                className={`flex-1 flex items-center justify-center px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                  activeTab === 'list'
                    ? 'bg-blue-500 text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                <FileText className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                <span className="hidden xs:inline">Issue List</span>
                <span className="xs:hidden">Issues</span>
              </button>
              <button
                onClick={() => setActiveTab('charts')}
                className={`flex-1 flex items-center justify-center px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                  activeTab === 'charts'
                    ? 'bg-blue-500 text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                <BarChart3 className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                <span className="hidden xs:inline">Analytics</span>
                <span className="xs:hidden">Charts</span>
              </button>
              <button
                onClick={() => setActiveTab('network')}
                className={`flex-1 flex items-center justify-center px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                  activeTab === 'network'
                    ? 'bg-blue-500 text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                <Network className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                <span className="hidden xs:inline">Network Endpoints</span>
                <span className="xs:hidden">Network</span>
              </button>
              <button
                onClick={() => setActiveTab('callgraph')}
                className={`flex-1 flex items-center justify-center px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                  activeTab === 'callgraph'
                    ? 'bg-blue-500 text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                <GitCommit className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                <span className="hidden xs:inline">Call Graph</span>
                <span className="xs:hidden">Graph</span>
              </button>
              <button
                onClick={() => setActiveTab('reachability')}
                className={`flex-1 flex items-center justify-center px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                  activeTab === 'reachability'
                    ? 'bg-blue-500 text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                <Eye className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                <span className="hidden xs:inline">Reachability</span>
                <span className="xs:hidden">Reach</span>
              </button>
            </div>
          </div>

          {/* Content based on active tab */}
          {activeTab === 'charts' && currentReport && (
            <AnalysisCharts reports={[currentReport]} />
          )}
          
          {activeTab === 'charts' && !currentReport && (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <p>Please select a workflow file to view charts</p>
            </div>
          )}

          {activeTab === 'network' && currentReport && (
            <NetworkEndpointsView reports={[currentReport]} />
          )}
          
          {activeTab === 'network' && !currentReport && (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <p>Please select a workflow file to view network endpoints</p>
            </div>
          )}

          {activeTab === 'callgraph' && currentReport && (
            <CallGraphVisualization reports={[currentReport]} />
          )}
          
          {activeTab === 'callgraph' && !currentReport && (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <p>Please select a workflow file to view call graph</p>
            </div>
          )}

          {activeTab === 'reachability' && currentReport && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Reachability Analysis - {currentReport.fileName}
              </h3>
              <ReachabilityAnalysis report={currentReport} />
            </div>
          )}
          
          {activeTab === 'reachability' && !currentReport && (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <p>Please select a workflow file to view reachability analysis</p>
            </div>
          )}
          
          {activeTab === 'list' && (
        <div className="grid gap-6 lg:grid-cols-4">
          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-4 sm:space-y-6 order-2 lg:order-1">
            {/* Score Card */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 sm:p-6 transition-colors duration-300">
              <div className="text-center">
                <div className={`text-3xl sm:text-4xl font-bold mb-2 ${getScoreColor(currentReport.summary.score)} transition-colors duration-300`}>
                  {currentReport.summary.score}
                </div>
                <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-3 sm:mb-4 transition-colors duration-300">Overall Score</div>
                
                <div className="space-y-2 text-xs sm:text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-red-600 dark:text-red-400 transition-colors duration-300">Errors</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100 transition-colors duration-300">{currentReport.summary.errorCount}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-yellow-600 dark:text-yellow-400 transition-colors duration-300">Warnings</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100 transition-colors duration-300">{currentReport.summary.warningCount}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-blue-600 dark:text-blue-400 transition-colors duration-300">Info</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100 transition-colors duration-300">{currentReport.summary.infoCount}</span>
                  </div>
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
                  const count = currentReport.results.filter(r => r.type === type).length;
                  if (count === 0) return null;
                  
                  return (
                    <label key={type} className="flex items-center gap-2">
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
                  );
                })}
              </div>

              {/* Severity Filters */}
              <div className="space-y-2 sm:space-y-3">
                <h4 className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors duration-300">Severity</h4>
                {Object.entries(severityConfig).map(([severity, config]) => {
                  const Icon = config.icon;
                  const count = currentReport.results.filter(r => r.severity === severity).length;
                  if (count === 0) return null;
                  
                  return (
                    <label key={severity} className="flex items-center gap-2">
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
                  );
                })}
              </div>
            </div>
          </div>          {/* Results */}
          <div className="lg:col-span-3 order-1 lg:order-2">
            {filteredResults.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 sm:p-8 text-center transition-colors duration-300">
                <CheckCircle className="w-10 h-10 sm:w-12 sm:h-12 text-green-600 dark:text-green-400 mx-auto mb-3 sm:mb-4 transition-colors duration-300" />
                <h3 className="text-base sm:text-lg font-medium text-gray-900 dark:text-gray-100 mb-2 transition-colors duration-300">
                  {currentReport.results.length === 0 ? 'No issues found!' : 'No results match your filters'}
                </h3>
                <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 transition-colors duration-300">
                  {currentReport.results.length === 0 
                    ? 'This workflow follows best practices.' 
                    : 'Try adjusting your filters to see more results.'
                  }
                </p>
              </div>
            ) : (
              <div className="space-y-3 sm:space-y-4">
                {filteredResults.map((result) => {
                  const severityInfo = severityConfig[result.severity];
                  const typeInfo = typeConfig[result.type];
                  const SeverityIcon = severityInfo.icon;
                  const TypeIcon = typeInfo.icon;
                  const isExpanded = expandedIssues.has(result.id);

                  return (                    <div
                      key={result.id}
                      className={`bg-white dark:bg-gray-800 border rounded-lg shadow-sm hover:shadow-md transition-all duration-300 ${severityInfo.border.replace('border-', 'border-').replace('-200', '-200 dark:border-').replace('-200', '-600')} overflow-hidden`}
                    >
                      <div
                        className="p-3 sm:p-4 cursor-pointer"
                        onClick={() => toggleExpanded(result.id)}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`p-1.5 sm:p-2 rounded-lg flex-shrink-0 ${severityInfo.bg.replace('bg-', 'bg-').replace('-50', '-50 dark:bg-opacity-20')}`}>
                            <SeverityIcon className={`w-4 h-4 sm:w-5 sm:h-5 ${severityInfo.color.replace('text-', 'text-').replace('-600', '-600 dark:text-').replace('-600', '-400')}`} />
                          </div>
                          
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mb-2">
                              <h3 className="font-medium text-gray-900 dark:text-gray-100 transition-colors duration-300 text-sm sm:text-base break-words">{result.title}</h3>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <TypeIcon className={`w-3 h-3 sm:w-4 sm:h-4 ${typeInfo.color.replace('text-', 'text-').replace('-600', '-600 dark:text-').replace('-600', '-400')}`} />
                                <span className="text-xs text-gray-500 dark:text-gray-400 transition-colors duration-300">{typeInfo.label}</span>
                              </div>
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
                      </div>                      {isExpanded && (
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
              </div>
            )}
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