// Train Delay Dashboard JavaScript
document.addEventListener('DOMContentLoaded', function () {
  console.log('🚂 Train Delay Dashboard loaded');

  // DOM elements
  const chartElement = document.getElementById('chart');
  const chartLabelsElement = document.getElementById('chart-labels');
  const totalEntriesElement = document.getElementById('total-entries');
  const avgDelayElement = document.getElementById('avg-delay');
  const totalTrainsElement = document.getElementById('total-trains');

  // Recent stats elements
  const recentTimestampElement = document.getElementById('recent-timestamp');
  const recentOnTimeElement = document.getElementById('recent-on-time');
  const recentMinorDelayElement = document.getElementById('recent-minor-delay');
  const recentMajorDelayElement = document.getElementById('recent-major-delay');
  const recentTotalTrainsElement = document.getElementById('recent-total-trains');
  const recentDelayPercentElement = document.getElementById('recent-delay-percent');

  // Fetch and render train data
  async function loadTrainData() {
    try {
      const response = await fetch('/api/trains');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('📊 Loaded train data:', data);

      if (data.length === 0) {
        chartElement.innerHTML = '<div class="loading">No data available for the last 24 hours</div>';
        return;
      }

      renderChart(data);
      updateStats(data);
      updateRecentStats(data);

    } catch (error) {
      console.error('❌ Error loading train data:', error);
      chartElement.innerHTML = '<div class="loading">Error loading data. Please try again.</div>';
    }
  }

  // Render the bar chart
  function renderChart(data) {
    // Clear loading message
    chartElement.innerHTML = '';
    chartLabelsElement.innerHTML = '';

    // Find the maximum total for scaling
    const maxTotal = Math.max(...data.map(entry => entry.delay0 + entry.delay1 + entry.delay2));

    // Create bars for each data entry
    data.forEach((entry, index) => {
      const chartBar = document.createElement('div');
      chartBar.className = 'chart-bar';

      // Create stacked bar container
      const barStack = document.createElement('div');
      barStack.className = 'bar-stack';

      // Calculate heights as percentages of max total
      const delay0Height = (entry.delay0 / maxTotal) * 300; // 300px max height
      const delay1Height = (entry.delay1 / maxTotal) * 300;
      const delay2Height = (entry.delay2 / maxTotal) * 300;

      // Create individual bars (stacked from bottom to top)
      const delay2Bar = document.createElement('div');
      delay2Bar.className = 'bar delay-2';
      delay2Bar.style.height = `${delay2Height}px`;
      delay2Bar.setAttribute('data-value', `Major Delays: ${entry.delay2}`);

      const delay1Bar = document.createElement('div');
      delay1Bar.className = 'bar delay-1';
      delay1Bar.style.height = `${delay1Height}px`;
      delay1Bar.setAttribute('data-value', `Minor Delays: ${entry.delay1}`);

      const delay0Bar = document.createElement('div');
      delay0Bar.className = 'bar delay-0';
      delay0Bar.style.height = `${delay0Height}px`;
      delay0Bar.setAttribute('data-value', `On Time: ${entry.delay0}`);

      // Stack bars (delay2 on top, then delay1, then delay0 at bottom)
      barStack.appendChild(delay2Bar);
      barStack.appendChild(delay1Bar);
      barStack.appendChild(delay0Bar);

      chartBar.appendChild(barStack);
      chartElement.appendChild(chartBar);

      // Create time label
      const label = document.createElement('div');
      label.className = 'chart-label';
      const date = new Date(entry.timeStamp);
      const timeString = date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });

      label.textContent = `${timeString} (${entry.delay2} / ${entry.delay1} / ${entry.delay0})`;
      chartLabelsElement.appendChild(label);
    });
  }

  // Update statistics
  function updateStats(data) {
    if (data.length === 0) return;

    // Calculate totals
    const totalEntries = data.length;
    const totalTrains = data.reduce((sum, entry) => sum + entry.trainsCount, 0);
    const avgTrainsPerEntry = Math.round(totalTrains / totalEntries);

    // Calculate average delay percentage
    const avgDelayPercent = data.reduce((sum, entry) => sum + entry.delayPercent, 0) / data.length;

    // Update DOM
    totalEntriesElement.textContent = totalEntries;
    avgDelayElement.textContent = `${avgDelayPercent.toFixed(1)}%`;
    totalTrainsElement.textContent = formatNumber(avgTrainsPerEntry);
  }

  // Update recent statistics (most recent data entry)
  function updateRecentStats(data) {
    if (data.length === 0) return;

    // Get the most recent entry (last in the array, assuming data is sorted by timestamp)
    const recentEntry = data[data.length - 1];

    // Format timestamp
    const date = new Date(recentEntry.timeStamp);
    const timeString = date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    // Update DOM elements
    recentTimestampElement.textContent = timeString;
    recentOnTimeElement.textContent = formatNumber(recentEntry.delay0);
    recentMinorDelayElement.textContent = formatNumber(recentEntry.delay1);
    recentMajorDelayElement.textContent = formatNumber(recentEntry.delay2);
    recentTotalTrainsElement.textContent = formatNumber(recentEntry.trainsCount);
    recentDelayPercentElement.textContent = `${recentEntry.delayPercent.toFixed(1)}%`;

    console.log('📊 Updated recent stats for:', timeString);
  }

  // Format numbers with commas
  function formatNumber(num) {
    return num.toLocaleString();
  }

  // Initialize the dashboard
  loadTrainData();

  // Auto-refresh every 5 minutes
  setInterval(loadTrainData, 5 * 60 * 1000);

  console.log('📈 Chart rendering system initialized');
});