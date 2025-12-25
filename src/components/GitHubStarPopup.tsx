import { useState, useEffect } from 'react';
import { X, Star, Github } from 'lucide-react';

interface GitHubStarPopupProps {
  show: boolean;
  onClose: () => void;
}

export default function GitHubStarPopup({ show, onClose }: GitHubStarPopupProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (show) {
      // Small delay for animation
      setTimeout(() => setIsVisible(true), 100);
    } else {
      setIsVisible(false);
    }
  }, [show]);

  const handleStarClick = () => {
    // Mark as starred in localStorage to not show again
    localStorage.setItem('flowlyt-cli-starred', 'true');
    window.open('https://github.com/harekrishnarai/flowlyt', '_blank');
    onClose();
  };

  const handleDismiss = () => {
    // Mark as dismissed for this session
    sessionStorage.setItem('flowlyt-star-dismissed', 'true');
    onClose();
  };

  if (!show) return null;

  return (
    <div 
      className={`fixed bottom-6 right-6 z-50 transition-all duration-300 transform ${
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
      }`}
    >
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 p-6 max-w-md relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-yellow-400/20 to-purple-500/20 rounded-full -mr-16 -mt-16" />
        
        {/* Close button */}
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Content */}
        <div className="relative">
          <div className="flex items-start space-x-4">
            <div className="flex-shrink-0">
              <div className="w-12 h-12 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center shadow-lg">
                <Star className="w-6 h-6 text-white fill-white" />
              </div>
            </div>
            
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">
                Enjoying Flowlyt?
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                Help us grow by starring our CLI tool on GitHub! Get access to AI-powered analysis and advanced security features.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handleStarClick}
                  className="flex items-center justify-center px-4 py-2 bg-gradient-to-r from-yellow-500 to-orange-500 text-white rounded-lg hover:from-yellow-600 hover:to-orange-600 transition-all duration-300 shadow-md hover:shadow-lg font-medium text-sm"
                >
                  <Github className="w-4 h-4 mr-2" />
                  Star on GitHub
                  <Star className="w-4 h-4 ml-2" />
                </button>
                
                <button
                  onClick={handleDismiss}
                  className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors text-sm font-medium"
                >
                  Maybe later
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
