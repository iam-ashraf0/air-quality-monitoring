// dashboard.js
class AirQualityDashboard {
    constructor() {
        this.aqiChart = null;
        this.pollutantChart = null;
        this.aqiDistributionChart = null;
        this.pollutantContributionChart = null;
        this.pollutantComparisonChart = null;
        this.pollutantDistributionChart = null;
        this.updateInterval = null;
        this.currentTimeRange = 'hourly';
        this.currentPollutantRange = 'hourly';
        
        this.aqiColors = {
            'Good': '#00E400',
            'Moderate': '#FFFF00',
            'Unhealthy for Sensitive Groups': '#FF7E00',
            'Unhealthy': '#FF0000',
            'Very Unhealthy': '#8F3F97',
            'Hazardous': '#7E0023'
        };
        
        this.init();
    }
    
    init() {
        console.log('🚀 Initializing Air Quality Dashboard...');
        
        this.initializeCharts();
        this.initializePollutantCharts();
        this.setupEventListeners();
        this.setupPollutantEventListeners();
        this.startDataUpdates();
        
        this.updateCurrentData();
        this.updateChartData();
        this.updatePollutantData();
        this.updateStatistics();
        this.checkSensorStatus();
    }
    
    setupEventListeners() {
        const timeRangeButtons = document.querySelectorAll('input[name="timeRange"]');
        timeRangeButtons.forEach(button => {
            button.addEventListener('change', (e) => {
                this.currentTimeRange = e.target.value;
                this.updateChartData();
            });
        });

        const refreshBtn = document.getElementById('refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.forceUpdate();
            });
        }
    }

    setupPollutantEventListeners() {
        const pollutantRangeButtons = document.querySelectorAll('input[name="pollutantRange"]');
        pollutantRangeButtons.forEach(button => {
            button.addEventListener('change', (e) => {
                this.currentPollutantRange = e.target.value;
                this.updatePollutantData();
            });
        });
    }
    
    initializeCharts() {
        const aqiCtx = document.getElementById('aqiChart');
        if (aqiCtx) {
            this.aqiChart = new Chart(aqiCtx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: 'AQI',
                        data: [],
                        borderColor: '#007bff',
                        backgroundColor: 'rgba(0, 123, 255, 0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.4,
                        pointBackgroundColor: '#007bff',
                        pointBorderColor: '#ffffff',
                        pointBorderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            mode: 'index',
                            intersect: false,
                            callbacks: {
                                afterLabel: (context) => {
                                    const aqi = context.parsed.y;
                                    return this.getAQICategory(aqi);
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            max: 300,
                            ticks: {
                                callback: function(value) {
                                    return value + ' AQI';
                                }
                            },
                            grid: {
                                color: 'rgba(0, 0, 0, 0.1)'
                            }
                        },
                        x: {
                            display: true,
                            title: { display: true, text: 'Time' },
                            grid: {
                                color: 'rgba(0, 0, 0, 0.1)'
                            }
                        }
                    },
                    elements: {
                        point: { radius: 3, hoverRadius: 6 }
                    },
                    interaction: {
                        mode: 'nearest',
                        axis: 'x',
                        intersect: false
                    }
                }
            });
        }
        
        const pollutantCtx = document.getElementById('pollutantChart');
        if (pollutantCtx) {
            this.pollutantChart = new Chart(pollutantCtx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [
                        { 
                            label: 'PM2.5 (µg/m³)', 
                            data: [], 
                            borderColor: '#dc3545', 
                            backgroundColor: 'rgba(220, 53, 69, 0.1)', 
                            borderWidth: 2, 
                            fill: true,
                            tension: 0.4 
                        },
                        { 
                            label: 'PM10 (µg/m³)', 
                            data: [], 
                            borderColor: '#fd7e14', 
                            backgroundColor: 'rgba(253, 126, 20, 0.1)', 
                            borderWidth: 2, 
                            fill: true,
                            tension: 0.4 
                        },
                        { 
                            label: 'CO₂ (ppm)', 
                            data: [], 
                            borderColor: '#ffc107', 
                            backgroundColor: 'rgba(255, 193, 7, 0.1)', 
                            borderWidth: 2, 
                            fill: false, 
                            yAxisID: 'y1',
                            tension: 0.4 
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { 
                        legend: { 
                            position: 'top',
                            labels: {
                                usePointStyle: true,
                                padding: 20
                            }
                        } 
                    },
                    scales: {
                        y: { 
                            type: 'linear', 
                            display: true, 
                            position: 'left', 
                            title: { display: true, text: 'PM2.5 / PM10 (µg/m³)' },
                            grid: {
                                color: 'rgba(0, 0, 0, 0.1)'
                            }
                        },
                        y1: { 
                            type: 'linear', 
                            display: true, 
                            position: 'right', 
                            title: { display: true, text: 'CO₂ (ppm)' }, 
                            grid: { drawOnChartArea: false } 
                        },
                        x: { 
                            display: true, 
                            title: { display: true, text: 'Time' },
                            grid: {
                                color: 'rgba(0, 0, 0, 0.1)'
                            }
                        }
                    },
                    interaction: {
                        mode: 'nearest',
                        axis: 'x',
                        intersect: false
                    }
                }
            });
        }

        const aqiDistributionCtx = document.getElementById('aqiDistributionChart');
        if (aqiDistributionCtx) {
            this.aqiDistributionChart = new Chart(aqiDistributionCtx, {
                type: 'doughnut',
                data: {
                    labels: Object.keys(this.aqiColors),
                    datasets: [{
                        data: [0, 0, 0, 0, 0, 0],
                        backgroundColor: Object.values(this.aqiColors),
                        borderWidth: 2,
                        borderColor: '#fff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                padding: 20,
                                usePointStyle: true
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const label = context.label || '';
                                    const value = context.parsed;
                                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                    const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
                                    return `${label}: ${value} (${percentage}%)`;
                                }
                            }
                        }
                    },
                    cutout: '60%'
                }
            });
        }

        const pollutantContributionCtx = document.getElementById('pollutantContributionChart');
        if (pollutantContributionCtx) {
            this.pollutantContributionChart = new Chart(pollutantContributionCtx, {
                type: 'bar',
                data: {
                    labels: ['PM2.5', 'PM10', 'CO₂', 'CO', 'VOC'],
                    datasets: [{
                        label: 'Contribution to AQI',
                        data: [25, 20, 15, 10, 30],
                        backgroundColor: [
                            'rgba(220, 53, 69, 0.8)',
                            'rgba(253, 126, 20, 0.8)',
                            'rgba(255, 193, 7, 0.8)',
                            'rgba(108, 117, 125, 0.8)',
                            'rgba(40, 167, 69, 0.8)'
                        ],
                        borderColor: [
                            '#dc3545',
                            '#fd7e14',
                            '#ffc107',
                            '#6c757d',
                            '#28a745'
                        ],
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: 'Contribution Level'
                            },
                            grid: {
                                color: 'rgba(0, 0, 0, 0.1)'
                            }
                        },
                        x: {
                            grid: {
                                display: false
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            display: false
                        }
                    }
                }
            });
        }
    }

    initializePollutantCharts() {
        // Pollutant Comparison Chart (Bar Chart)
        const comparisonCtx = document.getElementById('pollutantComparisonChart');
        if (comparisonCtx) {
            this.pollutantComparisonChart = new Chart(comparisonCtx, {
                type: 'bar',
                data: {
                    labels: ['PM2.5', 'PM10', 'CO₂', 'CO', 'VOC'],
                    datasets: [{
                        label: 'Current Levels',
                        data: [0, 0, 0, 0, 0],
                        backgroundColor: [
                            'rgba(220, 53, 69, 0.8)',
                            'rgba(253, 126, 20, 0.8)',
                            'rgba(23, 162, 184, 0.8)',
                            'rgba(108, 117, 125, 0.8)',
                            'rgba(40, 167, 69, 0.8)'
                        ],
                        borderColor: [
                            '#dc3545',
                            '#fd7e14',
                            '#17a2b8',
                            '#6c757d',
                            '#28a745'
                        ],
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: 'Concentration'
                            },
                            grid: {
                                color: 'rgba(0, 0, 0, 0.1)'
                            }
                        },
                        x: {
                            grid: {
                                display: false
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            display: false
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const value = context.parsed.y;
                                    let unit = '';
                                    switch(context.label) {
                                        case 'PM2.5':
                                        case 'PM10':
                                            unit = 'µg/m³';
                                            break;
                                        case 'CO₂':
                                        case 'CO':
                                            unit = 'ppm';
                                            break;
                                        case 'VOC':
                                            unit = 'index';
                                            break;
                                    }
                                    return `${value} ${unit}`;
                                }
                            }
                        }
                    }
                }
            });
        }

        // Pollutant Distribution Chart (Doughnut)
        const distributionCtx = document.getElementById('pollutantDistributionChart');
        if (distributionCtx) {
            this.pollutantDistributionChart = new Chart(distributionCtx, {
                type: 'doughnut',
                data: {
                    labels: ['PM2.5', 'PM10', 'CO₂', 'Other'],
                    datasets: [{
                        data: [25, 25, 25, 25],
                        backgroundColor: [
                            'rgba(220, 53, 69, 0.8)',
                            'rgba(253, 126, 20, 0.8)',
                            'rgba(23, 162, 184, 0.8)',
                            'rgba(108, 117, 125, 0.8)'
                        ],
                        borderColor: '#fff',
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                padding: 20,
                                usePointStyle: true
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const label = context.label;
                                    const value = context.parsed;
                                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                    const percentage = Math.round((value / total) * 100);
                                    return `${label}: ${percentage}%`;
                                }
                            }
                        }
                    },
                    cutout: '60%'
                }
            });
        }
    }
    
    startDataUpdates() {
        this.updateInterval = setInterval(() => {
            this.updateCurrentData();
            this.updateChartData();
            this.updatePollutantData();
        }, 30000);
        
        setInterval(() => {
            this.updateStatistics();
        }, 300000);

        setInterval(() => {
            this.checkSensorStatus();
        }, 60000);
    }
    
    async updateCurrentData() {
        try {
            const response = await fetch('/api/current');
            const result = await response.json();
            
            if (result.success) {
                const data = result.data;
                this.updateCurrentDisplays(data);
                this.updateStatusIndicator(true);
                this.checkForAlerts(data);
                this.updateLastUpdateTime();
            } else {
                console.error('Failed to fetch current data:', result.error);
                this.updateStatusIndicator(false);
            }
        } catch (error) {
            console.error('Error fetching current data:', error);
            this.updateStatusIndicator(false);
        }
    }
    
    updateCurrentDisplays(data) {
        // Update AQI display
        const aqiContainer = document.getElementById('current-aqi-container');
        if (aqiContainer) {
            aqiContainer.innerHTML = `
                <div class="aqi-display" style="color: ${data.aqi_color || '#6c757d'};">
                    <div class="display-1 fw-bold">${data.aqi || '--'}</div>
                    <div class="h4">${data.aqi_category || 'No Data'}</div>
                </div>
            `;
        }
        
        // Update all sensor displays with animation
        const elements = {
            // Quick stats
            'pm25-value': data.pm25,
            'pm10-value': data.pm10,
            'dust-value': data.dust_gp2y,
            'co2-value': data.co2,
            'co-value': data.co,
            'nh3-value': data.nh3,
            'voc-value': data.voc,
            'nox-value': data.nox,
            'temperature-value': data.temperature,
            
            // Detailed sensors
            'pm25-value-detailed': data.pm25,
            'pm10-value-detailed': data.pm10,
            'dust-value-detailed': data.dust_gp2y,
            'co2-value-detailed': data.co2,
            'co-value-detailed': data.co,
            'nh3-value-detailed': data.nh3,
            'voc-value-detailed': data.voc,
            'nox-value-detailed': data.nox,
            'temperature-value-detailed': data.temperature,
            'humidity-value-detailed': data.humidity,
            'pressure-value-detailed': data.pressure
        };
        
        for (const [id, value] of Object.entries(elements)) {
            const element = document.getElementById(id);
            if (element) {
                // Add update animation
                element.classList.add('sensor-value-update');
                element.textContent = value !== undefined && value !== null ? value : '--';
                setTimeout(() => {
                    element.classList.remove('sensor-value-update');
                }, 1000);
            }
        }
        
        // Update humidity and pressure with units
        const humidityDisplay = document.getElementById('humidity-display');
        if (humidityDisplay && data.humidity !== undefined) {
            humidityDisplay.textContent = `${data.humidity}%`;
        }
        
        const pressureDisplay = document.getElementById('pressure-display');
        if (pressureDisplay && data.pressure !== undefined) {
            pressureDisplay.textContent = `${data.pressure} hPa`;
        }
        
        // Update health recommendations
        this.updateHealthRecommendations(data);
    }

    updateHealthRecommendations(data) {
        const healthRecs = document.getElementById('health-recommendations');
        if (healthRecs) {
            const alertClass = data.is_alert ? 'alert-warning' : 'alert-success';
            const alertIcon = data.is_alert ? 'exclamation-triangle' : 'check-circle';
            
            healthRecs.innerHTML = `
                <div class="alert ${alertClass}">
                    <i class="fas fa-${alertIcon} me-2"></i>
                    ${data.health_recommendation || 'No specific recommendations at this time.'}
                </div>
            `;
        }
    }
    
    async updateChartData() {
        try {
            const response = await fetch(`/api/history?range=${this.currentTimeRange}`);
            const result = await response.json();
            
            if (result.success && result.data) {
                this.updateCharts(result.data);
                this.updateDistributionCharts(result.data);
            }
        } catch (error) {
            console.error('Error fetching chart data:', error);
        }
    }
    
    updateCharts(data) {
        if (!data || data.length === 0) return;
        
        const labels = data.map(item => {
            // Format timestamp based on time range
            const date = new Date(item.timestamp);
            switch(this.currentTimeRange) {
                case 'hourly':
                    return date.toLocaleTimeString();
                case 'daily':
                    return date.toLocaleDateString();
                case 'weekly':
                    return date.toLocaleDateString();
                case 'monthly':
                    return date.toLocaleDateString();
                default:
                    return date.toLocaleTimeString();
            }
        });
        
        const aqiData = data.map(item => item.aqi);
        const pm25Data = data.map(item => item.pm25);
        const pm10Data = data.map(item => item.pm10);
        const co2Data = data.map(item => item.co2);
        
        if (this.aqiChart) {
            this.aqiChart.data.labels = labels;
            this.aqiChart.data.datasets[0].data = aqiData;
            
            const colors = aqiData.map(aqi => this.getAQIColor(aqi));
            this.aqiChart.data.datasets[0].pointBackgroundColor = colors;
            this.aqiChart.data.datasets[0].pointBorderColor = colors;
            
            this.aqiChart.update('none');
        }
        
        if (this.pollutantChart) {
            this.pollutantChart.data.labels = labels;
            this.pollutantChart.data.datasets[0].data = pm25Data;
            this.pollutantChart.data.datasets[1].data = pm10Data;
            this.pollutantChart.data.datasets[2].data = co2Data;
            this.pollutantChart.update('none');
        }
    }

    updateDistributionCharts(data) {
        if (!data || data.length === 0) return;

        // Update AQI Distribution
        if (this.aqiDistributionChart) {
            const aqiCategories = Object.keys(this.aqiColors);
            const distribution = aqiCategories.map(category => {
                return data.filter(item => this.getAQICategory(item.aqi) === category).length;
            });
            
            this.aqiDistributionChart.data.datasets[0].data = distribution;
            this.aqiDistributionChart.update('none');
        }

        // Update Pollutant Contribution (simulated data)
        if (this.pollutantContributionChart) {
            const contributionData = [25, 20, 15, 10, 30]; // Example percentages
            this.pollutantContributionChart.data.datasets[0].data = contributionData;
            this.pollutantContributionChart.update('none');
        }
    }

    // New method to update pollutant data
    async updatePollutantData() {
        try {
            // For now, use the same data as current data
            const response = await fetch('/api/current');
            const result = await response.json();
            
            if (result.success && result.data) {
                this.updatePollutantDisplays(result.data);
                this.updatePollutantCharts(result.data);
                this.updatePollutantSafetyLevels(result.data);
                this.updatePollutantTrends(result.data);
            }
        } catch (error) {
            console.error('Error fetching pollutant data:', error);
            // Fallback to basic data
            this.updatePollutantWithFallbackData();
        }
    }

    // Update pollutant displays
    updatePollutantDisplays(data) {
        const elements = {
            'pm25-level': data.pm25 || '--',
            'pm10-level': data.pm10 || '--',
            'co2-level': data.co2 || '--',
            'pollutant-aqi': data.aqi || '--',
            'pm25-status': this.getPollutantStatus(data.pm25, 'pm25'),
            'pm10-status': this.getPollutantStatus(data.pm10, 'pm10'),
            'co2-status': this.getPollutantStatus(data.co2, 'co2'),
            'pollutant-category': data.aqi_category || '--'
        };

        for (const [id, value] of Object.entries(elements)) {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = value;
                
                // Add status classes for color coding
                if (id.includes('-status')) {
                    element.className = '';
                    if (value === 'Good' || value === 'Safe') {
                        element.classList.add('status-good');
                    } else if (value === 'Moderate') {
                        element.classList.add('status-moderate');
                    } else if (value === 'Unhealthy' || value === 'Poor') {
                        element.classList.add('status-poor');
                    }
                }
            }
        }
    }

    // Update pollutant charts
    updatePollutantCharts(data) {
        if (!data) return;

        // Update comparison chart
        if (this.pollutantComparisonChart) {
            const comparisonData = [
                data.pm25 || 0,
                data.pm10 || 0,
                data.co2 || 0,
                data.co || 0,
                data.voc || 0
            ];
            this.pollutantComparisonChart.data.datasets[0].data = comparisonData;
            this.pollutantComparisonChart.update('none');
        }

        // Update distribution chart with normalized data
        if (this.pollutantDistributionChart) {
            const total = (data.pm25 || 0) + (data.pm10 || 0) + (data.co2 || 0) + (data.co || 0) + (data.voc || 0);
            if (total > 0) {
                const distributionData = [
                    ((data.pm25 || 0) / total) * 100,
                    ((data.pm10 || 0) / total) * 100,
                    ((data.co2 || 0) / total) * 100,
                    (((data.co || 0) + (data.voc || 0)) / total) * 100
                ];
                this.pollutantDistributionChart.data.datasets[0].data = distributionData;
                this.pollutantDistributionChart.update('none');
            }
        }
    }

    // Update safety levels with progress bars
    updatePollutantSafetyLevels(data) {
        const pm25Value = data.pm25 || 0;
        const pm10Value = data.pm10 || 0;
        const co2Value = data.co2 || 0;

        // PM2.5 progress (0-50 µg/m³ scale)
        const pm25Progress = Math.min((pm25Value / 50) * 100, 100);
        const pm25ProgressBar = document.getElementById('pm25-progress');
        if (pm25ProgressBar) {
            pm25ProgressBar.style.width = `${pm25Progress}%`;
            pm25ProgressBar.className = `progress-bar ${this.getProgressBarColor(pm25Progress)}`;
        }

        // PM10 progress (0-200 µg/m³ scale)
        const pm10Progress = Math.min((pm10Value / 200) * 100, 100);
        const pm10ProgressBar = document.getElementById('pm10-progress');
        if (pm10ProgressBar) {
            pm10ProgressBar.style.width = `${pm10Progress}%`;
            pm10ProgressBar.className = `progress-bar ${this.getProgressBarColor(pm10Progress)}`;
        }

        // CO2 progress (0-2000 ppm scale)
        const co2Progress = Math.min((co2Value / 2000) * 100, 100);
        const co2ProgressBar = document.getElementById('co2-progress');
        if (co2ProgressBar) {
            co2ProgressBar.style.width = `${co2Progress}%`;
            co2ProgressBar.className = `progress-bar ${this.getProgressBarColor(co2Progress)}`;
        }
    }

    // Update pollutant trends
    updatePollutantTrends(data) {
        // Simulate trend data based on current values
        const trends = {
            'dominant-pollutant': this.getDominantPollutant(data),
            'pm25-trend': this.getTrendDirection(data.pm25),
            'pm10-trend': this.getTrendDirection(data.pm10),
            'co2-trend': this.getTrendDirection(data.co2),
            'pollutant-peak-time': this.getPeakTime(),
            'pollutant-improvement': this.getImprovementSuggestion(data)
        };

        for (const [id, value] of Object.entries(trends)) {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = value;
                
                // Add trend direction classes
                if (id.includes('-trend')) {
                    element.className = 'trend-value';
                    if (value.includes('↑')) {
                        element.classList.add('trend-up');
                    } else if (value.includes('↓')) {
                        element.classList.add('trend-down');
                    } else {
                        element.classList.add('trend-stable');
                    }
                }
            }
        }
    }

    // Helper methods for pollutant analysis
    getPollutantStatus(value, type) {
        if (value === undefined || value === null) return 'No data';
        
        switch(type) {
            case 'pm25':
                if (value < 12) return 'Good';
                if (value < 35) return 'Moderate';
                return 'Unhealthy';
            case 'pm10':
                if (value < 54) return 'Good';
                if (value < 154) return 'Moderate';
                return 'Unhealthy';
            case 'co2':
                if (value < 1000) return 'Good';
                if (value < 2000) return 'Moderate';
                return 'Poor';
            default:
                return '--';
        }
    }

    getProgressBarColor(percentage) {
        if (percentage < 33) return 'bg-success';
        if (percentage < 66) return 'bg-warning';
        return 'bg-danger';
    }

    getDominantPollutant(data) {
        const pollutants = [
            { name: 'PM2.5', value: data.pm25 || 0 },
            { name: 'PM10', value: data.pm10 || 0 },
            { name: 'CO₂', value: (data.co2 || 0) / 10 }, // Normalize CO2
            { name: 'CO', value: data.co || 0 },
            { name: 'VOC', value: data.voc || 0 }
        ];
        
        const dominant = pollutants.reduce((max, pollutant) => 
            pollutant.value > max.value ? pollutant : max
        );
        
        return dominant.value > 0 ? dominant.name : 'None';
    }

    getTrendDirection(value) {
        if (!value) return 'Stable →';
        // Simple simulation - in real app, this would compare with historical data
        const random = Math.random();
        if (random < 0.3) return 'Improving ↓';
        if (random < 0.6) return 'Stable →';
        return 'Worsening ↑';
    }

    getPeakTime() {
        const hours = new Date().getHours();
        return `${hours}:00 - ${(hours + 2) % 24}:00`;
    }

    getImprovementSuggestion(data) {
        if ((data.pm25 || 0) > 35) return 'Reduce indoor activities';
        if ((data.co2 || 0) > 1500) return 'Increase ventilation';
        if ((data.pm10 || 0) > 100) return 'Use air purifier';
        return 'Maintain current conditions';
    }

    updatePollutantWithFallbackData() {
        // Fallback data for demonstration
        const fallbackData = {
            pm25: 15,
            pm10: 25,
            co2: 800,
            co: 2,
            voc: 150,
            aqi: 45,
            aqi_category: 'Good'
        };
        
        this.updatePollutantDisplays(fallbackData);
        this.updatePollutantCharts(fallbackData);
        this.updatePollutantSafetyLevels(fallbackData);
        this.updatePollutantTrends(fallbackData);
    }
    
    async updateStatistics() {
        try {
            const response = await fetch('/api/stats');
            const result = await response.json();
            
            if (result.success) {
                this.displayStatistics(result.data);
            }
        } catch (error) {
            console.error('Error fetching statistics:', error);
        }
    }
    
    displayStatistics(stats) {
        const container = document.getElementById('statistics-container');
        if (container) {
            const statHtml = stats && stats.aqi ? 
            `
            <div class="row statistics-grid">
                <div class="text-center">
                    <div class="text-muted small">AQI Range</div>
                    <div class="fw-bold">${stats.aqi.min} - ${stats.aqi.max}</div>
                    <div class="small text-success">Avg: ${stats.aqi.avg}</div>
                </div>
                <div class="text-center">
                    <div class="text-muted small">PM2.5 Range</div>
                    <div class="fw-bold">${stats.pm25.min} - ${stats.pm25.max}</div>
                    <div class="small text-info">Avg: ${stats.pm25.avg} µg/m³</div>
                </div>
                <div class="text-center">
                    <div class="text-muted small">PM10 Range</div>
                    <div class="fw-bold">${stats.pm10.min} - ${stats.pm10.max}</div>
                    <div class="small text-warning">Avg: ${stats.pm10.avg} µg/m³</div>
                </div>
                <div class="text-center">
                    <div class="text-muted small">CO₂ Range</div>
                    <div class="fw-bold">${stats.co2.min} - ${stats.co2.max}</div>
                    <div class="small text-secondary">Avg: ${stats.co2.avg} ppm</div>
                </div>
            </div>
            ` : `<p class="text-center text-muted">No statistics data available.</p>`;
            
            container.innerHTML = statHtml;
        }
    }
    
    async checkSensorStatus() {
        try {
            const response = await fetch('/api/sensor/status');
            const result = await response.json();
            
            if (result.success) {
                const sensorStatus = document.getElementById('sensor-status');
                const sensorIcon = document.getElementById('sensor-status-icon');
                const sensorType = document.getElementById('sensor-type');
                
                if (sensorStatus && sensorIcon && sensorType) {
                    if (result.sensor_enabled) {
                        sensorStatus.textContent = 'Active';
                        sensorStatus.className = 'text-success';
                        sensorIcon.className = 'fas fa-microchip text-success';
                        sensorType.textContent = `${result.sensor_type} (${result.read_interval}s)`;
                    } else {
                        sensorStatus.textContent = 'Disabled';
                        sensorStatus.className = 'text-secondary';
                        sensorIcon.className = 'fas fa-microchip text-secondary';
                        sensorType.textContent = 'Manual mode only';
                    }
                }
            }
        } catch (error) {
            console.error('Error checking sensor status:', error);
        }
    }
    
    checkForAlerts(data) {
        if (data.is_alert) {
            this.showAlert(data.health_recommendation || 'Air quality is unhealthy!');
        }
    }
    
    showAlert(message) {
        const alertContainer = document.getElementById('alert-container');
        const alertMessage = document.getElementById('alert-message');
        
        if (alertContainer && alertMessage) {
            alertMessage.textContent = message;
            alertContainer.style.display = 'block';
            
            setTimeout(() => {
                alertContainer.style.display = 'none';
            }, 10000);
        }
    }
    
    updateStatusIndicator(isOnline) {
        const statusIndicator = document.getElementById('status-indicator');
        if (statusIndicator) {
            if (isOnline) {
                statusIndicator.innerHTML = '<i class="fas fa-circle text-success me-1"></i>Online';
                statusIndicator.className = 'nav-link text-success';
            } else {
                statusIndicator.innerHTML = '<i class="fas fa-circle text-danger me-1"></i>Offline';
                statusIndicator.className = 'nav-link text-danger';
            }
        }
    }
    
    updateLastUpdateTime() {
        const lastUpdate = document.getElementById('last-update');
        if (lastUpdate) {
            const now = new Date();
            const timeString = now.toLocaleTimeString();
            lastUpdate.textContent = `Last updated: ${timeString}`;
        }
    }
    
    getAQICategory(aqi) {
        if (aqi <= 50) return 'Good';
        if (aqi <= 100) return 'Moderate';
        if (aqi <= 150) return 'Unhealthy for Sensitive Groups';
        if (aqi <= 200) return 'Unhealthy';
        if (aqi <= 300) return 'Very Unhealthy';
        return 'Hazardous';
    }
    
    getAQIColor(aqi) {
        const category = this.getAQICategory(aqi);
        return this.aqiColors[category] || '#808080';
    }
    
    forceUpdate() {
        console.log('Force updating dashboard...');
        this.updateCurrentData();
        this.updateChartData();
        this.updatePollutantData();
        this.updateStatistics();
        this.checkSensorStatus();
        
        // Show loading state
        const refreshBtn = document.getElementById('refresh-btn');
        if (refreshBtn) {
            const originalHtml = refreshBtn.innerHTML;
            refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Updating...';
            refreshBtn.disabled = true;
            
            setTimeout(() => {
                refreshBtn.innerHTML = originalHtml;
                refreshBtn.disabled = false;
            }, 2000);
        }
    }
    
    destroy() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        
        if (this.aqiChart) {
            this.aqiChart.destroy();
        }
        
        if (this.pollutantChart) {
            this.pollutantChart.destroy();
        }

        if (this.aqiDistributionChart) {
            this.aqiDistributionChart.destroy();
        }

        if (this.pollutantContributionChart) {
            this.pollutantContributionChart.destroy();
        }

        if (this.pollutantComparisonChart) {
            this.pollutantComparisonChart.destroy();
        }

        if (this.pollutantDistributionChart) {
            this.pollutantDistributionChart.destroy();
        }
    }
}

let dashboard = null;

function initializeDashboard() {
    if (dashboard) {
        dashboard.destroy();
    }
    dashboard = new AirQualityDashboard();
}

window.initializeDashboard = initializeDashboard;
window.AirQualityDashboard = AirQualityDashboard;

document.addEventListener('DOMContentLoaded', function() {
    if (document.getElementById('aqiChart')) { 
        initializeDashboard();
    }
});