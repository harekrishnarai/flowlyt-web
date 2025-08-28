import React, { useMemo, useState } from 'react';
import { AnalysisReport } from '../../types/workflow';
import { 
  Globe, 
  ExternalLink, 
  Search, 
  Filter,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Info,
  Download,
  Server,
  Lock,
  Unlock,
  Package
} from 'lucide-react';

interface NetworkEndpointsViewProps {
  reports: AnalysisReport[];
}

interface NetworkEndpoint {
  url: string;
  method: string;
  type: 'download' | 'api' | 'webhook' | 'registry' | 'unknown';
  workflow: string;
  step: string;
  line: number;
  context: string;
  risk: 'low' | 'medium' | 'high';
  isSecure: boolean;
}

const extractNetworkEndpoints = (reports: AnalysisReport[]): NetworkEndpoint[] => {
  const endpoints: NetworkEndpoint[] = [];
  
  // Enhanced URL patterns for better detection
  const urlPatterns = [
    // HTTP/HTTPS URLs
    /https?:\/\/[^\s'"<>|\[\]{}]+/gi,
    // GitHub raw content
    /raw\.githubusercontent\.com\/[^\s'"<>|\[\]{}]+/gi,
    // Package registries
    /registry\.npmjs\.org\/[^\s'"<>|\[\]{}]+/gi,
    /pypi\.org\/[^\s'"<>|\[\]{}]+/gi,
    // Docker registries
    /docker\.io\/[^\s'"<>|\[\]{}]+/gi,
    /ghcr\.io\/[^\s'"<>|\[\]{}]+/gi,
    // API endpoints in environment variables
    /\$\{[^}]*URL[^}]*\}/gi,
    /\$\{[^}]*ENDPOINT[^}]*\}/gi,
  ];

  const commandPatterns = [
    { pattern: /curl\s+[^|&\n]*https?:\/\/[^\s'"<>]+/gi, method: 'GET', type: 'download' as const },
    { pattern: /wget\s+[^|&\n]*https?:\/\/[^\s'"<>]+/gi, method: 'GET', type: 'download' as const },
    { pattern: /curl\s+.*-X\s+POST[^|&\n]*https?:\/\/[^\s'"<>]+/gi, method: 'POST', type: 'api' as const },
    { pattern: /curl\s+.*--data[^|&\n]*https?:\/\/[^\s'"<>]+/gi, method: 'POST', type: 'api' as const },
    { pattern: /npm\s+publish[^|&\n]*/gi, method: 'POST', type: 'registry' as const },
    { pattern: /docker\s+push[^|&\n]*/gi, method: 'POST', type: 'registry' as const },
  ];

  reports.forEach(report => {
    // Extract from analysis results that contain code snippets
    report.results.forEach(result => {
      if (result.codeSnippet?.content) {
        const content = result.codeSnippet.content;
        const lines = content.split('\n');

        lines.forEach((line: string, lineIndex: number) => {
          // Extract URLs from the line
          urlPatterns.forEach(pattern => {
            const matches = line.match(pattern);
            if (matches) {
              matches.forEach((url: string) => {
                // Clean up the URL
                const cleanUrl = url.replace(/['"<>\]\[{}]+$/, '');
                
                // Determine method from command context
                let method = 'GET';
                let type: NetworkEndpoint['type'] = 'unknown';
                
                if (
                  line.includes('-X POST') || 
                  line.includes('--data') || 
                  line.includes('-d ') ||
                  line.includes('-F ') ||
                  line.includes('--form')
                ) {
                  method = 'POST';
                } else if (line.includes('-X PUT')) {
                  method = 'PUT';
                } else if (line.includes('-X DELETE')) {
                  method = 'DELETE';
                }
                
                // Check command context
                commandPatterns.forEach(cmdPattern => {
                  if (cmdPattern.pattern.test(line)) {
                    type = cmdPattern.type;
                    method = cmdPattern.method;
                  }
                });

                // Enhanced categorization by URL patterns and context
                if (
                  cleanUrl.includes('raw.githubusercontent.com') || 
                  cleanUrl.includes('github.com') && cleanUrl.includes('/releases/') ||
                  cleanUrl.includes('download') ||
                  line.includes('| bash') || line.includes('| sh')
                ) {
                  type = 'download';
                } else if (
                  cleanUrl.includes('registry.npmjs.org') || 
                  cleanUrl.includes('pypi.org') || 
                  cleanUrl.includes('docker.io') ||
                  cleanUrl.includes('ghcr.io')
                ) {
                  type = 'registry';
                } else if (
                  cleanUrl.includes('/api/') || 
                  cleanUrl.includes('collect') ||
                  cleanUrl.includes('exfil') ||
                  method === 'POST' ||
                  line.includes('-X POST') ||
                  line.includes('--data')
                ) {
                  type = 'api';
                } else if (
                  cleanUrl.includes('/webhook') ||
                  cleanUrl.includes('webhook.site') ||
                  cleanUrl.includes('callback') ||
                  cleanUrl.includes('ngrok.io')
                ) {
                  type = 'webhook';
                }

                // Determine risk level with enhanced security patterns
                let risk: NetworkEndpoint['risk'] = 'low';
                
                // High risk patterns
                if (!cleanUrl.startsWith('https://')) {
                  risk = 'high'; // HTTP is always high risk
                } else if (
                  // File upload services
                  cleanUrl.includes('paste.bin.io') ||
                  cleanUrl.includes('pastebin.com') ||
                  cleanUrl.includes('hastebin.com') ||
                  // Remote script execution
                  line.includes('| bash') || line.includes('| sh') ||
                  // Direct data exfiltration patterns
                  cleanUrl.includes('collect') ||
                  cleanUrl.includes('exfil') ||
                  cleanUrl.includes('webhook.site') ||
                  // Tunneling services
                  cleanUrl.includes('ngrok') ||
                  // Suspicious domains
                  cleanUrl.includes('malicious') ||
                  cleanUrl.includes('attacker') ||
                  // Private/local IPs
                  /192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\./.test(cleanUrl)
                ) {
                  risk = 'high';
                } else if (
                  // Medium risk patterns
                  cleanUrl.includes('raw.githubusercontent.com') && !cleanUrl.includes('github.com/' + report.fileName.split('/')[0]) ||
                  type === 'api' ||
                  // Environment variable usage in URLs
                  line.includes('$') && (line.includes('SECRET') || line.includes('TOKEN') || line.includes('KEY'))
                ) {
                  risk = 'medium';
                }

                endpoints.push({
                  url: cleanUrl,
                  method,
                  type,
                  workflow: report.fileName,
                  step: result.title || 'Unknown',
                  line: (result.codeSnippet?.startLine || 0) + lineIndex,
                  context: line.trim(),
                  risk,
                  isSecure: cleanUrl.startsWith('https://')
                });
              });
            }
          });
        });
      }

      // Also check the description and other text fields
      const allText = [result.description, result.title, result.suggestion].join(' ');
      urlPatterns.forEach(pattern => {
        const matches = allText.match(pattern);
        if (matches) {
          matches.forEach((url: string) => {
            const cleanUrl = url.replace(/['"<>\]\[{}]+$/, '');
            if (cleanUrl.length > 10) { // Valid URL length check
              // Enhanced risk assessment for description-based endpoints
              let risk: NetworkEndpoint['risk'] = 'low';
              if (!cleanUrl.startsWith('https://')) {
                risk = 'high';
              } else if (
                cleanUrl.includes('webhook.site') ||
                cleanUrl.includes('ngrok.io') ||
                cleanUrl.includes('malicious') ||
                cleanUrl.includes('exfil') ||
                cleanUrl.includes('collect') ||
                cleanUrl.includes('callback')
              ) {
                risk = 'high';
              } else if (cleanUrl.includes('webhook') || cleanUrl.includes('/api/')) {
                risk = 'medium';
              }

              endpoints.push({
                url: cleanUrl,
                method: 'GET',
                type: 'unknown',
                workflow: report.fileName,
                step: result.title,
                line: 0,
                context: result.description,
                risk,
                isSecure: cleanUrl.startsWith('https://')
              });
            }
          });
        }
      });
    });
  });

  // Remove duplicates
  const uniqueEndpoints = endpoints.filter((endpoint, index, self) => 
    index === self.findIndex(e => e.url === endpoint.url && e.workflow === endpoint.workflow)
  );

  return uniqueEndpoints;
};

export default function NetworkEndpointsView({ reports }: NetworkEndpointsViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | NetworkEndpoint['type']>('all');
  const [filterRisk, setFilterRisk] = useState<'all' | NetworkEndpoint['risk']>('all');

  const endpoints = useMemo(() => extractNetworkEndpoints(reports), [reports]);

  const filteredEndpoints = useMemo(() => {
    return endpoints.filter(endpoint => {
      const matchesSearch = endpoint.url.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           endpoint.workflow.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           endpoint.step.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesType = filterType === 'all' || endpoint.type === filterType;
      const matchesRisk = filterRisk === 'all' || endpoint.risk === filterRisk;
      
      return matchesSearch && matchesType && matchesRisk;
    });
  }, [endpoints, searchTerm, filterType, filterRisk]);

  const stats = useMemo(() => {
    const total = endpoints.length;
    const secure = endpoints.filter(e => e.isSecure).length;
    const byRisk = {
      high: endpoints.filter(e => e.risk === 'high').length,
      medium: endpoints.filter(e => e.risk === 'medium').length,
      low: endpoints.filter(e => e.risk === 'low').length,
    };
    const byType = {
      download: endpoints.filter(e => e.type === 'download').length,
      api: endpoints.filter(e => e.type === 'api').length,
      registry: endpoints.filter(e => e.type === 'registry').length,
      webhook: endpoints.filter(e => e.type === 'webhook').length,
      unknown: endpoints.filter(e => e.type === 'unknown').length,
    };

    return { total, secure, byRisk, byType };
  }, [endpoints]);

  if (endpoints.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <Globe className="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
        <h3 className="text-lg font-medium mb-2 text-gray-700 dark:text-gray-300">No Network Endpoints Found</h3>
        <p className="text-sm">No HTTP/HTTPS endpoints detected in the uploaded workflow files.</p>
      </div>
    );
  }

  const getTypeIcon = (type: NetworkEndpoint['type']) => {
    switch (type) {
      case 'download': return <Download className="w-4 h-4" />;
      case 'api': return <Server className="w-4 h-4" />;
      case 'registry': return <Package className="w-4 h-4" />;
      case 'webhook': return <ExternalLink className="w-4 h-4" />;
      default: return <Globe className="w-4 h-4" />;
    }
  };

  const getRiskIcon = (risk: NetworkEndpoint['risk']) => {
    switch (risk) {
      case 'high': return <XCircle className="w-4 h-4 text-red-500" />;
      case 'medium': return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case 'low': return <CheckCircle className="w-4 h-4 text-green-500" />;
      default: return <Info className="w-4 h-4 text-blue-500" />;
    }
  };

  const getRiskColor = (risk: NetworkEndpoint['risk']) => {
    switch (risk) {
      case 'high': return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
      case 'medium': return 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800';
      case 'low': return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800';
      default: return 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700';
    }
  };

  return (
    <div className="space-y-6">
      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Total Endpoints</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.total}</p>
            </div>
            <Globe className="w-8 h-8 text-blue-500" />
          </div>
        </div>
        
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Secure (HTTPS)</p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.secure}</p>
            </div>
            <Lock className="w-8 h-8 text-green-500" />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">High Risk</p>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.byRisk.high}</p>
            </div>
            <XCircle className="w-8 h-8 text-red-500" />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">API Calls</p>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.byType.api}</p>
            </div>
            <Server className="w-8 h-8 text-blue-500" />
          </div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search endpoints, workflows, or steps..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
          
          <div className="flex gap-2">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Types</option>
              <option value="download">Downloads</option>
              <option value="api">API Calls</option>
              <option value="registry">Registries</option>
              <option value="webhook">Webhooks</option>
              <option value="unknown">Unknown</option>
            </select>
            
            <select
              value={filterRisk}
              onChange={(e) => setFilterRisk(e.target.value as any)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Risk Levels</option>
              <option value="high">High Risk</option>
              <option value="medium">Medium Risk</option>
              <option value="low">Low Risk</option>
            </select>
          </div>
        </div>
      </div>

      {/* Endpoints List */}
      <div className="space-y-3">
        {filteredEndpoints.map((endpoint, index) => (
          <div
            key={index}
            className={`p-4 rounded-lg border ${getRiskColor(endpoint.risk)} transition-all duration-200 hover:shadow-md`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  {getTypeIcon(endpoint.type)}
                  <span className="text-xs uppercase font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                    {endpoint.type}
                  </span>
                  <span className="text-xs uppercase font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                    {endpoint.method}
                  </span>
                  {endpoint.isSecure ? (
                    <div title="Secure (HTTPS)">
                      <Lock className="w-4 h-4 text-green-500" />
                    </div>
                  ) : (
                    <div title="Insecure (HTTP)">
                      <Unlock className="w-4 h-4 text-red-500" />
                    </div>
                  )}
                </div>
                
                <div className="mb-2">
                  <a
                    href={endpoint.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 hover:underline break-all font-mono text-sm"
                  >
                    {endpoint.url}
                  </a>
                </div>
                
                <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <p><strong>Workflow:</strong> {endpoint.workflow}</p>
                  <p><strong>Step:</strong> {endpoint.step}</p>
                  <p><strong>Line:</strong> {endpoint.line}</p>
                  <p><strong>Context:</strong> <code className="bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded text-xs">{endpoint.context}</code></p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                {getRiskIcon(endpoint.risk)}
                <span className="text-xs uppercase font-medium">
                  {endpoint.risk} risk
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredEndpoints.length === 0 && endpoints.length > 0 && (
        <div className="p-8 text-center text-gray-500 dark:text-gray-400">
          <Filter className="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
          <h3 className="text-lg font-medium mb-2">No Matching Endpoints</h3>
          <p className="text-sm">Try adjusting your search term or filters.</p>
        </div>
      )}
    </div>
  );
}
