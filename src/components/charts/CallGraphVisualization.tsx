import { useMemo } from 'react';
import {
  ReactFlow,
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  Position,
  MarkerType,
  Handle,
  ConnectionMode
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { AnalysisReport } from '../../types/workflow';
import { GitBranch, Package, Upload, Download, Database, Zap, AlertTriangle } from 'lucide-react';

// Custom styles for ReactFlow controls visibility
const controlsStyle = `
  .react-flow-controls button {
    background-color: white !important;
    border: 1px solid #d1d5db !important;
    color: #374151 !important;
    opacity: 1 !important;
  }
  .dark .react-flow-controls button {
    background-color: #374151 !important;
    border: 1px solid #6b7280 !important;
    color: #f3f4f6 !important;
  }
  .react-flow-controls button:hover {
    background-color: #f9fafb !important;
  }
  .dark .react-flow-controls button:hover {
    background-color: #4b5563 !important;
  }
`;

interface CallGraphVisualizationProps {
  reports: AnalysisReport[];
}

interface CallGraphNode extends Node {
  data: {
    label: string;
    type: 'job' | 'action' | 'artifact';
    severity?: 'error' | 'warning' | 'info';
    jobId?: string;
    actionName?: string;
    artifactName?: string;
    isolated?: boolean;
    criticalPath?: boolean;
  };
}

interface CallGraphEdge extends Edge {
  data?: {
    type: 'needs' | 'artifact' | 'output' | 'env';
    details?: string;
  };
}

const nodeTypes = {
  jobNode: ({ data }: { data: any }) => (
    <div className={`px-4 py-3 rounded-lg border-2 bg-white dark:bg-gray-800 shadow-lg min-w-[140px] ${
      data.isolated ? 'border-gray-400 bg-gray-50 dark:bg-gray-700 dark:border-gray-500' :
      data.criticalPath ? 'border-red-500 bg-red-50 dark:bg-red-900/20 dark:border-red-400' :
      data.severity === 'error' ? 'border-red-400 bg-red-50 dark:bg-red-900/20 dark:border-red-400' :
      data.severity === 'warning' ? 'border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-400' :
      'border-blue-400 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-400'
    }`}>
      <div className="flex items-center space-x-2 mb-1">
        <GitBranch className={`w-4 h-4 ${
          data.isolated ? 'text-gray-500 dark:text-gray-400' :
          data.criticalPath ? 'text-red-600 dark:text-red-400' :
          data.severity === 'error' ? 'text-red-600 dark:text-red-400' :
          data.severity === 'warning' ? 'text-yellow-600 dark:text-yellow-400' :
          'text-blue-600 dark:text-blue-400'
        }`} />
        <span className="font-semibold text-sm text-gray-800 dark:text-gray-200">{data.label}</span>
      </div>
      <div className="flex flex-wrap gap-1 text-xs">
        {data.isolated && <span className="px-1 py-0.5 bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-300 rounded">isolated</span>}
        {data.criticalPath && <span className="px-1 py-0.5 bg-red-200 text-red-700 dark:bg-red-800 dark:text-red-300 rounded">critical</span>}
        {data.severity === 'error' && <span className="px-1 py-0.5 bg-red-200 text-red-700 dark:bg-red-800 dark:text-red-300 rounded">errors</span>}
        {data.severity === 'warning' && <span className="px-1 py-0.5 bg-yellow-200 text-yellow-700 dark:bg-yellow-800 dark:text-yellow-300 rounded">warnings</span>}
      </div>
      <Handle type="target" position={Position.Top} className="w-3 h-3" />
      <Handle type="source" position={Position.Bottom} className="w-3 h-3" />
    </div>
  ),
  actionNode: ({ data }: { data: any }) => (
    <div className="px-3 py-2 rounded-md border bg-purple-50 border-purple-300 dark:bg-purple-900/20 dark:border-purple-400 shadow-sm">
      <div className="flex items-center space-x-1">
        <Package className="w-3 h-3 text-purple-600 dark:text-purple-400" />
        <span className="text-xs font-medium text-purple-800 dark:text-purple-300">{data.label}</span>
      </div>
      <Handle type="target" position={Position.Top} className="w-2 h-2" />
    </div>
  ),
  artifactNode: ({ data }: { data: any }) => (
    <div className="px-3 py-2 rounded-md border bg-green-50 border-green-300 dark:bg-green-900/20 dark:border-green-400 shadow-sm">
      <div className="flex items-center space-x-1">
        {data.artifactName?.includes('upload') ? 
          <Upload className="w-3 h-3 text-green-600 dark:text-green-400" /> :
          <Download className="w-3 h-3 text-green-600 dark:text-green-400" />
        }
        <span className="text-xs font-medium text-green-800 dark:text-green-300">{data.label}</span>
      </div>
      <Handle type="target" position={Position.Top} className="w-2 h-2" />
      <Handle type="source" position={Position.Bottom} className="w-2 h-2" />
    </div>
  )
};

export default function CallGraphVisualization({ reports }: CallGraphVisualizationProps) {
  const { nodes, edges, stats } = useMemo(() => {
    const allNodes: CallGraphNode[] = [];
    const allEdges: CallGraphEdge[] = [];
    const jobPositions = new Map<string, { x: number; y: number }>();
    const actionCounts = new Map<string, number>();
    
    let maxPathLength = 0;
    let totalJobs = 0;
    let totalDependencies = 0;

    try {
      reports.forEach((report, reportIndex) => {
        if (!report.callGraphData) return;

        const { jobDependencies, actionUsage, criticalPaths, isolatedJobs } = report.callGraphData;
        
        // Safety checks
        if (!jobDependencies || !actionUsage || !criticalPaths || !isolatedJobs) {
          console.warn('Missing call graph data properties for report:', report.fileName);
          return;
        }
      
      // Track statistics
      const allJobsInReport = new Set<string>();
      jobDependencies.forEach(dep => {
        allJobsInReport.add(dep.from);
        allJobsInReport.add(dep.to);
      });
      isolatedJobs.forEach(job => allJobsInReport.add(job));
      
      totalJobs += allJobsInReport.size;
      totalDependencies += jobDependencies.length;
      
      const longestPath = criticalPaths.reduce((longest, path) => 
        path.length > longest ? path.length : longest, 0);
      maxPathLength = Math.max(maxPathLength, longestPath);

        // Create job nodes
        const allJobs = new Set<string>();
        jobDependencies.forEach(dep => {
          allJobs.add(dep.from);
          allJobs.add(dep.to);
        });
        isolatedJobs.forEach(job => allJobs.add(job));

        const jobsArray = Array.from(allJobs);
        
        // Build dependency graph for better positioning
        const dependencyGraph = new Map<string, string[]>();
        const inDegree = new Map<string, number>();
        
        jobsArray.forEach(job => {
          dependencyGraph.set(job, []);
          inDegree.set(job, 0);
        });
        
        jobDependencies.forEach(dep => {
          const dependencies = dependencyGraph.get(dep.to) || [];
          dependencies.push(dep.from);
          dependencyGraph.set(dep.to, dependencies);
          inDegree.set(dep.to, (inDegree.get(dep.to) || 0) + 1);
        });

        // Topological sort for better positioning
        const levels = new Map<string, number>();
        const queue = jobsArray.filter(job => (inDegree.get(job) || 0) === 0);
        let currentLevel = 0;
        
        while (queue.length > 0) {
          const levelSize = queue.length;
          for (let i = 0; i < levelSize; i++) {
            const job = queue.shift()!;
            levels.set(job, currentLevel);
            
            // Find jobs that depend on this job
            jobDependencies.forEach(dep => {
              if (dep.from === job) {
                const newInDegree = (inDegree.get(dep.to) || 0) - 1;
                inDegree.set(dep.to, newInDegree);
                if (newInDegree === 0) {
                  queue.push(dep.to);
                }
              }
            });
          }
          currentLevel++;
        }

        // Position jobs based on their level and workflow
        const baseY = reportIndex * 400;
        const levelWidth = 250;
        const levelHeight = 100;
        
        jobsArray.forEach((jobId) => {
          const level = levels.get(jobId) || 0;
          const jobsAtLevel = jobsArray.filter(j => levels.get(j) === level);
          const positionInLevel = jobsAtLevel.indexOf(jobId);
          
          const x = level * levelWidth + 100;
          const y = baseY + positionInLevel * levelHeight + 50;
          
          jobPositions.set(jobId, { x, y });

          const isIsolated = isolatedJobs.includes(jobId);
          const isInCriticalPath = criticalPaths.some(path => path.includes(jobId));
          
          // Count issues for this job
          const jobIssues = report.results.filter(r => r.location?.job === jobId);
          const severity = jobIssues.some(i => i.severity === 'error') ? 'error' :
                          jobIssues.some(i => i.severity === 'warning') ? 'warning' : 'info';

          allNodes.push({
            id: `${report.fileId}-job-${jobId}`,
            type: 'jobNode',
            position: { x, y },
            data: {
              label: jobId,
              type: 'job',
              jobId,
              severity,
              isolated: isIsolated,
              criticalPath: isInCriticalPath
            }
          });
        });              // Create dependency edges
        jobDependencies.forEach((dep, index) => {
          const edgeColor = dep.type === 'needs' ? '#3b82f6' :
                           dep.type === 'artifact' ? '#10b981' :
                           dep.type === 'output' ? '#8b5cf6' : '#6b7280';
          
          const edgeStyle = dep.type === 'needs' ? { strokeWidth: 3, strokeDasharray: '0' } :
                           dep.type === 'artifact' ? { strokeWidth: 2, strokeDasharray: '5,5' } :
                           dep.type === 'output' ? { strokeWidth: 2, strokeDasharray: '3,3' } :
                           { strokeWidth: 1, strokeDasharray: '1,1' };

          allEdges.push({
            id: `${report.fileId}-dep-${index}`,
            source: `${report.fileId}-job-${dep.from}`,
            target: `${report.fileId}-job-${dep.to}`,
            type: 'smoothstep',
            animated: dep.type === 'needs',
            style: { stroke: edgeColor, ...edgeStyle },
            markerEnd: { type: MarkerType.ArrowClosed, color: edgeColor },
            label: dep.details ? `${dep.type}: ${dep.details}` : dep.type,
            labelStyle: { 
              fontSize: '11px', 
              fontWeight: 'bold', 
              fill: edgeColor,
              backgroundColor: 'white',
              padding: '2px 4px',
              borderRadius: '3px'
            },
            labelBgStyle: { fill: 'white', fillOpacity: 0.8 },
            data: {
              type: dep.type as 'needs' | 'artifact' | 'output' | 'env',
              details: dep.details
            }
          });
        });

      // Track action usage
      actionUsage.forEach(usage => {
        const key = usage.action;
        actionCounts.set(key, (actionCounts.get(key) || 0) + 1);
      });
    });

    // Add action usage summary nodes
    let actionY = reports.length * 300 + 100;
    Array.from(actionCounts.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10) // Top 10 most used actions
      .forEach(([action, count], index) => {
        allNodes.push({
          id: `action-${action.replace(/[^a-zA-Z0-9]/g, '-')}`,
          type: 'actionNode',
          position: { x: (index % 5) * 180 + 50, y: actionY + Math.floor(index / 5) * 60 },
          data: {
            label: `${action.split('/').pop()} (${count}x)`,
            type: 'action',
            actionName: action
          }
        });
      });

    const stats = {
      totalJobs,
      totalDependencies,
      maxPathLength,
      topActions: Array.from(actionCounts.entries()).sort(([, a], [, b]) => b - a).slice(0, 3)
    };

    return { nodes: allNodes, edges: allEdges, stats };
    } catch (error) {
      console.error('Error generating call graph data:', error);
      return { 
        nodes: [], 
        edges: [], 
        stats: { totalJobs: 0, totalDependencies: 0, maxPathLength: 0, topActions: [] } 
      };
    }
  }, [reports]);

  if (reports.length === 0 || !reports.some(r => r.callGraphData)) {
    return (
      <div className="p-6 text-center text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <GitBranch className="w-12 h-12 mx-auto mb-3 text-gray-400 dark:text-gray-500" />
        <p className="text-lg font-medium mb-2 text-gray-800 dark:text-gray-200">No Call Graph Data Available</p>
        <p className="text-sm text-gray-600 dark:text-gray-400">Upload workflow files to see dependency relationships and call graph analysis.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <style dangerouslySetInnerHTML={{ __html: controlsStyle }} />
      {/* Analysis Summary */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Call Graph Analysis Summary</h3>
        
        {/* Issues Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {reports.map((report, index) => {
            const errorCount = report.results.filter(r => r.severity === 'error').length;
            const warningCount = report.results.filter(r => r.severity === 'warning').length;
            const infoCount = report.results.filter(r => r.severity === 'info').length;
            
            return (
              <div key={index} className="border rounded-lg p-4 dark:border-gray-600 dark:bg-gray-800">
                <h4 className="font-medium text-sm text-gray-800 dark:text-gray-200 mb-2">{report.fileName}</h4>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-red-600 dark:text-red-400">Errors:</span>
                    <span className="font-medium text-gray-800 dark:text-gray-200">{errorCount}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-yellow-600 dark:text-yellow-400">Warnings:</span>
                    <span className="font-medium text-gray-800 dark:text-gray-200">{warningCount}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-blue-600 dark:text-blue-400">Info:</span>
                    <span className="font-medium text-gray-800 dark:text-gray-200">{infoCount}</span>
                  </div>
                  <div className="flex justify-between text-sm font-semibold">
                    <span className="text-gray-800 dark:text-gray-200">Score:</span>
                    <span className={`${report.summary.score >= 80 ? 'text-green-600 dark:text-green-400' : 
                                         report.summary.score >= 60 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'}`}>
                      {report.summary.score}/100
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Key Findings */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
          <h4 className="font-medium text-gray-800 dark:text-gray-200 mb-3">Key Findings</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {reports.flatMap(report => 
              report.results
                .filter(r => r.type === 'structure' || r.type === 'dependency')
                .slice(0, 6)
                .map((result, index) => (
                  <div key={`${report.fileId}-${index}`} 
                       className={`p-3 rounded border-l-4 ${
                         result.severity === 'error' ? 'border-red-400 bg-red-50 dark:bg-red-900/20' :
                         result.severity === 'warning' ? 'border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20' :
                         'border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                       }`}>
                    <div className="font-medium text-sm text-gray-900 dark:text-gray-100">{result.title}</div>
                    <div className="text-xs text-gray-700 dark:text-gray-300 mt-1">{result.description}</div>
                  </div>
                ))
            )}
          </div>
        </div>
      </div>

      {/* Statistics Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-blue-50 dark:bg-blue-900/30 p-3 rounded-lg">
          <div className="flex items-center space-x-2">
            <GitBranch className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span className="text-sm font-medium text-blue-800 dark:text-blue-200">Total Jobs</span>
          </div>
          <p className="text-xl font-bold text-blue-900 dark:text-blue-100">{stats.totalJobs}</p>
        </div>
        
        <div className="bg-green-50 dark:bg-green-900/30 p-3 rounded-lg">
          <div className="flex items-center space-x-2">
            <Database className="w-4 h-4 text-green-600 dark:text-green-400" />
            <span className="text-sm font-medium text-green-800 dark:text-green-200">Dependencies</span>
          </div>
          <p className="text-xl font-bold text-green-900 dark:text-green-100">{stats.totalDependencies}</p>
        </div>
        
        <div className="bg-purple-50 dark:bg-purple-900/30 p-3 rounded-lg">
          <div className="flex items-center space-x-2">
            <Zap className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            <span className="text-sm font-medium text-purple-800 dark:text-purple-200">Longest Path</span>
          </div>
          <p className="text-xl font-bold text-purple-900 dark:text-purple-100">{stats.maxPathLength} jobs</p>
        </div>
        
        <div className="bg-orange-50 dark:bg-orange-900/30 p-3 rounded-lg">
          <div className="flex items-center space-x-2">
            <Package className="w-4 h-4 text-orange-600 dark:text-orange-400" />
            <span className="text-sm font-medium text-orange-800 dark:text-orange-200">Top Action</span>
          </div>
          <p className="text-sm font-bold text-orange-900 dark:text-orange-100">
            {stats.topActions[0] ? `${stats.topActions[0][0].split('/').pop()} (${stats.topActions[0][1]}x)` : 'None'}
          </p>
        </div>
      </div>

      {/* Call Graph Visualization */}
            {/* Call Graph Visualization */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="h-[600px] w-full">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.1 }}
            connectionMode={ConnectionMode.Loose}
            defaultEdgeOptions={{ type: 'smoothstep' }}
            className="dark:bg-gray-800"
          >
            <Background color="#f1f5f9" className="dark:opacity-20" />
            <Controls className="react-flow-controls" />
            <MiniMap 
              nodeStrokeColor={(n: any) => {
                if (n.style?.background) return n.style.background;
                return '#1a192b';
              }}
              className="!bg-white dark:!bg-gray-800 !border-gray-300 dark:!border-gray-600 !shadow-lg"
            />
          </ReactFlow>
        </div>
      </div>

      {/* Legend */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
        <div className="space-y-2">
          <h4 className="font-semibold text-gray-800 dark:text-gray-200">Job Types</h4>
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-blue-100 border border-blue-400 rounded"></div>
              <span className="text-gray-700 dark:text-gray-300">Normal Job</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-red-100 border border-red-400 rounded"></div>
              <span className="text-gray-700 dark:text-gray-300">Critical Path Job</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-gray-100 border border-gray-400 rounded"></div>
              <span className="text-gray-700 dark:text-gray-300">Isolated Job</span>
            </div>
          </div>
        </div>
        
        <div className="space-y-2">
          <h4 className="font-semibold text-gray-800 dark:text-gray-200">Dependency Types</h4>
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <div className="w-4 h-0.5 bg-blue-500"></div>
              <span className="text-gray-700 dark:text-gray-300">Job Dependency (needs)</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-0.5 bg-green-500"></div>
              <span className="text-gray-700 dark:text-gray-300">Artifact Dependency</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-0.5 bg-purple-500"></div>
              <span className="text-gray-700 dark:text-gray-300">Output Dependency</span>
            </div>
          </div>
        </div>
        
        <div className="space-y-2">
          <h4 className="font-semibold text-gray-800 dark:text-gray-200">Issues</h4>
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="w-3 h-3 text-red-500" />
              <span className="text-gray-700 dark:text-gray-300">Error</span>
            </div>
            <div className="flex items-center space-x-2">
              <AlertTriangle className="w-3 h-3 text-yellow-500" />
              <span className="text-gray-700 dark:text-gray-300">Warning</span>
            </div>
            <div className="flex items-center space-x-2">
              <GitBranch className="w-3 h-3 text-blue-500" />
              <span className="text-gray-700 dark:text-gray-300">Info</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
