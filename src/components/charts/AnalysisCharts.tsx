import { useMemo } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar
} from 'recharts';
import { AnalysisReport } from '../../types/workflow';

interface AnalysisChartsProps {
  reports: AnalysisReport[];
}

const SEVERITY_COLORS = {
  error: '#DC2626',
  warning: '#D97706',
  info: '#2563EB'
};

const TYPE_COLORS = {
  security: '#DC2626',
  performance: '#D97706',
  'best-practice': '#059669',
  dependency: '#7C3AED',
  structure: '#2563EB'
};

export default function AnalysisCharts({ reports }: AnalysisChartsProps) {  // Prepare data for severity distribution
  const severityData = useMemo(() => {
    const totals = { error: 0, warning: 0, info: 0 };
    reports.forEach(report => {
      totals.error += report.summary.errorCount;
      totals.warning += report.summary.warningCount;
      totals.info += report.summary.infoCount;
    });
    
    return Object.entries(totals)
      .filter(([_, count]) => count > 0)
      .map(([severity, count]) => ({
        name: severity.charAt(0).toUpperCase() + severity.slice(1),
        value: count,
        color: SEVERITY_COLORS[severity as keyof typeof SEVERITY_COLORS]
      }));
  }, [reports]);
  // Prepare data for issue type distribution
  const typeData = useMemo(() => {
    const totals: Record<string, number> = {};
    reports.forEach(report => {
      report.results.forEach(result => {
        totals[result.type] = (totals[result.type] || 0) + 1;
      });
    });
    
    return Object.entries(totals).map(([type, count]) => ({
      name: type.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase()),
      value: count,
      color: TYPE_COLORS[type as keyof typeof TYPE_COLORS] || '#6B7280'
    }));
  }, [reports]);

  // Prepare data for file-wise analysis
  const fileData = useMemo(() => {
    return reports.map(report => ({
      name: report.fileName.length > 15 
        ? report.fileName.substring(0, 15) + '...' 
        : report.fileName,
      fullName: report.fileName,
      score: report.summary.score,
      errors: report.summary.errorCount,
      warnings: report.summary.warningCount,
      info: report.summary.infoCount,
      total: report.summary.totalIssues
    }));
  }, [reports]);

  // Prepare radar chart data for workflow health
  const radarData = useMemo(() => {
    if (reports.length === 0) return [];
    
    const avgScore = reports.reduce((sum, r) => sum + r.summary.score, 0) / reports.length;
    const securityScore = Math.max(0, 100 - (reports.reduce((sum, r) => 
      sum + r.results.filter(result => result.type === 'security').length, 0) * 10));
    const performanceScore = Math.max(0, 100 - (reports.reduce((sum, r) => 
      sum + r.results.filter(result => result.type === 'performance').length, 0) * 15));
    const bestPracticeScore = Math.max(0, 100 - (reports.reduce((sum, r) => 
      sum + r.results.filter(result => result.type === 'best-practice').length, 0) * 5));
    const dependencyScore = Math.max(0, 100 - (reports.reduce((sum, r) => 
      sum + r.results.filter(result => result.type === 'dependency').length, 0) * 20));
    const structureScore = Math.max(0, 100 - (reports.reduce((sum, r) => 
      sum + r.results.filter(result => result.type === 'structure').length, 0) * 25));

    return [
      { subject: 'Overall', score: avgScore, fullMark: 100 },
      { subject: 'Security', score: securityScore, fullMark: 100 },
      { subject: 'Performance', score: performanceScore, fullMark: 100 },
      { subject: 'Best Practices', score: bestPracticeScore, fullMark: 100 },
      { subject: 'Dependencies', score: dependencyScore, fullMark: 100 },
      { subject: 'Structure', score: structureScore, fullMark: 100 }
    ];
  }, [reports]);
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-gray-800 p-3 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg transition-colors duration-300">
          <p className="font-medium text-gray-900 dark:text-gray-100 transition-colors duration-300">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ color: entry.color }} className="transition-colors duration-300">
              {entry.name}: {entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
    if (percent < 0.05) return null; // Don't show label for slices smaller than 5%
    
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text 
        x={x} 
        y={y} 
        fill="white" 
        textAnchor={x > cx ? 'start' : 'end'} 
        dominantBaseline="central"
        fontSize="12"
        fontWeight="bold"
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };
  if (reports.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400 transition-colors duration-300">
        <p>No data available for charts</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Overall Health Radar Chart */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 transition-colors duration-300">
        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100 transition-colors duration-300">Workflow Health Overview</h3>
        <ResponsiveContainer width="100%" height={300}>
          <RadarChart data={radarData}>
            <PolarGrid />
            <PolarAngleAxis dataKey="subject" />
            <PolarRadiusAxis 
              angle={90} 
              domain={[0, 100]}
              tick={false}
            />
            <Radar
              name="Score"
              dataKey="score"
              stroke="#3B82F6"
              fill="#3B82F6"
              fillOpacity={0.2}
              strokeWidth={2}
            />
            <Tooltip content={<CustomTooltip />} />
          </RadarChart>
        </ResponsiveContainer>
      </div>      {/* Charts Grid */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Severity Distribution Pie Chart */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 transition-colors duration-300">
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100 transition-colors duration-300">Issues by Severity</h3>
          {severityData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={severityData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={renderCustomLabel}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {severityData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[250px] text-gray-500 dark:text-gray-400 transition-colors duration-300">
              No issues found
            </div>
          )}
        </div>

        {/* Issue Type Distribution */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 transition-colors duration-300">
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100 transition-colors duration-300">Issues by Type</h3>
          {typeData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={typeData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={renderCustomLabel}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {typeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[250px] text-gray-500 dark:text-gray-400 transition-colors duration-300">
              No issues found
            </div>
          )}
        </div>

        {/* File-wise Quality Scores */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 transition-colors duration-300">
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100 transition-colors duration-300">Quality Scores by File</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={fileData} margin={{ top: 5, right: 30, left: 20, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="name" 
                angle={-45}
                textAnchor="end"
                height={80}
                fontSize={12}
              />
              <YAxis domain={[0, 100]} />              <Tooltip 
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-white dark:bg-gray-800 p-3 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg transition-colors duration-300">
                        <p className="font-medium text-gray-900 dark:text-gray-100 transition-colors duration-300">{data.fullName}</p>
                        <p style={{ color: '#3B82F6' }}>Score: {data.score}/100</p>
                        <p style={{ color: '#DC2626' }}>Errors: {data.errors}</p>
                        <p style={{ color: '#D97706' }}>Warnings: {data.warnings}</p>
                        <p style={{ color: '#2563EB' }}>Info: {data.info}</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="score" fill="#3B82F6" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* File-wise Issue Breakdown */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 transition-colors duration-300">
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100 transition-colors duration-300">Issues Breakdown by File</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={fileData} margin={{ top: 5, right: 30, left: 20, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="name" 
                angle={-45}
                textAnchor="end"
                height={80}
                fontSize={12}
              />
              <YAxis />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Bar dataKey="errors" stackId="a" fill="#DC2626" name="Errors" />
              <Bar dataKey="warnings" stackId="a" fill="#D97706" name="Warnings" />
              <Bar dataKey="info" stackId="a" fill="#2563EB" name="Info" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
