import React from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const getUploadTrend = (files) => {
  const trend = {};
  
  // Initialize the last 7 days with 0 counts
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    trend[dateStr] = 0;
  }

  // Aggregate counts from files list
  files.forEach(f => {
    if (!f.createdAt) return;
    const dateStr = new Date(f.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (trend[dateStr] !== undefined) {
      trend[dateStr]++;
    }
  });

  return trend;
};

const UploadTrendLineChart = ({ files = [] }) => {
  const activeFiles = files.filter(f => !f.isTrashed);

  if (!activeFiles.length) {
    return (
      <div className="chart-card">
        <h3 className="chart-title">Upload Activity Trend</h3>
        <div className="chart-empty">No files uploaded yet</div>
      </div>
    );
  }

  const trendData = getUploadTrend(activeFiles);
  const labels = Object.keys(trendData);
  const values = Object.values(trendData);

  const data = {
    labels,
    datasets: [{
      label: 'Files Uploaded',
      data: values,
      fill: true,
      borderColor: '#6C63FF',
      backgroundColor: 'rgba(108, 99, 255, 0.15)',
      tension: 0.4, // Smooth curved lines
      borderWidth: 3,
      pointBackgroundColor: '#6C63FF',
      pointBorderColor: 'rgba(255,255,255,0.8)',
      pointBorderWidth: 2,
      pointRadius: 5,
      pointHoverRadius: 7,
    }],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: (ctx) => ` ${ctx.raw} file${ctx.raw !== 1 ? 's' : ''} uploaded`,
        },
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
        ticks: {
          color: '#94a3b8',
          font: { family: 'Inter', size: 10 },
        },
      },
      y: {
        grid: {
          color: 'rgba(255, 255, 255, 0.05)',
        },
        ticks: {
          color: '#94a3b8',
          font: { family: 'Inter', size: 10 },
          stepSize: 1,
          precision: 0,
        },
        min: 0,
      },
    },
  };

  return (
    <div className="chart-card">
      <h3 className="chart-title">Upload Activity Trend (Last 7 Days)</h3>
      <div style={{ height: 220, position: 'relative' }}>
        <Line data={data} options={options} />
      </div>
    </div>
  );
};

export default UploadTrendLineChart;
