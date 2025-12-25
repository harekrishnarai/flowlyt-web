import { Loader2, CheckCircle, Clock } from 'lucide-react';

interface EnhancedProgressProps {
  current: number;
  total: number;
  currentFileName?: string;
  stage: 'parsing' | 'analyzing' | 'complete';
}

export default function EnhancedProgress({ current, total, currentFileName, stage }: EnhancedProgressProps) {
  const progress = total > 0 ? (current / total) * 100 : 0;
  const stageLabels = {
    parsing: 'Parsing workflows...',
    analyzing: 'Analyzing security & performance...',
    complete: 'Analysis complete!'
  };

  const estimatedTimeRemaining = total > 0 ? Math.ceil((total - current) * 2) : 0; // ~2 seconds per file

  return (
    <div className="mt-6 space-y-4">
      <div className="flex items-center justify-center space-x-3">
        <Loader2 className="w-5 h-5 text-blue-600 dark:text-purple-400 animate-spin" />
        <div className="text-center">
          <div className="font-medium text-gray-900 dark:text-gray-100">
            {stageLabels[stage]}
          </div>
          {currentFileName && (
            <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {currentFileName}
            </div>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full max-w-md mx-auto px-4 sm:px-0">
        <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
          <span>{current} of {total} files</span>
          {estimatedTimeRemaining > 0 && (
            <span className="flex items-center space-x-1">
              <Clock className="w-3 h-3" />
              <span>~{estimatedTimeRemaining}s</span>
            </span>
          )}
        </div>
        <div className="bg-gray-200 dark:bg-slate-700 rounded-full h-2.5 overflow-hidden transition-colors duration-300">
          <div 
            className="bg-gradient-to-r from-blue-600 to-purple-600 h-2.5 rounded-full transition-all duration-500 ease-out relative"
            style={{ width: `${progress}%` }}
          >
            <div className="absolute inset-0 bg-white/30 animate-pulse"></div>
          </div>
        </div>
        <div className="mt-2 text-center text-xs text-gray-500 dark:text-gray-400">
          {Math.round(progress)}% complete
        </div>
      </div>

      {/* Stage Indicators */}
      <div className="flex items-center justify-center space-x-4 text-xs">
        <div className={`flex items-center space-x-1 ${stage === 'parsing' || stage === 'analyzing' || stage === 'complete' ? 'text-blue-600 dark:text-purple-400' : 'text-gray-400'}`}>
          <CheckCircle className={`w-4 h-4 ${stage === 'analyzing' || stage === 'complete' ? 'fill-current' : ''}`} />
          <span>Parse</span>
        </div>
        <div className="w-8 h-px bg-gray-300 dark:bg-gray-600"></div>
        <div className={`flex items-center space-x-1 ${stage === 'analyzing' || stage === 'complete' ? 'text-blue-600 dark:text-purple-400' : 'text-gray-400'}`}>
          <CheckCircle className={`w-4 h-4 ${stage === 'complete' ? 'fill-current' : ''}`} />
          <span>Analyze</span>
        </div>
        <div className="w-8 h-px bg-gray-300 dark:bg-gray-600"></div>
        <div className={`flex items-center space-x-1 ${stage === 'complete' ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`}>
          <CheckCircle className={`w-4 h-4 ${stage === 'complete' ? 'fill-current' : ''}`} />
          <span>Complete</span>
        </div>
      </div>
    </div>
  );
}
