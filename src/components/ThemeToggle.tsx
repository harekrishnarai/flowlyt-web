import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg bg-transparent text-gray-400 transition-all hover:bg-slate-700/50 hover:text-white focus:outline-none"
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
