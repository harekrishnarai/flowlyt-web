import React, { useCallback, useMemo, useState } from 'react';
import {
  ReactFlow,
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Position,
  MarkerType,
  NodeTypes,
  Handle,
  ConnectionMode
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { AnalysisReport } from '../../types/workflow';
import { 
  Shield, 
  AlertTriangle, 
  AlertCircle, 
  Target,
  Lock,
  Eye,
  Skull,
  Crosshair,
  Package,
  X,
  Clock,
  FileText,
  Bug,
  Zap,
  Server,
  Database,
  Globe,
  Key,
  UserX,
  Code,
  Terminal,
  Network,
  HardDrive
} from 'lucide-react';

interface WorkflowDependencyGraphProps {
  reports: AnalysisReport[];
}

// MITRE ATT&CK TTPs mapping for GitHub Actions workflows
interface MitreTTP {
  id: string;
  name: string;
  description: string;
  tactic: string;
  technique: string;
  icon: any;
  color: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  patterns: string[];
}

const MITRE_TTPS: Record<string, MitreTTP[]> = {
  security: [
    {
      id: 'T1059.004',
      name: 'Command Line Interface',
      description: 'Adversaries may abuse command-line interfaces to execute commands',
      tactic: 'Execution',
      technique: 'Command and Scripting Interpreter',
      icon: Terminal,
      color: '#DC2626',
      severity: 'critical',
      patterns: ['bash', 'sh', 'powershell', 'cmd', 'eval', 'exec']
    },
    {
      id: 'T1078.004',
      name: 'Cloud Accounts',
      description: 'Adversaries may obtain cloud credentials to access cloud resources',
      tactic: 'Initial Access',
      technique: 'Valid Accounts',
      icon: Key,
      color: '#DC2626',
      severity: 'critical',
      patterns: ['AWS_ACCESS_KEY', 'GITHUB_TOKEN', 'secrets.', 'credentials']
    },
    {
      id: 'T1055',
      name: 'Process Injection',
      description: 'Adversaries may inject code into processes to evade defenses',
      tactic: 'Defense Evasion',
      technique: 'Process Injection',
      icon: Code,
      color: '#EF4444',
      severity: 'high',
      patterns: ['curl.*sh', 'wget.*sh', 'eval.*http']
    },
    {
      id: 'T1041',
      name: 'Exfiltration Over Network',
      description: 'Adversaries may steal data by exfiltrating it over network protocols',
      tactic: 'Exfiltration',
      technique: 'Exfiltration Over C2 Channel',
      icon: Network,
      color: '#EF4444',
      severity: 'high',
      patterns: ['curl.*env', 'wget.*env', 'nc.*', 'netcat']
    }
  ],
  dependency: [
    {
      id: 'T1195.001',
      name: 'Compromise Software Dependencies',
      description: 'Adversaries may manipulate software dependencies to execute malicious code',
      tactic: 'Initial Access',
      technique: 'Supply Chain Compromise',
      icon: Package,
      color: '#7C3AED',
      severity: 'high',
      patterns: ['npm install', 'pip install', 'composer install', 'gem install']
    },
    {
      id: 'T1195.002',
      name: 'Compromise Software Supply Chain',
      description: 'Adversaries may manipulate application software prior to receipt by end user',
      tactic: 'Initial Access',
      technique: 'Supply Chain Compromise',
      icon: Server,
      color: '#7C3AED',
      severity: 'high',
      patterns: ['docker pull', 'FROM.*latest', 'registry.', 'image:']
    },
    {
      id: 'T1574.006',
      name: 'Dynamic Linker Hijacking',
      description: 'Adversaries may execute malicious payloads by hijacking library manifest files',
      tactic: 'Persistence',
      technique: 'Hijack Execution Flow',
      icon: HardDrive,
      color: '#8B5CF6',
      severity: 'medium',
      patterns: ['LD_LIBRARY_PATH', 'DYLD_', 'library', 'libs']
    }
  ],
  structure: [
    {
      id: 'T1068',
      name: 'Exploitation for Privilege Escalation',
      description: 'Adversaries may exploit software vulnerabilities to escalate privileges',
      tactic: 'Privilege Escalation',
      technique: 'Exploitation for Privilege Escalation',
      icon: UserX,
      color: '#3730A3',
      severity: 'high',
      patterns: ['sudo', 'privileged', 'root', 'administrator']
    },
    {
      id: 'T1083',
      name: 'File and Directory Discovery',
      description: 'Adversaries may enumerate files and directories to find sensitive information',
      tactic: 'Discovery',
      technique: 'File and Directory Discovery',
      icon: Database,
      color: '#4338CA',
      severity: 'medium',
      patterns: ['find', 'ls -la', 'dir', 'tree', 'locate']
    },
    {
      id: 'T1505.003',
      name: 'Web Shell',
      description: 'Adversaries may backdoor web servers to establish persistent access',
      tactic: 'Persistence',
      technique: 'Server Software Component',
      icon: Globe,
      color: '#4F46E5',
      severity: 'high',
      patterns: ['php', 'asp', 'jsp', 'webshell', 'backdoor']    }
  ]
};

// Function to map security issues to MITRE ATT&CK TTPs
function mapIssueToMitreTTPs(issues: any[], type: string): MitreTTP[] {
  const relevantTTPs: MitreTTP[] = [];
  const ttpsForType = MITRE_TTPS[type] || [];
  
  // Analyze issues and match them to TTPs based on patterns
  issues.forEach(issue => {
    const issueText = `${issue.description} ${issue.type}`.toLowerCase();
    
    ttpsForType.forEach(ttp => {
      const matchesPattern = ttp.patterns.some(pattern => 
        issueText.includes(pattern.toLowerCase()) || 
        (issue.location?.content && issue.location.content.toLowerCase().includes(pattern.toLowerCase()))
      );
      
      if (matchesPattern && !relevantTTPs.find(existing => existing.id === ttp.id)) {
        relevantTTPs.push(ttp);
      }
    });
  });
  
  // If no specific matches, add generic TTPs for the category
  if (relevantTTPs.length === 0 && ttpsForType.length > 0) {
    relevantTTPs.push(ttpsForType[0]); // Add the primary TTP for this category
  }
  
  return relevantTTPs.sort((a, b) => {
    const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
    return severityOrder[b.severity] - severityOrder[a.severity];
  });
}

// Detailed information panel component
const NodeInfoPanel = ({ node, report, onClose }: { 
  node: Node | null; 
  report: AnalysisReport | null; 
  onClose: () => void; 
}) => {
  if (!node) return null;
  function renderWorkflowInfo() {
    if (!report) return null;
    
    return (
      <div className="space-y-4">
        <div className="text-center">
          <h4 className="text-xl font-bold text-slate-100 mb-2">{report.fileName}</h4>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-slate-800 p-3 rounded">
            <div className="text-2xl font-bold text-slate-100">{report.summary.score}</div>
            <div className="text-xs text-slate-400">Quality Score</div>
          </div>
          <div className="bg-slate-800 p-3 rounded">
            <div className="text-2xl font-bold text-slate-100">{report.summary.totalIssues}</div>
            <div className="text-xs text-slate-400">Total Issues</div>
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="font-semibold text-slate-200 flex items-center">
            <Bug className="w-4 h-4 mr-2" />
            Issue Breakdown
          </h4>
          <div className="space-y-1 text-sm">
            {report.summary.errorCount > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-red-300">Critical Issues</span>
                <span className="bg-red-800 px-2 py-1 rounded text-xs font-bold">
                  {report.summary.errorCount}
                </span>
              </div>
            )}
            {report.summary.warningCount > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-yellow-300">Warnings</span>
                <span className="bg-yellow-700 px-2 py-1 rounded text-xs font-bold">
                  {report.summary.warningCount}
                </span>
              </div>
            )}
            {report.summary.infoCount > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-blue-300">Info</span>
                <span className="bg-blue-700 px-2 py-1 rounded text-xs font-bold">
                  {report.summary.infoCount}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="font-semibold text-slate-200 flex items-center">
            <Zap className="w-4 h-4 mr-2" />
            Recent Issues
          </h4>
          <div className="max-h-40 overflow-y-auto space-y-1">
            {report.results.slice(0, 5).map((issue, index) => (
              <div key={index} className="bg-slate-800 p-2 rounded text-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className={`font-semibold ${
                    issue.severity === 'error' ? 'text-red-300' :
                    issue.severity === 'warning' ? 'text-yellow-300' : 'text-blue-300'
                  }`}>
                    {issue.type.toUpperCase()}
                  </span>
                  <span className={`px-1 py-0.5 rounded text-xs ${
                    issue.severity === 'error' ? 'bg-red-700' :
                    issue.severity === 'warning' ? 'bg-yellow-700' : 'bg-blue-700'
                  }`}>
                    {issue.severity}
                  </span>
                </div>                <div className="text-slate-300">{issue.description}</div>
                {issue.location?.line && (
                  <div className="text-slate-500 mt-1">Line {issue.location.line}</div>
                )}
              </div>
            ))}
          </div>
        </div>        <div className="pt-2 border-t border-slate-700">
          <div className="text-xs text-slate-400 flex items-center">
            <Clock className="w-3 h-3 mr-1" />
            Click on attack vectors to see MITRE ATT&CK TTP mappings
          </div>
        </div></div>
    );
  }  function renderAttackVectorInfo() {
    if (!node) return null;
    
    const { type, count, severity, attackType, mitreData } = node.data as {
      type: string;
      count: number;
      severity: string;
      attackType: string;
      mitreData?: MitreTTP[];
    };
      return (
      <div className="space-y-4">
        <div className="text-center">
          <h4 className="text-xl font-bold text-slate-100 mb-2">{attackType || type.toUpperCase()}</h4>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-slate-800 p-3 rounded">
            <div className="text-2xl font-bold text-slate-100">{count}</div>
            <div className="text-xs text-slate-400">Total Threats</div>
          </div>
          <div className="bg-slate-800 p-3 rounded">
            <div className={`text-2xl font-bold ${
              severity === 'error' ? 'text-red-300' : 'text-yellow-300'
            }`}>
              {severity === 'error' ? 'HIGH' : 'MED'}
            </div>
            <div className="text-xs text-slate-400">Risk Level</div>
          </div>
        </div>

        {/* MITRE ATT&CK TTPs Section */}
        {mitreData && mitreData.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-semibold text-slate-200 flex items-center">
              <Target className="w-4 h-4 mr-2" />
              MITRE ATT&CK TTPs
            </h4>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {mitreData.map((ttp, index) => {
                const IconComponent = ttp.icon;
                return (
                  <div key={index} className="bg-slate-800 p-2 rounded border-l-4" style={{ borderLeftColor: ttp.color }}>
                    <div className="flex items-start space-x-2">
                      <IconComponent className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: ttp.color }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2 mb-1">
                          <span className="text-xs font-bold text-slate-200">{ttp.id}</span>
                          <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${
                            ttp.severity === 'critical' ? 'bg-red-700 text-red-100' :
                            ttp.severity === 'high' ? 'bg-orange-700 text-orange-100' :
                            ttp.severity === 'medium' ? 'bg-blue-700 text-blue-100' : 'bg-green-700 text-green-100'
                          }`}>
                            {ttp.severity.toUpperCase()}
                          </span>
                        </div>
                        <div className="text-xs font-medium text-slate-300 mb-1">{ttp.name}</div>
                        <div className="text-xs text-slate-400 mb-1">{ttp.tactic} • {ttp.technique}</div>
                        <div className="text-xs text-slate-500">{ttp.description}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <h4 className="font-semibold text-slate-200">Attack Vector Type</h4>
          <div className="bg-slate-800 p-3 rounded">
            <div className="text-sm text-slate-300">
              {type === 'security' && 'Direct security vulnerabilities that can be exploited to compromise the workflow'}
              {type === 'dependency' && 'Supply chain risks from external dependencies and packages'}
              {type === 'structure' && 'Architectural weaknesses in workflow design and configuration'}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="font-semibold text-slate-200">Mitigation Priority</h4>
          <div className={`p-3 rounded ${
            severity === 'error' ? 'bg-red-900 border border-red-700' : 'bg-yellow-900 border border-yellow-700'
          }`}>
            <div className={`text-sm ${
              severity === 'error' ? 'text-red-200' : 'text-yellow-200'
            }`}>
              {severity === 'error' 
                ? 'Immediate attention required - Critical security risk'
                : 'Review recommended - Potential vulnerability'
              }
            </div>
          </div>
        </div>

        <div className="pt-2 border-t border-slate-700">
          <div className="text-xs text-slate-400 flex items-center">
            <Clock className="w-3 h-3 mr-1" />
            TTPs mapped to MITRE ATT&CK framework for enhanced threat intelligence
          </div>
        </div>
      </div>
    );
  };const renderThreatLandscapeInfo = () => {
    if (!node) return null;
    
    const { totalThreats, criticalThreats, riskLevel } = node.data as {
      totalThreats: number;
      criticalThreats: number;
      riskLevel: string;
    };
    
    return (
      <div className="space-y-4">
        
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-slate-800 p-3 rounded text-center">
            <div className="text-xl font-bold text-slate-100">{totalThreats}</div>
            <div className="text-xs text-slate-400">Total Threats</div>
          </div>
          <div className="bg-slate-800 p-3 rounded text-center">
            <div className="text-xl font-bold text-red-300">{criticalThreats}</div>
            <div className="text-xs text-slate-400">Critical</div>
          </div>
          <div className="bg-slate-800 p-3 rounded text-center">
            <div className={`text-xl font-bold ${
              riskLevel === 'CRITICAL' ? 'text-red-300' :
              riskLevel === 'HIGH' ? 'text-orange-300' :
              riskLevel === 'MEDIUM' ? 'text-blue-300' : 'text-green-300'
            }`}>
              {riskLevel}
            </div>
            <div className="text-xs text-slate-400">Risk Level</div>
          </div>
        </div>        <div className="space-y-2">
          <h4 className="font-semibold text-slate-200">Security Assessment</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-slate-300">Overall Security Posture</span>
              <span className={`px-2 py-1 rounded text-xs font-bold ${
                riskLevel === 'CRITICAL' ? 'bg-red-700 text-red-100' :
                riskLevel === 'HIGH' ? 'bg-orange-700 text-orange-100' :
                riskLevel === 'MEDIUM' ? 'bg-blue-700 text-blue-100' : 'bg-green-700 text-green-100'
              }`}>
                {riskLevel}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-300">MITRE Framework</span>
              <span className="text-slate-400">ATT&CK Mapped</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-300">Remediation Priority</span>
              <span className="text-slate-400">
                {criticalThreats > 0 ? 'Immediate' : totalThreats > 0 ? 'Standard' : 'Monitor'}
              </span>
            </div>
          </div>
        </div>

        <div className="pt-2 border-t border-slate-700">
          <div className="text-xs text-slate-400 flex items-center">
            <Clock className="w-3 h-3 mr-1" />
            Advanced threat intelligence with MITRE ATT&CK TTPs integration
          </div>
        </div>
      </div>
    );
  };
  return (
    <div className="h-full flex flex-col">
      {/* Panel Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-600 bg-slate-900">
        <h3 className="text-lg font-bold text-slate-100 flex items-center">
          {node.type === 'workflow' && <FileText className="w-5 h-5 mr-2" />}
          {node.type === 'attackVector' && <Target className="w-5 h-5 mr-2" />}
          {node.type === 'threatLandscape' && <Skull className="w-5 h-5 mr-2" />}
          Node Details
        </h3>
        <button 
          onClick={onClose}
          className="text-slate-400 hover:text-slate-200 transition-colors p-1 hover:bg-slate-700 rounded"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      
      {/* Panel Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {node.type === 'workflow' && renderWorkflowInfo()}
        {node.type === 'attackVector' && renderAttackVectorInfo()}
        {node.type === 'threatLandscape' && renderThreatLandscapeInfo()}
      </div>
    </div>
  );
};

// Custom node component for workflow files (with prominent icons)
const WorkflowNode = ({ data }: { data: any }) => {
  const { fileName, errorCount, isSelected, securityIssues } = data;
  
  const getThreatLevel = () => {
    if (securityIssues >= 5) return 'critical';
    if (securityIssues >= 3) return 'high';
    if (securityIssues >= 1) return 'medium';
    return 'low';
  };
  
  const getThreatIcon = (level: string) => {
    switch (level) {
      case 'critical': return Skull;
      case 'high': return Target;
      case 'medium': return Eye;
      default: return Shield;
    }
  };
  
  const getThreatColor = (level: string) => {
    switch (level) {
      case 'critical': return 'bg-red-50 border-red-300 text-red-800';
      case 'high': return 'bg-orange-50 border-orange-300 text-orange-800';
      case 'medium': return 'bg-blue-50 border-blue-300 text-blue-800';
      case 'low': return 'bg-green-50 border-green-300 text-green-800';
      default: return 'bg-gray-50 border-gray-300 text-gray-800';
    }
  };

  const threatLevel = getThreatLevel();
  const ThreatIcon = getThreatIcon(threatLevel);

  return (
    <div className={`relative px-3 py-2 rounded-lg border-2 transition-all ${
      isSelected ? 'ring-2 ring-blue-400 ring-opacity-50' : ''
    } ${getThreatColor(threatLevel)} min-w-[80px] max-w-[80px] shadow-lg hover:shadow-xl cursor-pointer`}>
      <Handle type="target" position={Position.Top} />
      
      <div className="text-center">
        {/* Prominent icon at the top */}
        <div className="flex justify-center mb-2">
          <ThreatIcon className="w-6 h-6" />
        </div>
        
        {/* Compact filename */}
        <div className="font-medium text-xs leading-tight mb-1">
          {fileName.replace('.yml', '').replace('.yaml', '').substring(0, 6)}
          {fileName.length > 6 && '...'}
        </div>
        
        {/* Critical count badge */}
        {errorCount > 0 && (
          <div className="text-xs font-bold bg-red-600 text-white px-1 py-0.5 rounded">
            {errorCount}
          </div>
        )}
      </div>
      
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};

// Custom node component for attack vectors (with prominent icons)
const AttackVectorNode = ({ data }: { data: any }) => {
  const { type, count, severity, mitreData } = data;
  
  const getAttackIcon = (type: string) => {
    switch (type) {
      case 'security': return severity === 'error' ? AlertTriangle : Lock;
      case 'dependency': return Package;
      case 'structure': return Shield;
      default: return AlertCircle;
    }
  };
    const getAttackColor = (severity: string) => {
    if (severity === 'error') {
      return 'bg-red-50 border-red-300 text-red-700';
    }
    return 'bg-yellow-50 border-yellow-300 text-yellow-700';
  };

  const Icon = getAttackIcon(type);
  const primaryTTP = mitreData && mitreData[0];
  return (
    <div className={`px-3 py-2 rounded-lg border-2 ${getAttackColor(severity)} min-w-[70px] max-w-[70px] shadow-lg hover:shadow-xl cursor-pointer relative`}>
      <Handle type="target" position={Position.Top} />
      
      {/* MITRE indicator badge */}
      {primaryTTP && (
        <div className="absolute -top-1 -right-1 w-4 h-4 bg-slate-700 rounded-full flex items-center justify-center">
          <span className="text-xs font-bold text-white leading-none">{primaryTTP.id.charAt(1)}</span>
        </div>
      )}
      
      <div className="text-center">
        {/* Prominent icon */}
        <div className="flex justify-center mb-2">
          <Icon className="w-5 h-5" />
        </div>
        
        {/* Count */}
        <div className="text-sm font-bold">{count}</div>
      </div>
      
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};

// Custom node for the threat landscape overview (with icon)
const ThreatLandscapeNode = ({ data }: { data: any }) => {
  const { totalThreats, criticalThreats } = data;
  
  return (
    <div className="px-4 py-3 rounded-lg border-2 bg-slate-50 border-slate-300 text-slate-800 min-w-[100px] max-w-[100px] shadow-lg">
      <div className="text-center">
        {/* Prominent icon */}
        <div className="flex justify-center mb-2">
          <Crosshair className="w-6 h-6 text-slate-600" />
        </div>
        
        {/* Key stats */}
        <div className="text-xs font-medium mb-1">OVERVIEW</div>
        <div className="text-lg font-bold mb-1">{totalThreats}</div>
        
        {criticalThreats > 0 && (
          <div className="text-xs">
            <span className="font-bold text-red-600">{criticalThreats}</span>
            <span className="text-red-500"> critical</span>
          </div>
        )}
      </div>
    </div>
  );
};

const nodeTypes: NodeTypes = {
  workflow: WorkflowNode,
  attackVector: AttackVectorNode,
  threatLandscape: ThreatLandscapeNode,
};

export default function WorkflowDependencyGraph({ reports }: WorkflowDependencyGraphProps) {
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [selectedReport, setSelectedReport] = useState<AnalysisReport | null>(null);  const [isDetailsPanelActive, setIsDetailsPanelActive] = useState<boolean>(false);
  const [isClosing, setIsClosing] = useState<boolean>(false);

  // Generate nodes and edges for the attack map visualization
  const { initialNodes, initialEdges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
      // Calculate threat metrics
    const totalThreats = reports.reduce((sum, r) => sum + r.summary.totalIssues, 0);
    const criticalThreats = reports.reduce((sum, r) => sum + r.summary.errorCount, 0);
    
    const getRiskLevel = () => {
      if (criticalThreats >= 10) return 'CRITICAL';
      if (criticalThreats >= 5) return 'HIGH';
      if (criticalThreats >= 1) return 'MEDIUM';
      return 'LOW';
    };    // Create workflow target nodes (arranged in cleaner grid for icon-based nodes)
    const gridCols = Math.min(reports.length, 5); // Optimal columns for icon nodes
    const nodeSpacing = 140; // Better spacing for icon-based nodes
    const startX = 120;
    const startY = 100;
    
    reports.forEach((report, index) => {
      const securityIssues = report.results.filter(r => r.type === 'security').length;
      
      // Calculate grid position
      const col = index % gridCols;
      const row = Math.floor(index / gridCols);
      const x = startX + col * nodeSpacing;
      const y = startY + row * nodeSpacing;
      
      nodes.push({
        id: `target-${report.fileId}`,
        type: 'workflow',
        position: { x, y },
        data: {
          fileName: report.fileName,
          score: report.summary.score,
          errorCount: report.summary.errorCount,
          warningCount: report.summary.warningCount,
          infoCount: report.summary.infoCount,
          securityIssues,
          isSelected: false
        }
      });
    });    // Create attack vector nodes (positioned for icon-based layout)
    const attackTypes = [
      { type: 'security', label: 'Security Exploits', x: 180, y: 320 },
      { type: 'dependency', label: 'Supply Chain', x: 320, y: 320 },
      { type: 'structure', label: 'Architecture Flaws', x: 460, y: 320 }
    ];
    
    attackTypes.forEach((attackType) => {
      const issuesOfType = reports.flatMap(report => 
        report.results.filter(result => result.type === attackType.type)
      );
        if (issuesOfType.length > 0) {
        const errorCount = issuesOfType.filter(i => i.severity === 'error').length;
        const severity = errorCount > 0 ? 'error' : 'warning';
          const attackId = `attack-${attackType.type}`;
        
        // Map issues to MITRE ATT&CK TTPs
        const mitreData = mapIssueToMitreTTPs(issuesOfType, attackType.type);
        
        // Add attack vector node with clean positioning
        nodes.push({
          id: attackId,
          type: 'attackVector',
          position: { 
            x: attackType.x, 
            y: attackType.y 
          },
          data: {
            type: attackType.type,
            count: issuesOfType.length,
            severity,
            attackType: attackType.label,
            mitreData
          }
        });
          // Create attack paths to vulnerable targets
        reports.forEach((report) => {
          const vulnerabilities = report.results.filter(result => result.type === attackType.type);
          if (vulnerabilities.length > 0) {
            const criticalVulns = vulnerabilities.filter(v => v.severity === 'error').length;// Simplified attack path edge
            edges.push({
              id: `attack-path-${report.fileId}-${attackType.type}`,
              source: attackId,
              target: `target-${report.fileId}`,
              type: 'straight',
              style: { 
                strokeWidth: criticalVulns > 0 ? 2 : 1,
                stroke: criticalVulns > 0 ? '#EF4444' : '#9CA3AF',
                opacity: 0.5
              },
              markerEnd: {
                type: MarkerType.ArrowClosed,
                color: criticalVulns > 0 ? '#EF4444' : '#9CA3AF',
                width: 12,
                height: 12
              }
            });
          }
        });
      }
    });      // Add threat landscape overview node (positioned for icon-based layout)
    if (reports.length > 0) {
      nodes.push({
        id: 'threat-overview',
        type: 'threatLandscape',
        position: { 
          x: 320, 
          y: 420 
        },
        data: {
          totalThreats,
          criticalThreats,
          riskLevel: getRiskLevel()
        },
        style: {
          background: 'transparent',
          border: 'none'
        }
      });
      
      // Connect attack vectors to threat overview
      attackTypes.forEach((attackType) => {
        const issuesOfType = reports.flatMap(report => 
          report.results.filter(result => result.type === attackType.type)
        );
        
        if (issuesOfType.length > 0) {
          edges.push({
            id: `threat-flow-${attackType.type}`,
            source: `attack-${attackType.type}`,
            target: 'threat-overview',
            type: 'smoothstep',            style: { 
              strokeWidth: 1, 
              stroke: '#9CA3AF', 
              strokeDasharray: '3,3',
              opacity: 0.4
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: '#9CA3AF'
            }
          });
        }
      });
    }
    
    // Add lateral movement edges between high-risk targets
    const highRiskReports = reports.filter(r => r.summary.errorCount > 0);
    if (highRiskReports.length > 1) {
      for (let i = 0; i < highRiskReports.length - 1; i++) {
        const source = highRiskReports[i];
        const target = highRiskReports[i + 1];
        
        edges.push({
          id: `lateral-${source.fileId}-${target.fileId}`,
          source: `target-${source.fileId}`,
          target: `target-${target.fileId}`,
          type: 'straight',
          style: { 
            strokeWidth: 1, 
            stroke: '#EF4444', 
            strokeDasharray: '3,3',
            opacity: 0.7
          },
          label: 'lateral movement',
          labelStyle: { 
            fontSize: 8, 
            fill: '#EF4444',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            padding: '1px 3px',
            borderRadius: '2px'
          }
        });
      }
    }
    
    return { initialNodes: nodes, initialEdges: edges };
  }, [reports]);  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  const onNodeClick = useCallback((_event: any, node: Node) => {
    console.log('Target/Threat clicked:', node);
    
    // Set selected node for info panel
    setSelectedNode(node);
    
    // Find corresponding report for workflow nodes
    if (node.type === 'workflow') {
      const fileId = node.id.replace('target-', '');
      const report = reports.find(r => r.fileId === fileId);
      setSelectedReport(report || null);
    } else {
      setSelectedReport(null);
    }
    
    // Update node selection state for visual feedback
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        data: {
          ...n.data,
          isSelected: n.id === node.id
        }
      }))
    );  }, [setNodes, reports]);  const handleCloseInfoPanel = useCallback(() => {
    setSelectedNode(null);
    setSelectedReport(null);
    setIsDetailsPanelActive(false);
    setIsClosing(false);
    // Clear selection visual state
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        data: {
          ...n.data,
          isSelected: false
        }
      }))
    );
  }, [setNodes]);

  // Auto-close details panel after inactivity
  React.useEffect(() => {
    let inactivityTimer: number;
    let warningTimer: number;
    
    if (selectedNode && !isDetailsPanelActive) {
      // Show warning animation 2 seconds before closing
      warningTimer = window.setTimeout(() => {
        setIsClosing(true);
      }, 8000);
      
      // Close panel after 10 seconds of inactivity
      inactivityTimer = window.setTimeout(() => {
        handleCloseInfoPanel();
      }, 10000);
    } else {
      setIsClosing(false);
    }
    
    return () => {
      if (inactivityTimer) window.clearTimeout(inactivityTimer);
      if (warningTimer) window.clearTimeout(warningTimer);
      setIsClosing(false);
    };
  }, [selectedNode, isDetailsPanelActive, handleCloseInfoPanel]);

  // Handle clicks outside the network view to close panel
  const handlePaneClick = useCallback(() => {
    if (selectedNode) {
      handleCloseInfoPanel();
    }
  }, [selectedNode, handleCloseInfoPanel]);
  // Handle panel interaction to keep it active
  const handlePanelInteraction = useCallback(() => {
    setIsDetailsPanelActive(true);
    setIsClosing(false);
    
    // Reset inactivity after interaction
    window.setTimeout(() => {
      setIsDetailsPanelActive(false);
    }, 2000); // Consider active for 2 seconds after interaction
  }, []);

  if (reports.length === 0) {
    return (
      <div className="bg-gray-900 border border-red-600 rounded-lg p-8 text-center text-red-100">
        <Target className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-red-100 mb-2">No Threat Data Available</h3>
        <p className="text-red-300">Upload workflow files to analyze threat landscape</p>
      </div>
    );
  }  return (
    <div className="bg-gray-900 border border-slate-600 rounded-lg overflow-hidden">      <div className="p-4 border-b border-slate-600 bg-gradient-to-r from-slate-900 to-slate-800">
        <div className="flex items-center">
          <Skull className="w-6 h-6 text-slate-100 mr-3" />
          <div>
            <h3 className="text-lg font-semibold text-slate-100">MITRE ATT&CK Threat Analysis & Attack Surface Map</h3>
            <p className="text-sm text-slate-200 mt-1">
              Interactive visualization with MITRE ATT&CK TTPs mapping for enhanced threat intelligence
            </p>
          </div>
        </div>
      </div>
      
      <div className="flex">
        {/* Main Network View */}
        <div className={`transition-all duration-300 ${selectedNode ? 'w-2/3' : 'w-full'}`} style={{ height: '600px', backgroundColor: '#111827' }}>          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onPaneClick={handlePaneClick}
            nodeTypes={nodeTypes}
            connectionMode={ConnectionMode.Strict}
            elementsSelectable={true}
            nodesConnectable={false}
            nodesDraggable={true}
            fitView
            fitViewOptions={{
              padding: 0.2,
              includeHiddenNodes: false,
              minZoom: 0.1,
              maxZoom: 2
            }}
            defaultViewport={{ x: 0, y: 0, zoom: 0.6 }}
            minZoom={0.1}
            maxZoom={2}
            style={{ backgroundColor: '#111827' }}
            panOnDrag={true}
            panOnScroll={false}
            zoomOnScroll={true}
            zoomOnPinch={true}
            zoomOnDoubleClick={false}
            preventScrolling={false}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#374151" />
            <Controls 
              showZoom={true}
              showFitView={true}
              showInteractive={true}
              position="top-left"
            />
            <MiniMap 
              nodeColor={(node) => {
                if (node.type === 'workflow') {
                  const securityIssues = (node.data?.securityIssues as number) || 0;
                  if (securityIssues >= 5) return '#7F1D1D'; // red
                  if (securityIssues >= 3) return '#C2410C'; // orange
                  if (securityIssues >= 1) return '#1D4ED8'; // blue
                  return '#059669'; // green
                }
                if (node.type === 'attackVector') {
                  const type = node.data?.type;
                  if (type === 'security') return node.data?.severity === 'error' ? '#7F1D1D' : '#C2410C';
                  if (type === 'dependency') return '#7C3AED'; // purple
                  if (type === 'structure') return '#3730A3'; // indigo
                  return '#374151';
                }
                return '#374151';
              }}
              nodeStrokeWidth={2}
              style={{ backgroundColor: '#1F2937' }}
              position="bottom-right"
            />
          </ReactFlow>
        </div>        {/* Side Information Panel */}
        {selectedNode && (
          <div 
            className={`w-1/3 bg-slate-800 border-l border-slate-600 overflow-hidden flex flex-col transition-all duration-300 ${
              isClosing ? 'opacity-60 border-yellow-500' : ''
            }`}
            onMouseEnter={handlePanelInteraction}
            onMouseMove={handlePanelInteraction}
            onClick={handlePanelInteraction}
            onScroll={handlePanelInteraction}
          >
            {isClosing && (
              <div className="bg-yellow-600 text-yellow-100 px-3 py-1 text-xs text-center">
                Panel closing in 2s... (hover to keep open)
              </div>
            )}
            <NodeInfoPanel 
              node={selectedNode} 
              report={selectedReport}
              onClose={handleCloseInfoPanel}
            />
          </div>
        )}
      </div>      <div className="p-4 border-t border-slate-600 bg-gray-800">
        <div className="flex justify-between items-start">
          <div className="text-xs text-slate-200">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="font-semibold mb-2 text-slate-100">Threat Levels:</div>
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <Skull className="w-3 h-3 text-red-400" />
                    <span>Critical (5+ security issues)</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Target className="w-3 h-3 text-orange-400" />
                    <span>High (3-4 security issues)</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Eye className="w-3 h-3 text-blue-400" />
                    <span>Medium (1-2 security issues)</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Shield className="w-3 h-3 text-green-400" />
                    <span>Low (no security issues)</span>
                  </div>
                </div>
              </div>
              <div>
                <div className="font-semibold mb-2 text-slate-100">Attack Vectors:</div>
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-0.5 bg-red-500"></div>
                    <span>Critical exploits (animated)</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-0.5 bg-orange-500"></div>
                    <span>High-risk vulnerabilities</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-0.5 bg-purple-400"></div>
                    <span>Supply chain threats</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-0.5 bg-indigo-400"></div>
                    <span>Architecture weaknesses</span>
                  </div>
                </div>
              </div>
              <div>
                <div className="font-semibold mb-2 text-slate-100">MITRE ATT&CK:</div>
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <Terminal className="w-3 h-3 text-red-400" />
                    <span>T1059 - Command Execution</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Key className="w-3 h-3 text-red-400" />
                    <span>T1078 - Valid Accounts</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Package className="w-3 h-3 text-purple-400" />
                    <span>T1195 - Supply Chain</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <UserX className="w-3 h-3 text-indigo-400" />
                    <span>T1068 - Privilege Escalation</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="text-xs text-slate-400 ml-4">            <div className="bg-slate-800 p-2 rounded border border-slate-600">
              <div className="font-semibold text-slate-300 mb-1">💡 Enhanced Features:</div>
              <div className="space-y-1">
                <div>• Click nodes for MITRE ATT&CK TTP details</div>
                <div>• Drag nodes to rearrange the attack map</div>
                <div>• Real-world threat intelligence mapping</div>
                <div>• Comprehensive security framework analysis</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
