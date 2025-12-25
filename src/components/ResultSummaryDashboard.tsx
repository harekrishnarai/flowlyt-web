import { useMemo } from 'react';
import { AnalysisReport } from '../types/workflow';

interface ResultSummaryDashboardProps {
  reports: AnalysisReport[];
}

export default function ResultSummaryDashboard({ reports }: ResultSummaryDashboardProps) {
  const stats = useMemo(() => {
    let totalIssues = 0;
    let critical = 0;
    let high = 0;
    let info = 0;
    
    const typeCounts = {
      security: 0,
      performance: 0,
      'best-practice': 0,
      dependency: 0,
      structure: 0
    };

    reports.forEach(report => {
      totalIssues += report.results.length;
      report.results.forEach(result => {
        const severity = result.severity.toLowerCase();
        if (severity === 'error') critical++;
        else if (severity === 'warning') high++;
        else info++;

        if (result.type in typeCounts) {
          typeCounts[result.type as keyof typeof typeCounts]++;
        }
      });
    });

    const maxPossibleIssues = reports.length * 50;
    const securityScore = totalIssues === 0 ? 100 : Math.max(0, Math.round((1 - (critical * 10 + high * 5) / maxPossibleIssues) * 100));

    return {
      totalIssues,
      critical,
      high,
      info,
      securityScore,
      typeCounts,
      filesAnalyzed: reports.length
    };
  }, [reports]);

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 dark:text-green-400';
    if (score >= 60) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 80) return 'from-green-500 to-emerald-500';
    if (score >= 60) return 'from-yellow-500 to-orange-500';
    return 'from-red-500 to-rose-600';
  };

  const getScoreMessage = (score: number) => {
    if (score >= 80) return 'Good job! Minor improvements needed.';
    if (score >= 60) return 'Moderate security. Address key issues.';
    return 'Needs attention. Several security concerns.';
  };

  return (
    <div className="mb-6">
      {/* Simplified Summary Card */}
      <div className="bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-800 dark:to-gray-850 rounded-xl border border-blue-200 dark:border-purple-800 p-6 shadow-sm">
        
        {/* CHANGED: Switched from Grid to Flexbox for better vertical alignment */}
        <div className="flex flex-col lg:flex-row items-center justify-between gap-6 lg:gap-12">
          
          {/* Security Score - Left aligned */}
          <div className="flex items-center space-x-4 w-full lg:w-auto justify-center lg:justify-start">
            <div className={`w-20 h-20 rounded-full bg-gradient-to-br ${getScoreBgColor(stats.securityScore)} p-1 shadow-md flex-shrink-0`}>
              <div className="w-full h-full rounded-full bg-white dark:bg-gray-900 flex items-center justify-center">
                <div className="text-center">
                  <div className={`text-2xl font-bold ${getScoreColor(stats.securityScore)}`}>
                    {stats.securityScore}
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">Score</div>
                </div>
              </div>
            </div>
            <div className="flex-1 min-w-[180px]"> {/* Added min-width to prevent text wrapping awkwardly */}
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
                Security Score
              </h3>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                {getScoreMessage(stats.securityScore)}
              </p>
            </div>
          </div>

          {/* Key Stats - Right aligned */}
          {/* CHANGED: Adjusted grid gap and widths to fit content nicely */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-x-8 gap-y-4 w-full lg:w-auto text-center lg:text-right">
            <div className="flex flex-col items-center">
              <div className="text-xl font-bold text-blue-600 dark:text-blue-400">{stats.filesAnalyzed}</div>
              <div className="text-xs text-gray-600 dark:text-gray-400">Files</div>
            </div>
            <div className="flex flex-col items-center">
              <div className="text-xl font-bold text-gray-900 dark:text-gray-100">{stats.totalIssues}</div>
              <div className="text-xs text-gray-600 dark:text-gray-400">Issues</div>
            </div>
            <div className="flex flex-col items-center">
              <div className="text-xl font-bold text-red-600 dark:text-red-400">{stats.critical}</div>
              <div className="text-xs text-gray-600 dark:text-gray-400">Critical</div>
            </div>
            <div className="flex flex-col items-center">
              <div className="text-xl font-bold text-yellow-600 dark:text-yellow-400">{stats.high}</div>
              <div className="text-xs text-gray-600 dark:text-gray-400">Warnings</div>
            </div>
            <div className="flex flex-col items-center">
              <div className="text-xl font-bold text-blue-600 dark:text-blue-400">{stats.typeCounts.security}</div>
              <div className="text-xs text-gray-600 dark:text-gray-400">Security</div>
            </div>
            <div className="flex flex-col items-center">
              <div className="text-xl font-bold text-purple-600 dark:text-purple-400">{stats.typeCounts.performance}</div>
              <div className="text-xs text-gray-600 dark:text-gray-400">Performance</div>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}