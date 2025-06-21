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
  Network
} from 'lucide-react';
import { AnalysisReport, WorkflowFile } from '../types/workflow';
import { generateMarkdownReport, generatePDFReport } from '../utils/workflowAnalyzer';
import AnalysisCharts from './charts/AnalysisCharts';
import WorkflowDependencyGraph from './charts/WorkflowDependencyGraph';

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

export default function AnalysisResults({ reports, workflowFiles, onNewAnalysis }: AnalysisResultsProps) {
  const [selectedFile, setSelectedFile] = useState<string>(reports[0]?.fileId || '');
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [selectedSeverities, setSelectedSeverities] = useState<Set<string>>(new Set());
  const [expandedIssues, setExpandedIssues] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'list' | 'charts' | 'network'>('list');

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
        <GitBranch className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No workflows analyzed yet</h3>
        <p className="text-gray-600">Upload workflow files to see analysis results</p>
      </div>
    );
  }

  const getScoreColor = (score: number) => {
    if (score === 100) return 'text-green-600';
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Analysis Results</h2>
          <p className="text-gray-600 mt-1">
            {reports.length} file{reports.length !== 1 ? 's' : ''} analyzed
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            onClick={onNewAnalysis}
            className="inline-flex items-center px-4 py-2 bg-gray-600 text-white font-medium rounded-lg hover:bg-gray-700 transition-colors min-h-[44px]"
          >
            <RefreshCw className="w-5 h-5 mr-2" />
            New Analysis
          </button>
          <button
            onClick={handleExportMarkdown}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors min-h-[44px]"
          >
            <FileText className="w-5 h-5 mr-2" />
            Export Markdown
          </button>
          <button
            onClick={handleExportPDF}
            className="inline-flex items-center px-4 py-2 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 transition-colors min-h-[44px]"
          >
            <Download className="w-5 h-5 mr-2" />
            Export PDF
          </button>
        </div>
      </div>

      {/* File Selector */}
      {reports.length > 1 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select File
          </label>
          <select
            value={selectedFile}
            onChange={(e) => setSelectedFile(e.target.value)}
            className="w-full md:w-auto px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
        <div className="space-y-6">
          {/* View Toggle Tabs */}
          <div className="bg-white border border-gray-200 rounded-lg p-1">
            <div className="flex space-x-1">
              <button
                onClick={() => setActiveTab('list')}
                className={`flex-1 flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'list'
                    ? 'bg-blue-500 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <FileText className="w-4 h-4 mr-2" />
                Issue List
              </button>
              <button
                onClick={() => setActiveTab('charts')}
                className={`flex-1 flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'charts'
                    ? 'bg-blue-500 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <BarChart3 className="w-4 h-4 mr-2" />
                Analytics
              </button>
              <button
                onClick={() => setActiveTab('network')}
                className={`flex-1 flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'network'
                    ? 'bg-blue-500 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <Network className="w-4 h-4 mr-2" />
                Network View
              </button>
            </div>
          </div>

          {/* Content based on active tab */}
          {activeTab === 'charts' && (
            <AnalysisCharts reports={reports} />
          )}

          {activeTab === 'network' && (
            <WorkflowDependencyGraph reports={reports} />
          )}

          {activeTab === 'list' && (
        <div className="grid lg:grid-cols-4 gap-6">
          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            {/* Score Card */}
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <div className="text-center">
                <div className={`text-4xl font-bold mb-2 ${getScoreColor(currentReport.summary.score)}`}>
                  {currentReport.summary.score}
                </div>
                <div className="text-sm text-gray-600 mb-4">Overall Score</div>
                
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-red-600">Errors</span>
                    <span className="font-medium">{currentReport.summary.errorCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-yellow-600">Warnings</span>
                    <span className="font-medium">{currentReport.summary.warningCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-blue-600">Info</span>
                    <span className="font-medium">{currentReport.summary.infoCount}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Filters */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="font-medium text-gray-900 mb-4 flex items-center">
                <Filter className="w-4 h-4 mr-2" />
                Filters
              </h3>
              
              {/* Type Filters */}
              <div className="space-y-3 mb-4">
                <h4 className="text-sm font-medium text-gray-700">Type</h4>
                {Object.entries(typeConfig).map(([type, config]) => {
                  const Icon = config.icon;
                  const count = currentReport.results.filter(r => r.type === type).length;
                  if (count === 0) return null;
                  
                  return (
                    <label key={type} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={selectedTypes.has(type)}
                        onChange={() => toggleFilter(selectedTypes, setSelectedTypes, type)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <Icon className={`w-4 h-4 ml-2 mr-1 ${config.color}`} />
                      <span className="text-sm text-gray-700 flex-1">{config.label}</span>
                      <span className="text-xs text-gray-500">{count}</span>
                    </label>
                  );
                })}
              </div>

              {/* Severity Filters */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-gray-700">Severity</h4>
                {Object.entries(severityConfig).map(([severity, config]) => {
                  const Icon = config.icon;
                  const count = currentReport.results.filter(r => r.severity === severity).length;
                  if (count === 0) return null;
                  
                  return (
                    <label key={severity} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={selectedSeverities.has(severity)}
                        onChange={() => toggleFilter(selectedSeverities, setSelectedSeverities, severity)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <Icon className={`w-4 h-4 ml-2 mr-1 ${config.color}`} />
                      <span className="text-sm text-gray-700 flex-1 capitalize">{severity}</span>
                      <span className="text-xs text-gray-500">{count}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Results */}
          <div className="lg:col-span-3">
            {filteredResults.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
                <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {currentReport.results.length === 0 ? 'No issues found!' : 'No results match your filters'}
                </h3>
                <p className="text-gray-600">
                  {currentReport.results.length === 0 
                    ? 'This workflow follows best practices.' 
                    : 'Try adjusting your filters to see more results.'
                  }
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredResults.map((result) => {
                  const severityInfo = severityConfig[result.severity];
                  const typeInfo = typeConfig[result.type];
                  const SeverityIcon = severityInfo.icon;
                  const TypeIcon = typeInfo.icon;
                  const isExpanded = expandedIssues.has(result.id);

                  return (
                    <div
                      key={result.id}
                      className={`bg-white border rounded-lg shadow-sm hover:shadow-md transition-shadow ${severityInfo.border}`}
                    >
                      <div
                        className="p-4 cursor-pointer"
                        onClick={() => toggleExpanded(result.id)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-start space-x-3 min-w-0 flex-1">
                            <div className={`p-2 rounded-lg ${severityInfo.bg}`}>
                              <SeverityIcon className={`w-5 h-5 ${severityInfo.color}`} />
                            </div>
                            
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center space-x-2 mb-1">
                                <h3 className="font-medium text-gray-900">{result.title}</h3>
                                <div className="flex items-center space-x-1">
                                  <TypeIcon className={`w-4 h-4 ${typeInfo.color}`} />
                                  <span className="text-xs text-gray-500">{typeInfo.label}</span>
                                </div>
                              </div>
                              
                              <p className="text-sm text-gray-600 mb-2">{result.description}</p>
                              
                              {result.location && (
                                <div className="text-xs text-gray-500">
                                  {result.location.line && (
                                    result.githubUrl ? (
                                      <a 
                                        href={result.githubUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center text-blue-600 hover:text-blue-800 hover:underline"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <ExternalLink className="w-3 h-3 mr-1" />
                                        Line: {result.location.line}
                                      </a>
                                    ) : (
                                      `Line: ${result.location.line}`
                                    )
                                  )}
                                  {result.location.job && `, Job: ${result.location.job}`}
                                  {result.location.step && `, Step: ${result.location.step}`}
                                </div>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex-shrink-0 ml-4">
                            {isExpanded ? (
                              <ChevronDown className="w-5 h-5 text-gray-400" />
                            ) : (
                              <ChevronRight className="w-5 h-5 text-gray-400" />
                            )}
                          </div>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="border-t border-gray-100 p-4 space-y-4">
                          {result.suggestion && (
                            <div>
                              <h4 className="text-sm font-medium text-gray-900 mb-2">Suggestion</h4>
                              <p className="text-sm text-gray-700">{result.suggestion}</p>
                            </div>
                          )}

                          {result.codeSnippet && (
                            <div>
                              <h4 className="text-sm font-medium text-gray-900 mb-2">Code Context</h4>
                              <div className="relative bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
                                <div className="absolute top-2 right-2 text-xs text-gray-500 bg-white px-2 py-1 rounded border">
                                  Lines {result.codeSnippet.startLine}-{result.codeSnippet.endLine}
                                </div>
                                <pre className="p-4 text-sm overflow-x-auto">
                                  <code className="language-yaml">
                                    {result.codeSnippet.content.split('\n').map((line, index) => {
                                      const lineNumber = result.codeSnippet!.startLine + index;
                                      const isHighlighted = result.codeSnippet!.highlightLine && 
                                        lineNumber === result.codeSnippet!.startLine + result.codeSnippet!.highlightLine - 1;
                                      
                                      return (
                                        <div 
                                          key={index} 
                                          className={`flex ${isHighlighted ? 'bg-yellow-100 -mx-4 px-4' : ''}`}
                                        >
                                          <span className="text-gray-400 mr-4 select-none w-8 text-right flex-shrink-0">
                                            {lineNumber}
                                          </span>
                                          <span className="flex-1">{line}</span>
                                        </div>
                                      );
                                    })}
                                  </code>
                                </pre>
                              </div>
                            </div>
                          )}
                          
                          {result.links && result.links.length > 0 && (
                            <div>
                              <h4 className="text-sm font-medium text-gray-900 mb-2">References</h4>
                              <div className="space-y-1">
                                {result.links.map((link, index) => (
                                  <a
                                    key={index}
                                    href={link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800"
                                  >
                                    <ExternalLink className="w-3 h-3 mr-1" />
                                    {link}
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
    </div>
  );
}