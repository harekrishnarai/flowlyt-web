import { useState, useCallback } from 'react';
import { GitBranch, Github, Sparkles } from 'lucide-react';
import FileUpload from './components/FileUpload';
import AnalysisResults from './components/AnalysisResults';
import ThemeToggle from './components/ThemeToggle';
import { ThemeProvider } from './contexts/ThemeContext';
import { WorkflowFile, AnalysisReport } from './types/workflow';
import { parseWorkflowFile } from './utils/yamlParser';
import { analyzeWorkflow } from './utils/workflowAnalyzer';

function App() {
  const [workflowFiles, setWorkflowFiles] = useState<WorkflowFile[]>([]);
  const [analysisReports, setAnalysisReports] = useState<AnalysisReport[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState({ current: 0, total: 0 });

  const handleFilesUploaded = useCallback(async (files: WorkflowFile[]) => {
    console.log('🚀 Processing files:', files.length, files.map(f => f.name));
    
    setIsAnalyzing(true);
    setAnalysisProgress({ current: 0, total: files.length });
    
    // Clear previous results to start fresh
    setWorkflowFiles([]);
    setAnalysisReports([]);
    
    try {
      // Parse files asynchronously in batches
      const allParsedFiles: WorkflowFile[] = [];
      const batchSize = 3; // Process 3 files at a time
      
      for (let i = 0; i < files.length; i += batchSize) {
        const batch = files.slice(i, i + batchSize);
        console.log(`📝 Processing batch ${Math.floor(i/batchSize) + 1}:`, batch.map(f => f.name));
        
        // Parse batch with a small delay to prevent blocking
        const parsedBatch = await Promise.all(
          batch.map(async (file) => {
            return new Promise<WorkflowFile>((resolve) => {
              // Use setTimeout to yield control back to the event loop
              setTimeout(() => {
                const parsed = parseWorkflowFile(file);
                console.log('✅ Parsed file:', parsed.name, 'Success:', !!parsed.parsed);
                resolve(parsed);
              }, 0);
            });
          })
        );
        
        allParsedFiles.push(...parsedBatch);
        console.log('📊 Total parsed so far:', allParsedFiles.length);
        
        // Update UI with all parsed files so far
        setWorkflowFiles([...allParsedFiles]);
        
        // Small delay between batches to keep UI responsive
        if (i + batchSize < files.length) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
      
      console.log('📝 Final parsed files count:', allParsedFiles.length);
      
      // Analyze files asynchronously in batches
      const allReports: AnalysisReport[] = [];
      
      for (let i = 0; i < allParsedFiles.length; i += batchSize) {
        const batch = allParsedFiles.slice(i, i + batchSize);
        console.log(`🔍 Analyzing batch ${Math.floor(i/batchSize) + 1}:`, batch.map(f => f.name));
        
        // Analyze batch with a small delay to prevent blocking
        const analyzedBatch = await Promise.all(
          batch.map(async (file) => {
            return new Promise<AnalysisReport>((resolve) => {
              // Use setTimeout to yield control back to the event loop
              setTimeout(() => {
                const report = analyzeWorkflow(file);
                console.log('🔍 Analyzed file:', file.name, 'Issues:', report.summary.totalIssues);
                
                // Update progress
                setAnalysisProgress(prev => ({ 
                  current: Math.min(prev.current + 1, prev.total), 
                  total: prev.total 
                }));
                
                resolve(report);
              }, 0);
            });
          })
        );
        
        allReports.push(...analyzedBatch);
        console.log('📊 Total reports so far:', allReports.length);
        
        // Update UI with all analysis results so far
        setAnalysisReports([...allReports]);
        
        // Small delay between batches to keep UI responsive
        if (i + batchSize < allParsedFiles.length) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
      
      console.log('✅ Final analysis complete:', allReports.length, 'reports');
      
    } catch (error) {
      console.error('❌ Error processing files:', error);
    } finally {
      setIsAnalyzing(false);
      setAnalysisProgress({ current: 0, total: 0 });
    }
  }, []);

  const handleRemoveFile = useCallback((fileId: string) => {
    setWorkflowFiles(prev => prev.filter(f => f.id !== fileId));
    setAnalysisReports(prev => prev.filter(r => r.fileId !== fileId));
  }, []);

  const handleNewAnalysis = useCallback(() => {
    setWorkflowFiles([]);
    setAnalysisReports([]);
    setIsAnalyzing(false);
    setAnalysisProgress({ current: 0, total: 0 });
  }, []);

  return (
    <ThemeProvider>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-gray-900 dark:via-blue-900 dark:to-indigo-900 transition-colors duration-300 overflow-x-hidden">
        {/* Header */}
        <header className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border-b border-white/20 dark:border-gray-700/20 sticky top-0 z-50 transition-colors duration-300">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center space-x-3 min-w-0 flex-1">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center">
                    <GitBranch className="w-4 h-4 sm:w-6 sm:h-6 text-white" />
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <h1 className="text-lg sm:text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                    Flowlyt
                  </h1>
                  <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 hidden sm:block transition-colors duration-300 truncate">
                    GitHub Actions Workflow Analyzer
                  </p>
                </div>
              </div>
              
              <div className="flex items-center space-x-2 sm:space-x-4 flex-shrink-0">
                <div className="hidden md:flex items-center space-x-2 text-xs sm:text-sm text-gray-600 dark:text-gray-400 transition-colors duration-300">
                  <Sparkles className="w-3 h-3 sm:w-4 sm:h-4 text-yellow-500" />
                  <span className="hidden lg:inline">Free & Client-Side</span>
                </div>
                <ThemeToggle />
                <a
                  href="https://github.com/harekrishnarai/flowlyt"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors p-1"
                  aria-label="GitHub Repository"
                >
                  <Github className="w-5 h-5 sm:w-6 sm:h-6" />
                </a>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
          {analysisReports.length === 0 ? (
            <div className="max-w-4xl mx-auto">
              {/* Hero Section */}
              <div className="text-center mb-8 sm:mb-12">
                <div className="mb-6">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <GitBranch className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
                  </div>
                  
                  <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 dark:text-gray-100 mb-4 transition-colors duration-300 px-4">
                    Analyze Your
                    <span className="block bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                      GitHub Actions
                    </span>
                  </h1>
                  
                  <p className="text-lg sm:text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto leading-relaxed transition-colors duration-300 px-4">
                    Upload workflow files or extract from GitHub repositories to get comprehensive analysis for security, performance, 
                    best practices, and more. Everything runs in your browser.
                  </p>
                </div>

                {/* Features Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-8 sm:mb-12 px-2 sm:px-0">
                  {[
                    {
                      icon: '🔒',
                      title: 'Security Analysis',
                      description: 'Detect hardcoded secrets, unsafe actions, and permission issues'
                    },
                    {
                      icon: '⚡',
                      title: 'Performance Check',
                      description: 'Find inefficiencies, missing caching, and optimization opportunities'
                    },
                    {
                      icon: '✅',
                      title: 'Best Practices',
                      description: 'Ensure proper naming, documentation, and error handling'
                    },
                    {
                      icon: '📦',
                      title: 'Dependency Audit',
                      description: 'Check for outdated actions and security vulnerabilities'
                    },
                    {
                      icon: '🏗️',
                      title: 'Structure Review',
                      description: 'Analyze workflow complexity and job dependencies'
                    },
                    {
                      icon: '🎯',
                      title: 'Smart Scoring',
                      description: 'Get an overall score and prioritized recommendations'
                    }
                  ].map((feature, index) => (
                    <div
                      key={index}
                      className="bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm border border-white/20 dark:border-gray-700/20 rounded-xl p-4 sm:p-6 hover:bg-white/80 dark:hover:bg-gray-800/80 transition-all duration-200 hover:scale-105"
                    >
                      <div className="text-xl sm:text-2xl mb-2 sm:mb-3">{feature.icon}</div>
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2 transition-colors duration-300 text-sm sm:text-base">{feature.title}</h3>
                      <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 transition-colors duration-300">{feature.description}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Upload Section */}
              <div className="bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm border border-white/20 dark:border-gray-700/20 rounded-2xl p-4 sm:p-6 lg:p-8 transition-all duration-300 mx-2 sm:mx-0">
                <FileUpload
                  onFilesUploaded={handleFilesUploaded}
                  uploadedFiles={workflowFiles}
                  onRemoveFile={handleRemoveFile}
                />
                
                {isAnalyzing && (
                  <div className="mt-6 text-center">
                    <div className="inline-flex items-center space-x-2 text-blue-600 dark:text-blue-400 transition-colors duration-300">
                      <div className="animate-spin rounded-full h-4 w-4 sm:h-5 sm:w-5 border-2 border-blue-600 dark:border-blue-400 border-t-transparent"></div>
                      <span className="font-medium text-sm sm:text-base">
                        {analysisProgress.total > 0 
                          ? `Analyzing workflows... (${analysisProgress.current}/${analysisProgress.total})`
                          : 'Analyzing workflows...'
                        }
                      </span>
                    </div>
                    {analysisProgress.total > 0 && (
                      <div className="mt-3 w-full max-w-md mx-auto px-4 sm:px-0">
                        <div className="bg-gray-200 dark:bg-gray-700 rounded-full h-2 transition-colors duration-300">
                          <div 
                            className="bg-blue-600 dark:bg-blue-400 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${(analysisProgress.current / analysisProgress.total) * 100}%` }}
                          ></div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm border border-white/20 dark:border-gray-700/20 rounded-2xl p-4 sm:p-6 lg:p-8 transition-all duration-300 mx-2 sm:mx-0">
              <AnalysisResults
                reports={analysisReports}
                workflowFiles={workflowFiles}
                onExport={() => {}}
                onNewAnalysis={handleNewAnalysis}
              />
            </div>
          )}
        </main>

      {/* Footer */}
      <footer className="mt-8 sm:mt-16 py-6 sm:py-8 border-t border-white/20 dark:border-gray-700/20 transition-colors duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center text-xs sm:text-sm text-gray-600 dark:text-gray-400 transition-colors duration-300">
            <p className="px-4">
              Built with ❤️ for the GitHub Actions community. 
              <span className="block sm:inline sm:ml-2">All analysis happens in your browser - no data is sent to any server.</span>
            </p>
            <p className="mt-2">
              <a 
                href="https://github.com/harekrishnarai/flowlyt" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors"
              >
                View on GitHub
              </a>
            </p>
          </div>
        </div>
      </footer>
    </div>
    </ThemeProvider>
  );
}

export default App;