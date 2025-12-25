import { useState } from 'react';
import { Terminal, Download, Zap, Shield, Code, ExternalLink, CheckCircle, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';

export default function CLISection() {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="mt-8 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden transition-all duration-300 hover:shadow-xl">
      {/* Header - Always Visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full bg-gradient-to-r from-blue-600 to-purple-600 p-6 cursor-pointer hover:from-blue-700 hover:to-purple-700 transition-all duration-300 text-left"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="bg-white/20 backdrop-blur-sm rounded-lg p-3">
              <Terminal className="w-8 h-8 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-2xl font-bold text-white">Want More Power?</h2>
                <Sparkles className="w-5 h-5 text-yellow-300 animate-pulse" />
              </div>
              <p className="text-blue-100 mt-1 text-sm sm:text-base">
                Explore Flowlyt CLI for AI-powered analysis, organization scanning, and advanced features
              </p>
            </div>
          </div>
          <div className="flex-shrink-0 ml-4">
            {isExpanded ? (
              <ChevronUp className="w-6 h-6 text-white transition-transform duration-300" />
            ) : (
              <ChevronDown className="w-6 h-6 text-white transition-transform duration-300 animate-bounce" />
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
        <div className="p-6">
        <div className="grid md:grid-cols-2 gap-6 mb-6">
          {/* Features */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center">
              <Zap className="w-5 h-5 mr-2 text-yellow-500" />
              Advanced Features
            </h3>
            <ul className="space-y-3">
              {[
                'AI-powered security analysis with multiple providers',
                'Scan entire GitHub organizations',
                'Custom security rules & policies',
                'SARIF output for CI/CD integration',
                'Advanced AST analysis & call graphs',
                'Multi-platform support (GitLab, Jenkins)',
              ].map((feature, index) => (
                <li key={index} className="flex items-start text-sm text-gray-700 dark:text-gray-300">
                  <CheckCircle className="w-4 h-4 mr-2 text-green-500 flex-shrink-0 mt-0.5" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Quick Start */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center">
              <Download className="w-5 h-5 mr-2 text-blue-500" />
              Quick Installation
            </h3>
            <div className="bg-gray-900 dark:bg-gray-950 rounded-lg p-4 mb-4">
              <code className="text-sm text-green-400 font-mono block mb-2">
                # Install via Go
              </code>
              <code className="text-sm text-gray-300 font-mono block break-all">
                go install github.com/harekrishnarai/flowlyt/cmd/flowlyt@latest
              </code>
            </div>
            <div className="bg-gray-900 dark:bg-gray-950 rounded-lg p-4">
              <code className="text-sm text-green-400 font-mono block mb-2">
                # Run your first scan
              </code>
              <code className="text-sm text-gray-300 font-mono block">
                flowlyt scan --repo .
              </code>
            </div>
          </div>
        </div>

        {/* AI-Enhanced Analysis */}
        <div className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-lg p-6 mb-6 border border-purple-200 dark:border-purple-800">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center">
            <Shield className="w-5 h-5 mr-2 text-purple-600 dark:text-purple-400" />
            AI-Powered Security Analysis
          </h3>
          <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">
            Enhance your security scans with AI verification from OpenAI, Gemini, Claude, Grok, or Perplexity
          </p>
          <div className="bg-gray-900 dark:bg-gray-950 rounded-lg p-4">
            <code className="text-sm text-green-400 font-mono block mb-2">
              # AI-enhanced scan with Gemini
            </code>
            <code className="text-sm text-gray-300 font-mono block">
              export AI_API_KEY=your-api-key
            </code>
            <code className="text-sm text-gray-300 font-mono block">
              flowlyt scan --repo . --ai gemini
            </code>
          </div>
        </div>

        {/* Example Commands */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center">
            <Code className="w-5 h-5 mr-2 text-blue-600" />
            Common Use Cases
          </h3>
          <div className="space-y-3">
            {[
              {
                title: 'Scan Remote Repository',
                command: 'flowlyt scan --url https://github.com/user/repo',
              },
              {
                title: 'Generate SARIF Report',
                command: 'flowlyt scan --repo . --output sarif --output-file results.sarif',
              },
              {
                title: 'Analyze Organization',
                command: 'flowlyt analyze-org --organization mycompany',
              },
              {
                title: 'Custom Configuration',
                command: 'flowlyt scan --repo . --config .flowlyt.yml --min-severity HIGH',
              },
            ].map((example, index) => (
              <div key={index} className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  {example.title}
                </div>
                <code className="text-xs text-gray-800 dark:text-gray-200 font-mono block break-all">
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
            className="flex items-center justify-center px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl font-medium"
          >
            <ExternalLink className="w-5 h-5 mr-2" />
            View on GitHub
          </a>
          <a
            href="https://github.com/harekrishnarai/flowlyt/blob/main/docs/cli-reference.md"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center px-6 py-3 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-all duration-300 border border-gray-300 dark:border-gray-600 font-medium"
          >
            <Terminal className="w-5 h-5 mr-2" />
            Full CLI Documentation
          </a>
        </div>

        {/* Quick Stats */}
        <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">5+</div>
              <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">AI Providers</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">50+</div>
              <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">Security Rules</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">3</div>
              <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">CI/CD Platforms</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">100%</div>
              <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">Open Source</div>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
