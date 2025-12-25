import { useState, useCallback, useEffect } from 'react';
import { GitBranch, Github, Sparkles } from 'lucide-react';
import FileUpload from './components/FileUpload';
import AnalysisResults from './components/AnalysisResults';
import ThemeToggle from './components/ThemeToggle';
import GitHubStarPopup from './components/GitHubStarPopup';
import EnhancedProgress from './components/EnhancedProgress';
import { ThemeProvider } from './contexts/ThemeContext';
import { WorkflowFile, AnalysisReport } from './types/workflow';
import { parseWorkflowFile } from './utils/yamlParser';
import { analyzeWorkflow } from './utils/workflowAnalyzer';

function App() {
  const [workflowFiles, setWorkflowFiles] = useState<WorkflowFile[]>([]);
  const [analysisReports, setAnalysisReports] = useState<AnalysisReport[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState({ current: 0, total: 0 });
  const [currentFileName, setCurrentFileName] = useState<string>('');
  const [analysisStage, setAnalysisStage] = useState<'parsing' | 'analyzing' | 'complete'>('parsing');
  const [showStarPopup, setShowStarPopup] = useState(false);
  const [hasScrolled, setHasScrolled] = useState(false);

  // Handle scroll detection for star popup
  useEffect(() => {
    if (analysisReports.length === 0 || hasScrolled) return;

    const handleScroll = () => {
      // Check if user has scrolled down at least 300px
      if (window.scrollY > 300) {
        setHasScrolled(true);
        
        // Check if popup should be shown (not already starred or dismissed)
        const hasStarred = localStorage.getItem('flowlyt-cli-starred');
        const hasDismissed = sessionStorage.getItem('flowlyt-star-dismissed');
        
        if (!hasStarred && !hasDismissed) {
          // Show popup after a small delay
          setTimeout(() => {
            setShowStarPopup(true);
          }, 500);
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [analysisReports.length, hasScrolled]);

  const handleFilesUploaded = useCallback(async (files: WorkflowFile[]) => {
    setIsAnalyzing(true);
    setAnalysisStage('parsing');
    setAnalysisProgress({ current: 0, total: files.length });
    setWorkflowFiles([]);
    setAnalysisReports([]);

    try {
      const allParsedFiles: WorkflowFile[] = [];
      const batchSize = 3;

      // Parsing stage
      for (let i = 0; i < files.length; i += batchSize) {
        const batch = files.slice(i, i + batchSize);
        const parsedBatch = await Promise.all(batch.map(async (file) => {
          setCurrentFileName(file.name);
          return new Promise<WorkflowFile>((resolve) => {
            setTimeout(() => resolve(parseWorkflowFile(file)), 0);
          });
        }));

        allParsedFiles.push(...parsedBatch);
        setWorkflowFiles([...allParsedFiles]);

        if (i + batchSize < files.length) await new Promise(r => setTimeout(r, 10));
      }

      // Analysis stage
      setAnalysisStage('analyzing');
      const allReports: AnalysisReport[] = [];
      for (let i = 0; i < allParsedFiles.length; i += batchSize) {
        const batch = allParsedFiles.slice(i, i + batchSize);
        const analyzedBatch = await Promise.all(batch.map(async (file) => {
          setCurrentFileName(file.name);
          return new Promise<AnalysisReport>((resolve) => {
            setTimeout(() => resolve(analyzeWorkflow(file)), 0);
          });
        }));

        allReports.push(...analyzedBatch);
        setAnalysisReports([...allReports]);
        setAnalysisProgress(prev => ({ current: Math.min(prev.current + analyzedBatch.length, prev.total), total: prev.total }));

        if (i + batchSize < allParsedFiles.length) await new Promise(r => setTimeout(r, 10));
      }
      
      setAnalysisStage('complete');
    } catch (err) {
      console.error(err);
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
    setShowStarPopup(false);
    setHasScrolled(false);
  }, []);

  return (
    <ThemeProvider>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-purple-900 dark:to-rose-900 transition-colors duration-300 overflow-x-hidden">
        <header className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border-b border-white/20 dark:border-purple-800/20 sticky top-0 z-50 transition-colors duration-300">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center space-x-3 min-w-0 flex-1">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center">
                    <GitBranch className="w-4 h-4 sm:w-6 sm:h-6 text-white" />
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <h1 className="text-lg sm:text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">Flowlyt</h1>
                  <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 hidden sm:block transition-colors duration-300 truncate">CI/CD Pipeline Analyzer</p>
                </div>
              </div>

              <div className="flex items-center space-x-2 sm:space-x-4 flex-shrink-0">
                <div className="hidden md:flex items-center space-x-2 text-xs sm:text-sm text-gray-600 dark:text-gray-400 transition-colors duration-300">
                  <Sparkles className="w-3 h-3 sm:w-4 sm:h-4 text-yellow-500" />
                  <span className="hidden lg:inline">Free & Client-Side</span>
                </div>
                <ThemeToggle />
                <a href="https://github.com/harekrishnarai/flowlyt" target="_blank" rel="noopener noreferrer" className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors p-1" aria-label="GitHub Repository">
                  <Github className="w-5 h-5 sm:w-6 sm:h-6" />
                </a>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
          {analysisReports.length === 0 ? (
            <div className="max-w-4xl mx-auto">
              <div className="text-center mb-8 sm:mb-12">
                <div className="mb-6">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <GitBranch className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
                  </div>

                  <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 dark:text-gray-100 mb-4 transition-colors duration-300 px-4">
                    Secure Your
                    <span className="block bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">CI/CD Pipelines</span>
                  </h1>

                  <p className="text-lg sm:text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto leading-relaxed transition-colors duration-300 px-4">
                    Upload CI/CD files or extract from GitHub/GitLab repositories to get comprehensive analysis for security, performance, best practices, and more. Everything runs in your browser.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-8 sm:mb-12 px-2 sm:px-0">
                  {[
                    { icon: '🔒', title: 'Security Analysis', description: 'Detect hardcoded secrets, unsafe actions, and permission issues' },
                    { icon: '⚡', title: 'Performance Check', description: 'Find inefficiencies, missing caching, and optimization opportunities' },
                    { icon: '✅', title: 'Best Practices', description: 'Ensure proper naming, documentation, and error handling' },
                    { icon: '📦', title: 'Dependency Audit', description: 'Check for outdated actions and security vulnerabilities' },
                    { icon: '🏗️', title: 'Structure Review', description: 'Analyze workflow complexity and job dependencies' },
                    { icon: '🎯', title: 'Smart Scoring', description: 'Get an overall score and prioritized recommendations' }
                  ].map((feature, index) => (
                    <div key={index} className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm border border-white/20 dark:border-purple-700/20 rounded-xl p-4 sm:p-6 hover:bg-white/80 dark:hover:bg-slate-800/80 transition-all duration-200 hover:scale-105">
                      <div className="text-xl sm:text-2xl mb-2 sm:mb-3">{feature.icon}</div>
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2 transition-colors duration-300 text-sm sm:text-base">{feature.title}</h3>
                      <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 transition-colors duration-300">{feature.description}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Real-world Supply Chain Incidents */}
              <div className="mb-6 sm:mb-10 px-2 sm:px-0">
                <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-3">Real-world Supply Chain Incidents</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <a href="https://www.stepsecurity.io/blog/harden-runner-detection-tj-actions-changed-files-action-is-compromised" target="_blank" rel="noopener noreferrer" className="block bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm border border-white/10 dark:border-purple-800/20 rounded-lg p-3 hover:shadow-lg transition-shadow duration-200">
                    <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100">tj-actions/changed-files compromise</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-500 mb-1">March 15, 2025</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">The tj-actions/changed-files Action was retroactively updated to a malicious commit that exposed CI/CD secrets in logs. This incident shows the danger of unverified action tags and compromised maintainer tokens.</p>
                  </a>

                  <a href="https://www.stepsecurity.io/blog/grafana-github-actions-security-incident" target="_blank" rel="noopener noreferrer" className="block bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm border border-white/10 dark:border-purple-800/20 rounded-lg p-3 hover:shadow-lg transition-shadow duration-200">
                    <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100">Grafana GitHub Actions incident</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-500 mb-1">April 26, 2025</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">An unauthorized user leveraged a vulnerability in a Grafana CI workflow, leading to exposure of a small number of secrets. Immediate detection and response limited the impact.</p>
                  </a>

                  <a href="https://blog.harekrishnarai.me/the-nx-supply-chain-attack-when-ai-becomes-an-accomplice-attackers" target="_blank" rel="noopener noreferrer" className="block bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm border border-white/10 dark:border-purple-800/20 rounded-lg p-3 hover:shadow-lg transition-shadow duration-200">
                    <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100">The Nx Supply Chain Attack</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-500 mb-1">August 28, 2025</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">A detailed analysis of how AI tools became unwitting accomplices in a sophisticated supply chain attack targeting the Nx ecosystem, highlighting the emerging risks of AI-assisted development.</p>
                  </a>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-3">These incidents illustrate how misconfigured workflows, compromised actions, and leaked credentials can lead to supply chain breaches. Use Flowlyt to detect risky patterns and harden your CI/CD pipelines.</p>
              </div>

              {/* Upload Section */}
              <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm border border-white/20 dark:border-purple-700/20 rounded-2xl p-4 sm:p-6 lg:p-8 transition-all duration-300 mx-2 sm:mx-0">
                <FileUpload onFilesUploaded={handleFilesUploaded} uploadedFiles={workflowFiles} onRemoveFile={handleRemoveFile} />

                {isAnalyzing && (
                  <EnhancedProgress 
                    current={analysisProgress.current}
                    total={analysisProgress.total}
                    currentFileName={currentFileName}
                    stage={analysisStage}
                  />
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm border border-white/20 dark:border-purple-700/20 rounded-2xl p-4 sm:p-6 lg:p-8 transition-all duration-300 mx-2 sm:mx-0">
              <AnalysisResults reports={analysisReports} workflowFiles={workflowFiles} onExport={() => {}} onNewAnalysis={handleNewAnalysis} />
            </div>
          )}
        </main>

        <footer className="mt-8 sm:mt-16 py-6 sm:py-8 border-t border-white/20 dark:border-purple-800/20 transition-colors duration-300">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center text-xs sm:text-sm text-gray-600 dark:text-gray-400 transition-colors duration-300">
              <p className="px-4">Built with ❤️ for the CI/CD community. <span className="block sm:inline sm:ml-2">All analysis happens in your browser - no data is sent to any server.</span></p>
              <p className="mt-2">
                <a href="https://github.com/harekrishnarai/flowlyt" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors">View on GitHub</a>
              </p>
            </div>
          </div>
        </footer>

        {/* GitHub Star Popup */}
        <GitHubStarPopup show={showStarPopup} onClose={() => setShowStarPopup(false)} />
      </div>
    </ThemeProvider>
  );
}

export default App;