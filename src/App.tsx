import { useState, useCallback, useEffect } from 'react';
import { GitBranch, Github, Sparkles, Star, X, Shield, ExternalLink } from 'lucide-react';
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
  const [scrollY, setScrollY] = useState(0);
  const [showStarBanner, setShowStarBanner] = useState(() => {
    const dismissed = localStorage.getItem('flowlyt-star-banner-dismissed');
    return !dismissed;
  });

  // Handle scroll for parallax and popup
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      setScrollY(currentScrollY);

      // Star popup logic
      if (analysisReports.length > 0 && !hasScrolled && currentScrollY > 300) {
        setHasScrolled(true);
        
        const hasStarred = localStorage.getItem('flowlyt-cli-starred');
        const hasDismissed = sessionStorage.getItem('flowlyt-star-dismissed');
        
        if (!hasStarred && !hasDismissed) {
          setTimeout(() => {
            setShowStarPopup(true);
          }, 500);
        }
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
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
    // Clear the dismiss flag so popup can show on next scroll
    sessionStorage.removeItem('flowlyt-star-dismissed');
  }, []);

  return (
    <ThemeProvider>
      <div className="min-h-screen app-bg transition-colors duration-300 text-slate-100">
        {/* Star Banner */}
        {showStarBanner && (
          <div className="fixed top-0 left-0 right-0 bg-gradient-to-r from-emerald-300/40 to-cyan-400/40 dark:from-emerald-300/10 dark:to-cyan-400/10 backdrop-blur-md border-b border-cyan-300/50 dark:border-cyan-700/50 shadow-[0_8px_32px_rgba(34,211,238,0.3)] dark:shadow-[0_8px_32px_rgba(34,211,238,0.2)] z-[60]">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    If Flowlyt helps you, consider starring the repo
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <a
                    href="https://github.com/harekrishnarai/flowlyt"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-1 bg-gray-200 dark:bg-slate-700 text-gray-900 dark:text-gray-100 rounded hover:bg-gray-300 dark:hover:bg-slate-600 transition-colors text-xs font-medium"
                  >
                    <Star className="w-4 h-4" />
                    Star
                  </a>
                  <button
                    onClick={() => {
                      setShowStarBanner(false);
                      localStorage.setItem('flowlyt-star-banner-dismissed', 'true');
                    }}
                    className="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded transition-colors"
                    aria-label="Dismiss"
                  >
                    <X className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <header className={`fixed left-0 right-0 z-50 transition-all duration-300 ${showStarBanner ? 'top-[52px]' : 'top-0'}`}>
          <div className="max-w-7xl mx-auto px-6">
            <div className="flex items-center justify-center h-[72px]">
              {/* Center Navigation - Logo + Star CTA + GitHub + Theme Toggle */}
              <nav className="flex items-center">
                <div 
                  className={`flex items-center bg-white/90 dark:bg-slate-900/90 backdrop-blur-md rounded-full border border-gray-200/60 dark:border-white/10 shadow-lg shadow-gray-200/50 dark:shadow-black/20 transition-all duration-300 ease-out ${
                    scrollY > 100 ? 'px-1.5 py-1.5 gap-1' : 'px-4 py-2.5 gap-4'
                  }`}
                  style={{ transform: `translateY(${Math.min(scrollY * 0.1, 20)}px)` }}
                >
                  {/* Logo */}
                  <div className="flex items-center gap-2.5">
                    <div className={`bg-gradient-to-br from-emerald-300 to-cyan-400 rounded-lg flex items-center justify-center shadow-md transition-all duration-300 ${
                      scrollY > 100 ? 'w-6 h-6' : 'w-8 h-8'
                    }`}>
                      <GitBranch className={`text-slate-900 transition-all duration-300 ${scrollY > 100 ? 'w-3 h-3' : 'w-4 h-4'}`} />
                    </div>
                    <span className={`text-lg font-semibold text-gray-900 dark:text-white transition-all duration-300 ${scrollY > 100 ? 'w-0 opacity-0' : 'w-auto opacity-100'}`} style={{ overflow: 'hidden', whiteSpace: 'nowrap' }}>Flowlyt</span>
                  </div>

                  {/* Divider */}
                  <div className={`h-6 bg-gray-300/40 dark:bg-white/10 transition-all duration-300 ${scrollY > 100 ? 'w-0 opacity-0 mx-0' : 'w-px opacity-100'}`}></div>

                  {/* Star CTA */}
                  <a
                    href="https://github.com/harekrishnarai/flowlyt"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`text-sm font-medium text-gray-900 dark:text-white hover:bg-gray-100/80 dark:hover:bg-white/10 rounded-full transition-all inline-flex items-center ${
                      scrollY > 100 ? 'px-2 py-2 gap-0' : 'px-4 py-2 gap-2'
                    }`}
                  >
                    <svg className={`flex-shrink-0 transition-all duration-300 ${scrollY > 100 ? 'w-3.5 h-3.5' : 'w-4 h-4'}`} fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    <span className={`transition-all duration-300 ${scrollY > 100 ? 'w-0 opacity-0' : 'w-auto opacity-100'}`} style={{ overflow: 'hidden', whiteSpace: 'nowrap' }}>Star us</span>
                  </a>

                  {/* GitHub - Active/Highlighted */}
                  <a
                    href="https://github.com/harekrishnarai/flowlyt"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`text-sm font-medium text-gray-900 dark:text-white bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 hover:from-emerald-500/30 hover:to-cyan-500/30 rounded-full transition-all inline-flex items-center border border-emerald-500/30 shadow-sm ${
                      scrollY > 100 ? 'px-2 py-2 gap-0' : 'px-4 py-2 gap-2'
                    }`}
                  >
                    <Github className={`flex-shrink-0 transition-all duration-300 ${scrollY > 100 ? 'w-3.5 h-3.5' : 'w-4 h-4'}`} />
                    <span className={`transition-all duration-300 ${scrollY > 100 ? 'w-0 opacity-0' : 'w-auto opacity-100'}`} style={{ overflow: 'hidden', whiteSpace: 'nowrap' }}>GitHub</span>
                  </a>

                  {/* Divider */}
                  <div className={`h-6 bg-gray-300/40 dark:bg-white/10 transition-all duration-300 ${scrollY > 100 ? 'w-0 opacity-0 mx-0' : 'w-px opacity-100'}`}></div>

                  {/* Theme Toggle */}
                  <ThemeToggle />
                </div>
              </nav>
            </div>
          </div>
        </header>

        <main className={`${analysisReports.length === 0 ? 'max-w-4xl' : 'max-w-full'} mx-auto px-4 sm:px-5 lg:px-6 py-4 sm:py-5 relative ${showStarBanner ? 'mt-[124px]' : 'mt-[72px]'}`}>
          {analysisReports.length === 0 ? (
            <div className="space-y-6 sm:space-y-8">
              <div className="text-center space-y-3">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white leading-tight transition-colors duration-300">
                  Secure your <span className="accent-text">CI/CD</span> pipelines
                </h1>
                <p className="text-sm sm:text-base text-gray-600 dark:text-slate-200/90 max-w-2xl mx-auto leading-relaxed transition-colors duration-300">
                  Scan GitHub/GitLab repos or drop CI/CD files. Get security, performance, and best-practice insights without data ever leaving your browser.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <a href="#workflow-entry" className="cta-strong text-sm sm:text-base px-4 py-2">
                    Start analysis
                    <Star className="w-4 h-4" />
                  </a>
                  <a href="https://github.com/harekrishnarai/flowlyt" target="_blank" rel="noopener noreferrer" className="pill text-gray-700 dark:text-slate-200 hover:text-gray-900 dark:hover:text-white transition-colors text-sm sm:text-base px-3 py-2">
                    <Github className="w-4 h-4" />
                    View on GitHub
                  </a>
                </div>
              </div>

              <div id="workflow-entry" className="glass-strong rounded-2xl p-4 sm:p-5 shadow-2xl max-w-3xl mx-auto">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-xs sm:text-sm text-gray-600 dark:text-slate-300 transition-colors duration-300">Entry point</p>
                    <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white transition-colors duration-300">Analyze a repository or upload files</h2>
                  </div>
                  <div className="pill text-xs text-gray-700 dark:text-slate-100 bg-gray-100 dark:bg-white/5 border-gray-200 dark:border-white/10 transition-colors duration-300">
                    <Shield className="w-4 h-4 text-emerald-500 dark:text-emerald-300" />
                    Browser-only
                  </div>
                </div>
                <FileUpload onFilesUploaded={handleFilesUploaded} uploadedFiles={workflowFiles} onRemoveFile={handleRemoveFile} />

                {isAnalyzing && (
                  <div className="mt-4">
                    <EnhancedProgress 
                      current={analysisProgress.current}
                      total={analysisProgress.total}
                      currentFileName={currentFileName}
                      stage={analysisStage}
                    />
                  </div>
                )}
              </div>

              {/* Real-world Supply Chain Incidents */}
              <div className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-900/50 rounded-xl p-6 border border-gray-200 dark:border-gray-700/50 transition-colors duration-300 max-w-3xl mx-auto mt-8">
                <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 transition-colors duration-300">Real-world Supply Chain Incidents</h4>
                <div className="space-y-4">
                  <a href="https://www.stepsecurity.io/blog/harden-runner-detection-tj-actions-changed-files-action-is-compromised" target="_blank" rel="noopener noreferrer" className="block bg-white dark:bg-gray-800/80 rounded-lg p-4 border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-300 hover:shadow-md">
                    <div className="flex items-start justify-between mb-2">
                      <h5 className="font-semibold text-gray-900 dark:text-gray-100 transition-colors duration-300 flex items-center gap-2">
                        tj-actions/changed-files compromise
                        <ExternalLink className="w-4 h-4 text-gray-400" />
                      </h5>
                      <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap ml-2">March 15, 2025</span>
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300 transition-colors duration-300">
                      The tj-actions/changed-files Action was retroactively updated to a malicious commit that exposed CI/CD secrets in logs. This incident shows the danger of unverified action tags and compromised maintainer tokens.
                    </p>
                  </a>
                  
                  <a href="https://www.stepsecurity.io/blog/grafana-github-actions-security-incident" target="_blank" rel="noopener noreferrer" className="block bg-white dark:bg-gray-800/80 rounded-lg p-4 border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-300 hover:shadow-md">
                    <div className="flex items-start justify-between mb-2">
                      <h5 className="font-semibold text-gray-900 dark:text-gray-100 transition-colors duration-300 flex items-center gap-2">
                        Grafana GitHub Actions incident
                        <ExternalLink className="w-4 h-4 text-gray-400" />
                      </h5>
                      <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap ml-2">April 26, 2025</span>
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300 transition-colors duration-300">
                      An unauthorized user leveraged a vulnerability in a Grafana CI workflow, leading to exposure of a small number of secrets. Immediate detection and response limited the impact.
                    </p>
                  </a>
                  
                  <a href="https://blog.harekrishnarai.me/the-nx-supply-chain-attack-when-ai-becomes-an-accomplice-attackers" target="_blank" rel="noopener noreferrer" className="block bg-white dark:bg-gray-800/80 rounded-lg p-4 border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-300 hover:shadow-md">
                    <div className="flex items-start justify-between mb-2">
                      <h5 className="font-semibold text-gray-900 dark:text-gray-100 transition-colors duration-300 flex items-center gap-2">
                        The Nx Supply Chain Attack
                        <ExternalLink className="w-4 h-4 text-gray-400" />
                      </h5>
                      <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap ml-2">August 28, 2025</span>
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300 transition-colors duration-300">
                      A detailed analysis of how AI tools became unwitting accomplices in a sophisticated supply chain attack targeting the Nx ecosystem, highlighting the emerging risks of AI-assisted development.
                    </p>
                  </a>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-4 italic transition-colors duration-300">
                  These incidents illustrate how misconfigured workflows, compromised actions, and leaked credentials can lead to supply chain breaches. Use Flowlyt to detect risky patterns and harden your CI/CD pipelines.
                </p>
              </div>
            </div>
          ) : (
            <div className="glass-strong rounded-2xl p-4 sm:p-6 lg:p-8 transition-all duration-300 mx-2 sm:mx-0">
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