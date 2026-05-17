import React from 'react';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend);

const MIME_LABELS = {
  'image/png': 'Images',
  'image/jpeg': 'Images',
  'image/gif': 'Images',
  'image/webp': 'Images',
  'application/pdf': 'PDFs',
  'video/mp4': 'Videos',
  'video/webm': 'Videos',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Docs',
  'application/msword': 'Docs',
  'application/vnd.ms-powerpoint': 'PPT',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PPT',
};

const COLORS = ['#6C63FF', '#00C9A7', '#FF6B6B', '#FFC75F', '#A78BFA', '#34D399'];

const groupTypes = (typeStats) => {
  const grouped = {};
  typeStats.forEach(({ _id, count }) => {
    const label = MIME_LABELS[_id] || 'Others';
    grouped[label] = (grouped[label] || 0) + count;
  });
  return grouped;
};

const FileTypePieChart = ({ typeStats = [] }) => {
  if (!typeStats.length) {
    return (
      <div className="chart-card">
        <h3 className="chart-title">File Types</h3>
        <div className="chart-empty">No files yet</div>
      </div>
    );
  }

  const grouped = groupTypes(typeStats);
  const labels = Object.keys(grouped);
  const values = Object.values(grouped);

  const data = {
    labels,
    datasets: [{
      data: values,
      backgroundColor: COLORS.slice(0, labels.length),
      borderColor: 'rgba(255,255,255,0.08)',
      borderWidth: 2,
    }],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          color: '#94a3b8',
          font: { family: 'Inter', size: 12 },
          padding: 16,
        },
      },
      tooltip: {
        callbacks: {
          label: (ctx) => ` ${ctx.label}: ${ctx.raw} file${ctx.raw !== 1 ? 's' : ''}`,
        },
      },
    },
  };

  return (
    <div className="chart-card">
      <h3 className="chart-title">File Types</h3>
      <div style={{ height: 220, position: 'relative' }}>
        <Doughnut data={data} options={options} />
      </div>
    </div>
  );
};

export default FileTypePieChart;
