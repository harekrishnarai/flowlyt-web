import { CheckCircle, Trophy, Download, RefreshCw, ExternalLink, Shield } from 'lucide-react';

interface EmptyStateProps {
  fileName: string;
  onNewAnalysis: () => void;
  onExport: () => void;
}

export default function EmptyState({ fileName, onNewAnalysis, onExport }: EmptyStateProps) {
  return (
    <div className="text-center py-12 px-4">
      {/* Success Icon */}
      <div className="relative inline-block mb-6">
        <div className="w-24 h-24 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full flex items-center justify-center shadow-lg mx-auto">
          <Trophy className="w-12 h-12 text-white" />
        </div>
        <div className="absolute -top-2 -right-2 w-10 h-10 bg-green-500 rounded-full flex items-center justify-center shadow-md">
          <CheckCircle className="w-6 h-6 text-white fill-current" />
        </div>
        {/* Celebration animation */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2">
          <div className="text-4xl animate-bounce">🎉</div>
        </div>
      </div>

      {/* Success Message */}
      <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 mb-3">
        Excellent Work!
      </h2>
      <p className="text-lg text-gray-600 dark:text-gray-400 mb-2">
        No critical issues found in <span className="font-semibold text-green-600 dark:text-green-400">{fileName}</span>
      </p>
      <p className="text-sm text-gray-500 dark:text-gray-500 mb-8">
        Your workflow follows security best practices and performance guidelines.
      </p>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-4 max-w-md mx-auto mb-8">
        <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">100</div>
          <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">Score</div>
        </div>
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">0</div>
          <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">Issues</div>
        </div>
        <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 border border-purple-200 dark:border-purple-800">
          <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">✓</div>
          <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">Secure</div>
        </div>
      </div>

      {/* What's Next Section */}
      <div className="bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-800 dark:to-gray-850 rounded-xl border border-blue-200 dark:border-purple-800 p-6 max-w-2xl mx-auto mb-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center justify-center">
          <Shield className="w-5 h-5 mr-2 text-blue-600 dark:text-blue-400" />
          What's Next?
        </h3>
        <div className="grid sm:grid-cols-2 gap-4 text-left">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <div className="font-medium text-gray-900 dark:text-gray-100 mb-2">📊 Analyze More</div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Upload additional workflows to ensure all your CI/CD pipelines are secure
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <div className="font-medium text-gray-900 dark:text-gray-100 mb-2">💾 Export Report</div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Download this clean security report for your records or compliance
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <div className="font-medium text-gray-900 dark:text-gray-100 mb-2">🚀 Try CLI</div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Use Flowlyt CLI for AI-powered analysis and organization scanning
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <div className="font-medium text-gray-900 dark:text-gray-100 mb-2">⭐ Star on GitHub</div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Help us improve by starring our repository and sharing feedback
            </p>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
        <button
          onClick={onNewAnalysis}
          className="flex items-center justify-center px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl font-medium"
        >
          <RefreshCw className="w-5 h-5 mr-2" />
          Analyze Another Workflow
        </button>
        <button
          onClick={onExport}
          className="flex items-center justify-center px-6 py-3 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-all duration-300 border border-gray-300 dark:border-gray-600 font-medium shadow-md"
        >
          <Download className="w-5 h-5 mr-2" />
          Export Report
        </button>
      </div>

      {/* Additional Link */}
      <div className="mt-8 pt-8 border-t border-gray-200 dark:border-gray-700">
        <a
          href="https://github.com/harekrishnarai/flowlyt"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors"
        >
          Learn more about Flowlyt CLI
          <ExternalLink className="w-4 h-4 ml-1" />
        </a>
      </div>
    </div>
  );
}
