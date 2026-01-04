import { useState } from 'react';
import { Terminal, Download, Zap, Shield, Code, ExternalLink, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';

export default function CLISection() {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="mt-8 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden transition-all duration-300 hover:shadow-xl">
      {/* Header - Always Visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full bg-gradient-to-br from-slate-100 via-slate-50 to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 p-6 cursor-pointer hover:from-slate-200 hover:via-slate-100 hover:to-slate-200 dark:hover:from-slate-800 dark:hover:via-slate-700 dark:hover:to-slate-800 transition-all duration-300 text-left border-b border-gray-300 dark:border-slate-700"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="bg-blue-500/10 backdrop-blur-sm rounded-lg p-3 border border-blue-500/30">
              <Terminal className="w-8 h-8 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Flowlyt CLI</h2>
              <p className="text-gray-600 dark:text-slate-400 mt-1 text-sm sm:text-base">
                Take your workflow analysis to the next level with our command-line tool
              </p>
            </div>
          </div>
          <div className="flex-shrink-0 ml-4">
            {isExpanded ? (
              <ChevronUp className="w-6 h-6 text-gray-500 dark:text-slate-400 transition-transform duration-300" />
            ) : (
              <ChevronDown className="w-6 h-6 text-gray-500 dark:text-slate-400 transition-transform duration-300" />
            )}
          </div>
        </div>
      </button>

      {/* Expandable Content */}
      <div 
        className={`transition-all duration-500 ease-in-out ${
          isExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
        } overflow-hidden`}
      >
        <div className="p-6 bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
        <div className="grid md:grid-cols-2 gap-6 mb-6">
          {/* Features */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-4 flex items-center">
              <Zap className="w-5 h-5 mr-2 text-blue-600 dark:text-blue-500" />
              What You Get
            </h3>
            <ul className="space-y-3">
              {[
                'Scan local repositories instantly',
                'Analyze remote GitHub/GitLab repositories',
                'CI/CD integration with SARIF reports',
                'Custom security rule definitions',
                'Organization-wide vulnerability scanning',
                'Machine-readable output formats',
              ].map((feature, index) => (
                <li key={index} className="flex items-start text-sm text-gray-700 dark:text-slate-300">
                  <CheckCircle className="w-4 h-4 mr-2 text-emerald-500 flex-shrink-0 mt-0.5" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Quick Start */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-4 flex items-center">
              <Download className="w-5 h-5 mr-2 text-blue-600 dark:text-blue-500" />
              Get Started
            </h3>
            <div className="bg-gray-900 dark:bg-gray-950 rounded-lg p-4 mb-4 border border-gray-700 dark:border-slate-700 transition-colors duration-300">
              <code className="text-sm text-emerald-500 dark:text-emerald-400 font-mono block mb-2">
                # Install
              </code>
              <code className="text-sm text-gray-200 dark:text-slate-300 font-mono block break-all">
                go install github.com/harekrishnarai/flowlyt/cmd/flowlyt@latest
              </code>
            </div>
            <div className="bg-gray-900 dark:bg-gray-950 rounded-lg p-4 border border-gray-700 dark:border-slate-700 transition-colors duration-300">
              <code className="text-sm text-emerald-500 dark:text-emerald-400 font-mono block mb-2">
                # Run
              </code>
              <code className="text-sm text-gray-200 dark:text-slate-300 font-mono block">
                flowlyt scan --repo .
              </code>
            </div>
          </div>
        </div>

        {/* Key Benefits */}
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-6 mb-6 border border-blue-200 dark:border-blue-800 transition-colors duration-300">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-3 flex items-center">
            <Shield className="w-5 h-5 mr-2 text-blue-600 dark:text-blue-400" />
            Enterprise-Grade Security Analysis
          </h3>
          <p className="text-sm text-gray-700 dark:text-slate-300 mb-4">
            Comprehensive workflow security scanning with detailed insights and actionable recommendations
          </p>
          <div className="bg-slate-900 dark:bg-gray-950 rounded-lg p-4 border border-slate-700">
            <code className="text-sm text-emerald-400 font-mono block mb-2">
              # Detailed security scan
            </code>
            <code className="text-sm text-slate-300 font-mono block">
              flowlyt scan --repo . --output json --strict
            </code>
          </div>
        </div>

        {/* Example Commands */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center">
            <Code className="w-5 h-5 mr-2 text-blue-600" />
            Common Commands
          </h3>
          <div className="space-y-3">
            {[
              {
                title: 'Local Repository Scan',
                command: 'flowlyt scan --repo .',
              },
              {
                title: 'Remote Repository',
                command: 'flowlyt scan --url https://github.com/owner/repo',
              },
              {
                title: 'Generate Report',
                command: 'flowlyt scan --repo . --output sarif --output-file report.sarif',
              },
              {
                title: 'Organization Scan',
                command: 'flowlyt analyze-org --organization my-org',
              },
            ].map((example, index) => (
              <div key={index} className="bg-slate-100 dark:bg-gray-800 rounded-lg p-3 border border-slate-200 dark:border-gray-700 hover:border-slate-300 dark:hover:border-gray-600 transition-colors">
                <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">
                  {example.title}
                </div>
                <code className="text-xs text-slate-800 dark:text-slate-200 font-mono block break-all">
                  {example.command}
                </code>
              </div>
            ))}
          </div>
        </div>

        {/* Call to Action */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <a
            href="https://github.com/harekrishnarai/flowlyt"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all duration-300 shadow-lg hover:shadow-xl font-medium"
          >
            <ExternalLink className="w-5 h-5 mr-2" />
            View on GitHub
          </a>
          <a
            href="https://github.com/harekrishnarai/flowlyt/blob/main/docs/cli-reference.md"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center px-6 py-3 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-all duration-300 border border-slate-300 dark:border-slate-600 font-medium"
          >
            <Terminal className="w-5 h-5 mr-2" />
            Documentation
          </a>
        </div>

        {/* Quick Info */}
        <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">100%</div>
              <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">Open Source</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">50+</div>
              <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">Security Rules</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">3</div>
              <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">Platforms</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-600 dark:text-slate-400">Active</div>
              <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">Development</div>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
