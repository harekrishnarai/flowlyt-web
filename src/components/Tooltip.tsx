import { useState, ReactNode } from 'react';

interface TooltipProps {
  content: string;
  children: ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
}

export default function Tooltip({ 
  content, 
  children, 
  position = 'top',
  delay = 200 
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [timeoutId, setTimeoutId] = useState<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    const id = setTimeout(() => {
      setIsVisible(true);
    }, delay);
    setTimeoutId(id);
  };

  const handleMouseLeave = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      setTimeoutId(null);
    }
    setIsVisible(false);
  };

  const getPositionClasses = () => {
    const baseClasses = 'absolute z-50 px-2 py-1 text-xs font-medium text-white bg-gray-900 dark:bg-gray-700 rounded whitespace-nowrap pointer-events-none';
    
    switch (position) {
      case 'top':
        return `${baseClasses} bottom-full left-1/2 -translate-x-1/2 mb-2 before:content-[''] before:absolute before:top-full before:left-1/2 before:-translate-x-1/2 before:border-4 before:border-t-gray-900 before:border-r-transparent before:border-b-transparent before:border-l-transparent dark:before:border-t-gray-700`;
      case 'bottom':
        return `${baseClasses} top-full left-1/2 -translate-x-1/2 mt-2 before:content-[''] before:absolute before:bottom-full before:left-1/2 before:-translate-x-1/2 before:border-4 before:border-b-gray-900 before:border-r-transparent before:border-t-transparent before:border-l-transparent dark:before:border-b-gray-700`;
      case 'left':
        return `${baseClasses} right-full top-1/2 -translate-y-1/2 mr-2 before:content-[''] before:absolute before:left-full before:top-1/2 before:-translate-y-1/2 before:border-4 before:border-l-gray-900 before:border-t-transparent before:border-b-transparent before:border-r-transparent dark:before:border-l-gray-700`;
      case 'right':
        return `${baseClasses} left-full top-1/2 -translate-y-1/2 ml-2 before:content-[''] before:absolute before:right-full before:top-1/2 before:-translate-y-1/2 before:border-4 before:border-r-gray-900 before:border-t-transparent before:border-b-transparent before:border-l-transparent dark:before:border-r-gray-700`;
      default:
        return baseClasses;
    }
  };

  return (
    <div
      className="relative inline-block"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {isVisible && (
        <div className={getPositionClasses()} style={{ animation: 'fadeIn 0.2s ease-in-out' }}>
          {content}
        </div>
      )}
      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: ${
              position === 'top' ? 'translateY(4px)' :
              position === 'bottom' ? 'translateY(-4px)' :
              position === 'left' ? 'translateX(4px)' :
              'translateX(-4px)'
            };
          }
          to {
            opacity: 1;
            transform: ${
              position === 'top' ? 'translateY(0)' :
              position === 'bottom' ? 'translateY(0)' :
              position === 'left' ? 'translateX(0)' :
              'translateX(0)'
            };
          }
        }
      `}</style>
    </div>
  );
}
