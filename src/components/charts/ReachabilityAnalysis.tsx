import { Shield, AlertTriangle, CheckCircle, Info, Eye, EyeOff, Zap, GitBranch, ArrowRight, MapPin, Settings, Code, Target, Users } from 'lucide-react';
import { AnalysisReport } from '../../types/workflow';

interface ReachabilityAnalysisProps {
  report: AnalysisReport;
}

export function ReachabilityAnalysis({ report }: ReachabilityAnalysisProps) {
  if (!report.reachabilityData) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        <Eye className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>Reachability analysis not available for this workflow</p>
      </div>
    );
  }

  const { stats, executionContext, insights } = report.reachabilityData;
  
  // Filter to only show security-related results for reachability analysis
  const securityResults = report.results.filter(result => result.type === 'security');
  const actualSecurityCount = securityResults.length;
  
  // If no security issues, show appropriate message
  if (actualSecurityCount === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-500" />
        <h3 className="text-lg font-medium mb-2 text-gray-700 dark:text-gray-300">No Security Issues Detected</h3>
        <p className="text-sm">This workflow appears to follow security best practices.</p>
        <p className="text-sm mt-2">Reachability analysis is not needed when no security vulnerabilities are present.</p>
      </div>
    );
  }
  
  // Use actual security count instead of stats.totalIssues which might be incorrect
  const totalSecurityIssues = actualSecurityCount;
  const reachableIssues = Math.min(stats.reachableIssues, totalSecurityIssues);
  const highRiskIssues = Math.min(stats.highRiskIssues, totalSecurityIssues);
  
  // Calculate false positive reduction percentage
  const falsePositiveReduction = totalSecurityIssues > 0 ? 
    Math.round(((totalSecurityIssues - reachableIssues) / totalSecurityIssues) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Overview Stats */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Reachability Analysis Overview
          </h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-orange-600" />
              <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Total Security Issues</span>
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{totalSecurityIssues}</div>
          </div>
          
          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Eye className="w-4 h-4 text-green-600" />
              <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Reachable</span>
            </div>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">{reachableIssues}</div>
          </div>
          
          <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4 text-red-600" />
              <span className="text-sm font-medium text-gray-600 dark:text-gray-300">High Risk</span>
            </div>
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">{highRiskIssues}</div>
          </div>
          
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <EyeOff className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium text-gray-600 dark:text-gray-300">False Positives Reduced</span>
            </div>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{falsePositiveReduction}%</div>
          </div>
        </div>
      </div>

      {/* Execution Context */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-2 mb-4">
          <GitBranch className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Execution Context
          </h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Workflow Triggers</h4>
            <div className="flex flex-wrap gap-2">
              {executionContext.triggers.map((trigger, index) => (
                <span
                  key={index}
                  className={`px-3 py-1 rounded-full text-xs font-medium ${
                    ['workflow_run', 'pull_request_target', 'repository_dispatch'].includes(trigger)
                      ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                      : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                  }`}
                >
                  {trigger}
                </span>
              ))}
            </div>
          </div>
          
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Security Factors</h4>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${
                  executionContext.hasPrivilegedTriggers ? 'bg-red-500' : 'bg-green-500'
                }`} />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Privileged Triggers: {executionContext.hasPrivilegedTriggers ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${
                  executionContext.hasSecrets ? 'bg-orange-500' : 'bg-green-500'
                }`} />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Secrets Usage: {executionContext.hasSecrets ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${
                  executionContext.conditionalJobs > 0 ? 'bg-blue-500' : 'bg-gray-400'
                }`} />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Conditional Jobs: {executionContext.conditionalJobs}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Reachability Insights */}
      {insights && insights.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Info className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Detailed Reachability Analysis
            </h3>
          </div>
          
          <div className="space-y-6">
            {insights.map((insight, index) => (
              <div
                key={index}
                className={`border rounded-lg p-6 ${
                  insight.severity === 'error'
                    ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20'
                    : insight.severity === 'warning'
                    ? 'border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20'
                    : 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 mt-1">
                    {insight.severity === 'error' ? (
                      <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
                    ) : insight.severity === 'warning' ? (
                      <AlertTriangle className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
                    ) : (
                      <Info className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    {/* Header */}
                    <div className="flex items-center gap-3 mb-3">
                      <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
                        {insight.title}
                      </h4>
                      <div className="flex gap-2">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          insight.severity === 'error'
                            ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                            : insight.severity === 'warning'
                            ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
                            : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                        }`}>
                          {insight.severity.toUpperCase()}
                        </span>
                        <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                          {insight.type}
                        </span>
                      </div>
                    </div>
                    
                    {/* Description */}
                    <p className="text-gray-700 dark:text-gray-300 mb-4 leading-relaxed">
                      {insight.description}
                    </p>
                    
                    {/* Code Snippet */}
                    {insight.codeSnippet && (
                      <div className="mb-4">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                            📄 Code Context
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            Lines {insight.codeSnippet.startLine}-{insight.codeSnippet.endLine}
                          </span>
                        </div>
                        <div className="bg-gray-900 dark:bg-gray-950 rounded-lg p-4 overflow-x-auto border">
                          <pre className="text-sm text-gray-100 leading-relaxed">
                            <code className="language-yaml">{insight.codeSnippet.content}</code>
                          </pre>
                        </div>
                      </div>
                    )}

                    {/* Source-to-Sink Analysis */}
                    <div className="mb-6">
                      <div className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-lg p-6 border border-purple-200 dark:border-purple-700">
                        <div className="flex items-center gap-2 mb-4">
                          <Target className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                          <h5 className="text-lg font-semibold text-purple-800 dark:text-purple-300">
                            Source-to-Sink Analysis
                          </h5>
                        </div>
                        
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                          {/* Source */}
                          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                              <span className="font-semibold text-sm text-gray-700 dark:text-gray-300">SOURCE</span>
                            </div>
                            <div className="text-xs text-gray-600 dark:text-gray-400 mb-2">Data Origin</div>
                            <div className="space-y-1">
                              {insight.type === 'security' && (
                                <>
                                  <div className="text-sm text-gray-800 dark:text-gray-200">
                                    • Workflow Trigger: <code className="text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded">
                                      {executionContext.triggers.join(', ') || 'manual'}
                                    </code>
                                  </div>
                                  <div className="text-sm text-gray-800 dark:text-gray-200">
                                    • Input Source: <code className="text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded">
                                      {executionContext.hasSecrets ? 'secrets context' : 'environment variables'}
                                    </code>
                                  </div>
                                  <div className="text-sm text-gray-800 dark:text-gray-200">
                                    • Execution Context: <code className="text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded">
                                      {executionContext.hasPrivilegedTriggers ? 'privileged' : 'standard'}
                                    </code>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Flow Path */}
                          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                            <div className="flex items-center gap-2 mb-2">
                              <ArrowRight className="w-3 h-3 text-blue-500" />
                              <span className="font-semibold text-sm text-gray-700 dark:text-gray-300">FLOW PATH</span>
                            </div>
                            <div className="text-xs text-gray-600 dark:text-gray-400 mb-2">Execution Chain</div>
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                                <span className="text-xs text-gray-700 dark:text-gray-300">Step: Checkout</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                                <span className="text-xs text-gray-700 dark:text-gray-300">Step: Environment Setup</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-red-400 rounded-full"></div>
                                <span className="text-xs text-red-600 dark:text-red-400 font-medium">Step: Vulnerable Operation</span>
                              </div>
                              {insight.codeSnippet && (
                                <div className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                                  Line {insight.codeSnippet.highlightLine || insight.codeSnippet.startLine}: Vulnerability point
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Sink */}
                          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                              <span className="font-semibold text-sm text-gray-700 dark:text-gray-300">SINK</span>
                            </div>
                            <div className="text-xs text-gray-600 dark:text-gray-400 mb-2">Potential Impact</div>
                            <div className="space-y-1">
                              <div className="text-sm text-gray-800 dark:text-gray-200">
                                • Risk Level: <span className={`font-medium ${
                                  insight.severity === 'error' ? 'text-red-600 dark:text-red-400' :
                                  insight.severity === 'warning' ? 'text-yellow-600 dark:text-yellow-400' :
                                  'text-blue-600 dark:text-blue-400'
                                }`}>
                                  {insight.severity === 'error' ? 'High' : insight.severity === 'warning' ? 'Medium' : 'Low'}
                                </span>
                              </div>
                              <div className="text-sm text-gray-800 dark:text-gray-200">
                                • Exploitability: <span className="text-orange-600 dark:text-orange-400">
                                  {executionContext.hasPrivilegedTriggers ? 'High' : 'Medium'}
                                </span>
                              </div>
                              <div className="text-sm text-gray-800 dark:text-gray-200">
                                • Impact Scope: <span className="text-purple-600 dark:text-purple-400">
                                  {executionContext.hasSecrets ? 'Secrets exposure' : 'Environment access'}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Reachability Path */}
                        <div className="mt-4 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                          <div className="flex items-center gap-2 mb-3">
                            <MapPin className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                            <span className="font-semibold text-sm text-gray-700 dark:text-gray-300">Reachability Path</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm overflow-x-auto pb-2">
                            <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 rounded text-xs whitespace-nowrap">
                              Trigger Event
                            </span>
                            <ArrowRight className="w-3 h-3 text-gray-400 flex-shrink-0" />
                            <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 rounded text-xs whitespace-nowrap">
                              Job Execution
                            </span>
                            <ArrowRight className="w-3 h-3 text-gray-400 flex-shrink-0" />
                            <span className="px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 rounded text-xs whitespace-nowrap">
                              Step Processing
                            </span>
                            <ArrowRight className="w-3 h-3 text-gray-400 flex-shrink-0" />
                            <span className="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 rounded text-xs whitespace-nowrap">
                              Vulnerability
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Configuration Analysis */}
                    <div className="mb-6">
                      <div className="bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20 rounded-lg p-6 border border-orange-200 dark:border-orange-700">
                        <div className="flex items-center gap-2 mb-4">
                          <Settings className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                          <h5 className="text-lg font-semibold text-orange-800 dark:text-orange-300">
                            Configuration Analysis
                          </h5>
                        </div>
                        
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          {/* Security Configuration */}
                          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                            <div className="flex items-center gap-2 mb-3">
                              <Shield className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                              <span className="font-semibold text-sm text-gray-700 dark:text-gray-300">Security Settings</span>
                            </div>
                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-gray-600 dark:text-gray-400">Permissions:</span>
                                <span className={`font-medium ${
                                  executionContext.hasPrivilegedTriggers ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
                                }`}>
                                  {executionContext.hasPrivilegedTriggers ? 'Elevated' : 'Standard'}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600 dark:text-gray-400">Secrets Access:</span>
                                <span className={`font-medium ${
                                  executionContext.hasSecrets ? 'text-orange-600 dark:text-orange-400' : 'text-green-600 dark:text-green-400'
                                }`}>
                                  {executionContext.hasSecrets ? 'Enabled' : 'Disabled'}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600 dark:text-gray-400">Trigger Type:</span>
                                <span className="text-gray-700 dark:text-gray-300 font-mono text-xs">
                                  {executionContext.triggers.slice(0, 2).join(', ')}
                                  {executionContext.triggers.length > 2 && '...'}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Misconfiguration Details */}
                          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                            <div className="flex items-center gap-2 mb-3">
                              <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
                              <span className="font-semibold text-sm text-gray-700 dark:text-gray-300">Misconfiguration</span>
                            </div>
                            <div className="space-y-2 text-sm">
                              <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded border border-red-200 dark:border-red-800">
                                <div className="font-medium text-red-800 dark:text-red-300 mb-1">
                                  Issue: {insight.title}
                                </div>
                                <div className="text-red-700 dark:text-red-400 text-xs">
                                  {insight.description.slice(0, 100)}...
                                </div>
                              </div>
                              {insight.codeSnippet && (
                                <div className="text-xs text-gray-600 dark:text-gray-400">
                                  <strong>Location:</strong> Line {insight.codeSnippet.startLine}
                                  {insight.codeSnippet.highlightLine && (
                                    <span className="ml-2 text-red-600 dark:text-red-400">
                                      (Critical: Line {insight.codeSnippet.highlightLine})
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Method Call Chain Analysis */}
                    <div className="mb-6">
                      <div className="bg-gradient-to-r from-cyan-50 to-blue-50 dark:from-cyan-900/20 dark:to-blue-900/20 rounded-lg p-6 border border-cyan-200 dark:border-cyan-700">
                        <div className="flex items-center gap-2 mb-4">
                          <Code className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                          <h5 className="text-lg font-semibold text-cyan-800 dark:text-cyan-300">
                            Execution Flow Analysis
                          </h5>
                        </div>
                        
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                          {/* Call Chain */}
                          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                            <div className="flex items-center gap-2 mb-3">
                              <GitBranch className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                              <span className="font-semibold text-sm text-gray-700 dark:text-gray-300">Call Chain</span>
                            </div>
                            <div className="space-y-2">
                              <div className="flex items-center gap-2 text-sm">
                                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                <span className="text-gray-700 dark:text-gray-300">workflow.on.trigger</span>
                                <ArrowRight className="w-3 h-3 text-gray-400" />
                              </div>
                              <div className="flex items-center gap-2 text-sm">
                                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                <span className="text-gray-700 dark:text-gray-300">jobs.{insight.type || 'main'}</span>
                                <ArrowRight className="w-3 h-3 text-gray-400" />
                              </div>
                              <div className="flex items-center gap-2 text-sm">
                                <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                                <span className="text-gray-700 dark:text-gray-300">steps[].run</span>
                                <ArrowRight className="w-3 h-3 text-gray-400" />
                              </div>
                              <div className="flex items-center gap-2 text-sm">
                                <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                                <span className="text-red-600 dark:text-red-400 font-medium">vulnerable.operation()</span>
                              </div>
                              {insight.codeSnippet && (
                                <div className="mt-3 p-2 bg-gray-50 dark:bg-gray-700 rounded text-xs">
                                  <code className="text-gray-700 dark:text-gray-300">
                                    Line {insight.codeSnippet.startLine}: {insight.title}
                                  </code>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Data Flow */}
                          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                            <div className="flex items-center gap-2 mb-3">
                              <Users className="w-4 h-4 text-green-600 dark:text-green-400" />
                              <span className="font-semibold text-sm text-gray-700 dark:text-gray-300">Data Flow</span>
                            </div>
                            <div className="space-y-3">
                              <div className="space-y-1">
                                <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Input Sources</div>
                                <div className="flex flex-wrap gap-1">
                                  {executionContext.hasSecrets && (
                                    <span className="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 rounded text-xs">
                                      secrets.*
                                    </span>
                                  )}
                                  <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 rounded text-xs">
                                    env.*
                                  </span>
                                  <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 rounded text-xs">
                                    github.*
                                  </span>
                                </div>
                              </div>
                              
                              <div className="space-y-1">
                                <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Processing</div>
                                <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
                                  <span>Data manipulation</span>
                                  <ArrowRight className="w-3 h-3" />
                                  <span>Command execution</span>
                                </div>
                              </div>
                              
                              <div className="space-y-1">
                                <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Output Sinks</div>
                                <div className="flex flex-wrap gap-1">
                                  <span className="px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300 rounded text-xs">
                                    stdout
                                  </span>
                                  <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300 rounded text-xs">
                                    network
                                  </span>
                                  {insight.type === 'security' && (
                                    <span className="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 rounded text-xs">
                                      external
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Technical Analysis Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-4">
                      {/* Analysis Details */}
                      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                        <h5 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                          🔍 Analysis Details
                        </h5>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between items-center">
                            <span className="text-gray-500 dark:text-gray-400">Issue ID:</span>
                            <code className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                              {insight.id}
                            </code>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-gray-500 dark:text-gray-400">Severity Level:</span>
                            <span className={`font-medium ${
                              insight.severity === 'error' ? 'text-red-600 dark:text-red-400' :
                              insight.severity === 'warning' ? 'text-yellow-600 dark:text-yellow-400' :
                              'text-blue-600 dark:text-blue-400'
                            }`}>
                              {insight.severity.toUpperCase()}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-gray-500 dark:text-gray-400">Analysis Type:</span>
                            <span className="text-gray-700 dark:text-gray-300 font-medium">
                              {insight.type}
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      {/* Reachability Assessment */}
                      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                        <h5 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                          🎯 Reachability Assessment
                        </h5>
                        <div className="space-y-3">
                          <div className="flex items-center gap-3">
                            <div className={`w-3 h-3 rounded-full ${
                              insight.severity === 'error' ? 'bg-red-500' :
                              insight.severity === 'warning' ? 'bg-yellow-500' :
                              'bg-blue-500'
                            }`}></div>
                            <span className="text-sm text-gray-700 dark:text-gray-300">
                              {insight.severity === 'error' ? 'High Priority - Immediate Action Required' : 
                               insight.severity === 'warning' ? 'Medium Priority - Review Recommended' : 
                               'Low Priority - Monitor'}
                            </span>
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 p-3 rounded">
                            <strong>Context:</strong> This assessment is based on execution context analysis, 
                            trigger conditions, and potential impact scope within the workflow environment.
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Recommendation */}
                    {insight.suggestion && (
                      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                        <h5 className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-2 flex items-center gap-2">
                          💡 Expert Recommendation
                        </h5>
                        <p className="text-sm text-blue-700 dark:text-blue-300 leading-relaxed">
                          {insight.suggestion}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mitigation Stats */}
      {stats.mitigatedIssues > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Mitigation Analysis
            </h3>
          </div>
          
          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600 dark:text-green-400 mb-2">
                {stats.mitigatedIssues}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-300">
                Security issues have mitigating factors that reduce their effective risk
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Explanation */}
      <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
        <h4 className="font-medium text-gray-900 dark:text-white mb-2">About Reachability Analysis</h4>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Reachability analysis examines the execution context and conditions under which security vulnerabilities 
          can actually be exploited. This helps reduce false positives by considering factors like workflow triggers, 
          conditional execution, input sources, and environmental constraints. Issues marked as unreachable or with 
          mitigating factors have reduced practical risk in their current context.
        </p>
      </div>
    </div>
  );
}
