// Train Delay Dashboard JavaScript
document.addEventListener('DOMContentLoaded', function () {
  console.log('🚂 Train Delay Dashboard loaded');

  // DOM elements - 24h view
  const chartElement = document.getElementById('chart');
  const chartLabelsElement = document.getElementById('chart-labels');
  const totalEntriesElement = document.getElementById('total-entries');
  const avgDelayElement = document.getElementById('avg-delay');
  const totalTrainsElement = document.getElementById('total-trains');

  // DOM elements - yearly + monthly views
  const yearlyChartElement = document.getElementById('yearly-chart');
  const yearlyChartLabelsElement = document.getElementById('yearly-chart-labels');
  const monthlyChartsElement = document.getElementById('monthly-charts');
  const bestChartElement = document.getElementById('best-chart');
  const bestChartLabelsElement = document.getElementById('best-chart-labels');
  const worstChartElement = document.getElementById('worst-chart');
  const worstChartLabelsElement = document.getElementById('worst-chart-labels');
  const weekdayChartElement = document.getElementById('weekday-chart');
  const weekdayChartLabelsElement = document.getElementById('weekday-chart-labels');
  const hourlyChartElement = document.getElementById('hourly-chart');
  const hourlyChartLabelsElement = document.getElementById('hourly-chart-labels');

  // Recent stats elements
  const recentTimestampElement = document.getElementById('recent-timestamp');
  const recentOnTimeElement = document.getElementById('recent-on-time');
  const recentMinorDelayElement = document.getElementById('recent-minor-delay');
  const recentMajorDelayElement = document.getElementById('recent-major-delay');
  const recentTotalTrainsElement = document.getElementById('recent-total-trains');
  const recentDelayPercentElement = document.getElementById('recent-delay-percent');

  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const WEEKDAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const pad2 = (n) => String(n).padStart(2, '0');

  // Render a stacked bar chart into the given chart + labels containers.
  // labelFormatter receives (entry, index) and returns the label string.
  // maxBarHeight controls the pixel height available for the tallest bar stack.
  function renderChart(chartEl, labelsEl, data, labelFormatter, maxBarHeight = 300) {
    chartEl.innerHTML = '';
    labelsEl.innerHTML = '';

    if (!data || data.length === 0) {
      chartEl.innerHTML = '<div class="loading">No data</div>';
      return;
    }

    const totals = data.map(entry => entry.delay0 + entry.delay1 + entry.delay2);
    const maxTotal = Math.max(...totals, 1);

    data.forEach((entry, index) => {
      const chartBar = document.createElement('div');
      chartBar.className = 'chart-bar';

      const barStack = document.createElement('div');
      barStack.className = 'bar-stack';

      const delay0Height = (entry.delay0 / maxTotal) * maxBarHeight;
      const delay1Height = (entry.delay1 / maxTotal) * maxBarHeight;
      const delay2Height = (entry.delay2 / maxTotal) * maxBarHeight;

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

      barStack.appendChild(delay2Bar);
      barStack.appendChild(delay1Bar);
      barStack.appendChild(delay0Bar);

      chartBar.appendChild(barStack);
      chartEl.appendChild(chartBar);

      const label = document.createElement('div');
      label.className = 'chart-label';
      label.textContent = labelFormatter(entry, index);
      labelsEl.appendChild(label);
    });
  }

  // 24h chart label formatter
  function formatHourlyLabel(entry) {
    const date = new Date(entry.timeStamp);
    const timeString = date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    return `${timeString} (${entry.delay2} / ${entry.delay1} / ${entry.delay0})`;
  }

  // Yearly chart label formatter (one bar per month)
  function formatMonthLabel(entry) {
    const date = new Date(entry.timeStamp);
    return `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
  }

  // Monthly chart label formatter (one bar per day)
  function formatDayLabel(entry) {
    const date = new Date(entry.timeStamp);
    return String(date.getDate());
  }

  function isEmptyExtremeEntry(entry) {
    return entry.delay0 === 0 && entry.delay1 === 0 && entry.delay2 === 0 && entry.trainsCount === 0;
  }

  // Best-day chart label formatter — shows month + day of the picked sample,
  // or just the month with a placeholder if no qualifying data exists for that month.
  function formatExtremeLabel(entry) {
    const date = new Date(entry.timeStamp);
    const monthLabel = `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
    return isEmptyExtremeEntry(entry) ? `${monthLabel} (—)` : `${monthLabel} (${date.getDate()})`;
  }

  // Worst-day chart label formatter — shows full timestamp of the worst reading
  // in dd-mm-yyyy hh:mm format, with month-only placeholder when no data exists.
  function formatWorstExtremeLabel(entry) {
    const date = new Date(entry.timeStamp);
    if (isEmptyExtremeEntry(entry)) {
      return `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()} (—)`;
    }
    return `${pad2(date.getDate())}-${pad2(date.getMonth() + 1)}-${date.getFullYear()} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  }

  // Weekday chart label formatter — e.g. "Mon 00-04"
  function formatWeekdayLabel(entry) {
    return `${WEEKDAY_NAMES[entry.dayOfWeek]} ${pad2(entry.hourFrom)}-${pad2(entry.hourTo)}`;
  }

  // Hourly chart label formatter — e.g. "00:00"
  function formatHourLabel(entry) {
    return `${pad2(entry.hour)}:00`;
  }

  // Fetch and render 24h train data
  async function loadTrainData() {
    try {
      const response = await fetch('/api/trains');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('📊 Loaded 24h train data:', data);

      if (data.length === 0) {
        chartElement.innerHTML = '<div class="loading">No data available for the last 24 hours</div>';
        return;
      }

      renderChart(chartElement, chartLabelsElement, data, formatHourlyLabel, 300);
      updateStats(data);
      updateRecentStats(data);

    } catch (error) {
      console.error('❌ Error loading 24h train data:', error);
      chartElement.innerHTML = '<div class="loading">Error loading data. Please try again.</div>';
    }
  }

  // Fetch and render yearly + 12 monthly daily charts
  async function loadYearlyData() {
    try {
      const response = await fetch('/api/trains/yearly');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const yearlyData = await response.json();
      console.log('📅 Loaded yearly data:', yearlyData);

      renderChart(yearlyChartElement, yearlyChartLabelsElement, yearlyData, formatMonthLabel, 300);
      renderMonthlyCharts(yearlyData);
    } catch (error) {
      console.error('❌ Error loading yearly data:', error);
      yearlyChartElement.innerHTML = '<div class="loading">Error loading yearly data.</div>';
      monthlyChartsElement.innerHTML = '<div class="loading">Error loading monthly data.</div>';
    }
  }

  // Fetch and render weekday-by-4h-band chart (whole dataset)
  async function loadWeekdayData() {
    try {
      const response = await fetch('/api/trains/weekday');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      console.log('🗓️ Loaded weekday data:', data);
      renderChart(weekdayChartElement, weekdayChartLabelsElement, data, formatWeekdayLabel, 300);
    } catch (error) {
      console.error('❌ Error loading weekday data:', error);
      weekdayChartElement.innerHTML = '<div class="loading">Error loading weekday data.</div>';
    }
  }

  // Fetch and render hour-of-day chart (whole dataset)
  async function loadHourlyData() {
    try {
      const response = await fetch('/api/trains/hourly');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      console.log('⏰ Loaded hourly data:', data);
      renderChart(hourlyChartElement, hourlyChartLabelsElement, data, formatHourLabel, 300);
    } catch (error) {
      console.error('❌ Error loading hourly data:', error);
      hourlyChartElement.innerHTML = '<div class="loading">Error loading hourly data.</div>';
    }
  }

  // Fetch and render best/worst-day-per-month charts
  async function loadMonthlyExtremes() {
    try {
      const response = await fetch('/api/trains/yearly/extremes');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const { best, worst } = await response.json();
      console.log('🏅 Loaded monthly extremes:', { best, worst });
      renderChart(bestChartElement, bestChartLabelsElement, best, formatExtremeLabel, 300);
      renderChart(worstChartElement, worstChartLabelsElement, worst, formatWorstExtremeLabel, 300);
    } catch (error) {
      console.error('❌ Error loading monthly extremes:', error);
      bestChartElement.innerHTML = '<div class="loading">Error loading best-day data.</div>';
      worstChartElement.innerHTML = '<div class="loading">Error loading worst-day data.</div>';
    }
  }

  // Build a card per month and fetch its daily data
  function renderMonthlyCharts(yearlyData) {
    monthlyChartsElement.innerHTML = '';

    const months = yearlyData.map(entry => {
      const date = new Date(entry.timeStamp);
      return {
        year: date.getFullYear(),
        month: date.getMonth(),
        title: `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`,
        key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      };
    });

    months.forEach(({ title, key }) => {
      const card = document.createElement('div');
      card.className = 'monthly-chart-card';

      const heading = document.createElement('h3');
      heading.textContent = title;
      card.appendChild(heading);

      const chartContainer = document.createElement('div');
      chartContainer.className = 'chart-container';

      const chart = document.createElement('div');
      chart.className = 'chart mini';
      chart.innerHTML = '<div class="loading">Loading...</div>';

      const labels = document.createElement('div');
      labels.className = 'chart-labels';

      chartContainer.appendChild(chart);
      chartContainer.appendChild(labels);
      card.appendChild(chartContainer);
      monthlyChartsElement.appendChild(card);

      fetch(`/api/trains/monthly?month=${key}`)
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then(daily => {
          renderChart(chart, labels, daily, formatDayLabel, 140);
        })
        .catch(err => {
          console.error(`❌ Error loading ${key}:`, err);
          chart.innerHTML = '<div class="loading">Error</div>';
        });
    });
  }

  // Update statistics
  function updateStats(data) {
    if (data.length === 0) return;

    const totalEntries = data.length;
    const totalTrains = data.reduce((sum, entry) => sum + entry.trainsCount, 0);
    const avgTrainsPerEntry = Math.round(totalTrains / totalEntries);

    const avgDelayPercent = data.reduce((sum, entry) => sum + entry.delayPercent, 0) / data.length;

    totalEntriesElement.textContent = totalEntries;
    avgDelayElement.textContent = `${avgDelayPercent.toFixed(1)}%`;
    totalTrainsElement.textContent = formatNumber(avgTrainsPerEntry);
  }

  // Update recent statistics (most recent data entry)
  function updateRecentStats(data) {
    if (data.length === 0) return;

    const recentEntry = data[data.length - 1];

    const date = new Date(recentEntry.timeStamp);
    const timeString = date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    recentTimestampElement.textContent = timeString;
    recentOnTimeElement.textContent = formatNumber(recentEntry.delay0);
    recentMinorDelayElement.textContent = formatNumber(recentEntry.delay1);
    recentMajorDelayElement.textContent = formatNumber(recentEntry.delay2);
    recentTotalTrainsElement.textContent = formatNumber(recentEntry.trainsCount);
    recentDelayPercentElement.textContent = `${recentEntry.delayPercent.toFixed(1)}%`;

    console.log('📊 Updated recent stats for:', timeString);
  }

  function formatNumber(num) {
    return num.toLocaleString();
  }

  loadTrainData();
  loadYearlyData();
  loadMonthlyExtremes();
  loadWeekdayData();
  loadHourlyData();

  // Auto-refresh every 5 minutes
  setInterval(loadTrainData, 5 * 60 * 1000);
  setInterval(loadYearlyData, 30 * 60 * 1000);
  setInterval(loadMonthlyExtremes, 30 * 60 * 1000);

  console.log('📈 Chart rendering system initialized');
});
