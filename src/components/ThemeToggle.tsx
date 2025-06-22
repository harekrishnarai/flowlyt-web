import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition-all hover:bg-gray-50 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100 dark:focus:ring-offset-gray-900"
      aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
    >
      <div className="relative">
        {theme === 'light' ? (
          <Moon className="h-5 w-5 transition-transform duration-200" />
        ) : (
          <Sun className="h-5 w-5 transition-transform duration-200" />
        )}
      </div>
    </button>
  );
}
