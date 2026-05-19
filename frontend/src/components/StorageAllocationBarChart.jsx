import React from 'react';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

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

const groupSizes = (typeStats) => {
  const grouped = {};
  typeStats.forEach(({ _id, size = 0 }) => {
    const label = MIME_LABELS[_id] || 'Others';
    // Convert to Megabytes (MB)
    const mb = size / (1024 * 1024);
    grouped[label] = (grouped[label] || 0) + mb;
  });
  return grouped;
};

const StorageAllocationBarChart = ({ typeStats = [] }) => {
  if (!typeStats.length) {
    return (
      <div className="chart-card">
        <h3 className="chart-title">Storage Allocation</h3>
        <div className="chart-empty">No files yet</div>
      </div>
    );
  }

  const grouped = groupSizes(typeStats);
  const labels = Object.keys(grouped);
  const values = Object.values(grouped).map(v => Number(v.toFixed(2)));

  const data = {
    labels,
    datasets: [{
      label: 'Storage Used (MB)',
      data: values,
      backgroundColor: 'rgba(0, 201, 167, 0.75)',
      borderColor: '#00C9A7',
      borderWidth: 2,
      borderRadius: 8,
      hoverBackgroundColor: 'rgba(0, 201, 167, 0.95)',
    }],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y', // Makes the bar chart horizontal and highly legible
    plugins: {
      legend: {
        display: false, // Clean layout without redundant legend
      },
      tooltip: {
        callbacks: {
          label: (ctx) => ` ${ctx.raw} MB`,
        },
      },
    },
    scales: {
      x: {
        grid: {
          color: 'rgba(255, 255, 255, 0.05)',
        },
        ticks: {
          color: '#94a3b8',
          font: { family: 'Inter', size: 10 },
        },
      },
      y: {
        grid: {
          display: false,
        },
        ticks: {
          color: '#94a3b8',
          font: { family: 'Inter', size: 11, weight: '500' },
        },
      },
    },
  };

  return (
    <div className="chart-card">
      <h3 className="chart-title">Storage Allocation (MB)</h3>
      <div style={{ height: 220, position: 'relative' }}>
        <Bar data={data} options={options} />
      </div>
    </div>
  );
};

export default StorageAllocationBarChart;
