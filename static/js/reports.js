// Air Quality Reports JavaScript
class AirQualityReports {
    constructor() {
        this.currentReportData = null;
        this.currentReportTitle = '';
        this.sessionCheckInterval = null;
        this.inactivityTimer = null;
        this.sessionTimeoutMinutes = 2; // Increased to 30 minutes
        this.warningShown = false;
        
        this.init();
    }
    
    init() {
        console.log('Initializing Air Quality Reports...');
        this.setupEventListeners();
        this.initializeDateInputs();
        this.startSessionMonitoring();
        this.resetInactivityTimer();
    }
    
    setupEventListeners() {
        // Activity tracking
        this.trackUserActivity();
        
        // Admin login form
        const adminLoginForm = document.getElementById('adminLoginForm');
        if (adminLoginForm) {
            adminLoginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleAdminLogin();
            });
        }
        
        // Quick report buttons
        const quickReportButtons = document.querySelectorAll('.generate-report-btn');
        quickReportButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const period = e.target.getAttribute('data-period') || 
                              e.target.closest('button')?.getAttribute('data-period');
                if (period) this.generateReport(period);
            });
        });
        
        // Custom report button
        const customReportBtn = document.querySelector('.generate-custom-report-btn');
        if (customReportBtn) {
            customReportBtn.addEventListener('click', () => this.generateCustomReport());
        }
        
        // Export buttons
        const exportCsvBtn = document.querySelector('.export-csv-btn');
        const exportPdfBtn = document.querySelector('.export-pdf-btn');
        
        if (exportCsvBtn) {
            exportCsvBtn.addEventListener('click', () => this.exportToCSV());
        }
        
        if (exportPdfBtn) {
            exportPdfBtn.addEventListener('click', () => this.exportToPDF());
        }
        
        // Logout button
        const logoutBtn = document.querySelector('.logout-admin-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this.logoutAdmin());
        }
    }
    
    trackUserActivity() {
        const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'click'];
        events.forEach(event => {
            document.addEventListener(event, () => {
                this.resetInactivityTimer();
            }, { passive: true });
        });
    }
    
    resetInactivityTimer() {
        if (this.inactivityTimer) {
            clearTimeout(this.inactivityTimer);
        }
        
        this.inactivityTimer = setTimeout(() => {
            this.handleInactivityTimeout();
        }, this.sessionTimeoutMinutes * 60 * 1000);
        
        this.warningShown = false;
    }
    
    handleInactivityTimeout() {
        this.checkSession().then(authenticated => {
            if (authenticated) {
                this.showWarning('Session will expire in 30 seconds due to inactivity.');
                
                setTimeout(() => {
                    this.checkSession().then(authenticated => {
                        if (authenticated) {
                            this.autoLogout();
                        }
                    });
                }, 30000);
            }
        });
    }
    
    autoLogout() {
        this.showError('Session expired due to inactivity.');
        this.logoutAdmin();
    }
    
    startSessionMonitoring() {
        this.sessionCheckInterval = setInterval(() => {
            this.checkSession().then(authenticated => {
                if (!authenticated && document.querySelector('.report-option')) {
                    this.showError('Session expired. Please login again.');
                    setTimeout(() => location.reload(), 2000);
                }
            });
        }, 30000);
    }
    
    async checkSession() {
        try {
            const response = await fetch('/api/reports/check-session');
            const data = await response.json();
            return data.authenticated === true;
        } catch (error) {
            console.error('Session check error:', error);
            return false;
        }
    }
    
    initializeDateInputs() {
        const today = new Date().toISOString().split('T')[0];
        const startDateInput = document.getElementById('startDate');
        const endDateInput = document.getElementById('endDate');
        
        if (startDateInput && endDateInput) {
            startDateInput.max = today;
            endDateInput.max = today;
            
            const defaultStartDate = new Date();
            defaultStartDate.setDate(defaultStartDate.getDate() - 7);
            startDateInput.value = defaultStartDate.toISOString().split('T')[0];
            endDateInput.value = today;
        }
    }
    
    async handleAdminLogin() {
        const password = document.getElementById('adminPassword').value;
        const submitBtn = document.querySelector('#adminLoginForm button[type="submit"]');
        
        if (!password) {
            this.showError('Please enter admin password');
            return;
        }
        
        // Show loading state
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Authenticating...';
        submitBtn.disabled = true;
        
        try {
            const response = await fetch('/api/reports/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ password: password })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.showSuccess('Login successful! Redirecting...');
                setTimeout(() => location.reload(), 1500);
            } else {
                this.showError('Invalid admin password.');
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
            }
        } catch (error) {
            console.error('Login error:', error);
            this.showError('Login failed. Please check your connection.');
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    }
    
    async generateReport(period) {
        const authenticated = await this.checkSession();
        if (!authenticated) {
            this.showError('Please login first');
            setTimeout(() => location.reload(), 2000);
            return;
        }
        
        this.showLoading();
        
        try {
            const response = await fetch(`/api/reports/generate?period=${period}`);
            const data = await response.json();
            
            this.hideLoading();
            
            if (data.success) {
                this.currentReportData = data.data;
                this.displayReportResults(data.data, period);
                this.resetInactivityTimer();
            } else {
                this.showError(data.error || 'Error generating report');
            }
        } catch (error) {
            this.hideLoading();
            console.error('Report generation error:', error);
            this.showError('Error generating report');
        }
    }
    
    async generateCustomReport() {
    const authenticated = await this.checkSession();
    if (!authenticated) {
        this.showError('Please login first');
        setTimeout(() => location.reload(), 2000);
        return;
    }
    
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;
    
    if (!startDate || !endDate) {
        this.showError('Please select both start and end dates');
        return;
    }
    
    if (startDate > endDate) {
        this.showError('Start date cannot be after end date');
        return;
    }
    
    this.showLoading();
    
    try {
        // THIS IS THE KEY CHANGE - using start_date and end_date parameters
        const response = await fetch(`/api/reports/generate?start_date=${startDate}&end_date=${endDate}`);
        const data = await response.json();
        
        this.hideLoading();
        
        if (data.success) {
            this.currentReportData = data.data;
            this.displayReportResults(data.data, 'custom', startDate, endDate);
            this.resetInactivityTimer();
        } else {
            this.showError(data.error || 'No data found for selected dates');
        }
    } catch (error) {
        this.hideLoading();
        console.error('Custom report error:', error);
        this.showError('Error generating custom report');
    }
}
    
    displayReportResults(data, period, startDate = null, endDate = null) {
        const resultsDiv = document.getElementById('reportResults');
        const titleDiv = document.getElementById('reportTitle');
        const summaryDiv = document.getElementById('reportSummary');
        const tableBody = document.getElementById('reportTableBody');
        
        let title = '';
        switch(period) {
            case '24h': 
                title = '24-Hour Air Quality Report';
                this.currentReportTitle = '24_Hour_Air_Quality_Report';
                break;
            case '7d': 
                title = '7-Day Air Quality Report';
                this.currentReportTitle = '7_Day_Air_Quality_Report';
                break;
            case '15d': 
                title = '15-Day Air Quality Report';
                this.currentReportTitle = '15_Day_Air_Quality_Report';
                break;
            case '30d': 
                title = '30-Day Air Quality Report';
                this.currentReportTitle = '30_Day_Air_Quality_Report';
                break;
            case 'custom': 
                title = `Custom Report: ${startDate} to ${endDate}`;
                this.currentReportTitle = `Custom_Report_${startDate}_to_${endDate}`;
                break;
        }
        
        titleDiv.innerHTML = `<i class="fas fa-chart-line me-2"></i>${title}`;
        
        // Summary statistics
        if (data.summary) {
            summaryDiv.innerHTML = `
                <div class="col-md-3">
                    <div class="stat-card">
                        <h6>Total Records</h6>
                        <h3>${data.summary.total_records || 0}</h3>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="stat-card">
                        <h6>Average AQI</h6>
                        <h3 style="color: ${this.getAQIColor(data.summary.avg_aqi)}">${data.summary.avg_aqi || '--'}</h3>
                        <small>${data.summary.aqi_category || ''}</small>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="stat-card">
                        <h6>Maximum AQI</h6>
                        <h3>${data.summary.max_aqi || '--'}</h3>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="stat-card">
                        <h6>Health Alerts</h6>
                        <h3>${data.summary.alert_count || 0}</h3>
                    </div>
                </div>
            `;
        }
        
        // Readings table - FIXED: removed calculated_aqi column (now 14 columns)
        if (data.readings && data.readings.length > 0) {
            tableBody.innerHTML = data.readings.map(reading => {
                const aqiColor = this.getAQIColor(reading.aqi);
                
                return `
                <tr>
                    <td>${new Date(reading.timestamp).toLocaleString()}</td>
                    <td style="color: ${aqiColor}; font-weight: bold">${reading.aqi}</td>
                    <td><span class="badge" style="background-color: ${aqiColor};">${reading.aqi_category}</span></td>
                    <td>${this.formatValue(reading.pm25)}</td>
                    <td>${this.formatValue(reading.pm10)}</td>
                    <td>${this.formatValue(reading.dust, 3)}</td>
                    <td>${this.formatValue(reading.co2, 0)}</td>
                    <td>${this.formatValue(reading.co, 1)}</td>
                    <td>${this.formatValue(reading.voc, 0)}</td>
                    <td>${this.formatValue(reading.nox, 0)}</td>
                    <td>${this.formatValue(reading.nh3, 1)}</td>
                    <td>${this.formatValue(reading.temperature, 1)}</td>
                    <td>${this.formatValue(reading.humidity, 1)}</td>
                    <td>${this.formatValue(reading.pressure, 1)}</td>
                </tr>
            `}).join('');
        } else {
            tableBody.innerHTML = '<tr><td colspan="14" class="text-center py-4">No data available</td></tr>';
        }
        
        resultsDiv.style.display = 'block';
        resultsDiv.scrollIntoView({ behavior: 'smooth' });
        
        this.showSuccess('Report generated successfully!');
    }
    
    getAQIColor(aqi) {
        if (aqi <= 50) return '#10b981';
        if (aqi <= 100) return '#f59e0b';
        if (aqi <= 150) return '#f97316';
        if (aqi <= 200) return '#ef4444';
        if (aqi <= 300) return '#8b5cf6';
        return '#7f1d1d';
    }
    
    formatValue(value, decimals = 1) {
        if (value === null || value === undefined || value === '--') return '--';
        if (typeof value === 'number') {
            if (decimals === 0) return Math.round(value).toString();
            return value.toFixed(decimals);
        }
        return value.toString();
    }
    
    exportToCSV() {
        if (!this.currentReportData) {
            this.showError('Please generate a report first');
            return;
        }
        
        this.showSuccess('Preparing CSV download...');
        // Use location.href instead of window.open to avoid popup blockers
        window.location.href = '/api/reports/export/csv';
        this.resetInactivityTimer();
    }
    
    exportToPDF() {
        if (!this.currentReportData) {
            this.showError('Please generate a report first');
            return;
        }
        
        this.showSuccess('Preparing PDF download...');
        // Use location.href instead of window.open to avoid popup blockers
        window.location.href = '/api/reports/export/pdf';
        this.resetInactivityTimer();
    }
    
    async logoutAdmin() {
        try {
            const response = await fetch('/api/reports/logout');
            const data = await response.json();
            
            if (data.success) {
                this.showSuccess('Logged out successfully');
                setTimeout(() => location.reload(), 1000);
            }
        } catch (error) {
            console.error('Logout error:', error);
            location.reload();
        }
    }
    
    showLoading() {
        const loadingSpinner = document.getElementById('loadingSpinner');
        if (loadingSpinner) {
            loadingSpinner.style.display = 'block';
            loadingSpinner.scrollIntoView({ behavior: 'smooth' });
        }
    }
    
    hideLoading() {
        const loadingSpinner = document.getElementById('loadingSpinner');
        if (loadingSpinner) {
            loadingSpinner.style.display = 'none';
        }
    }
    
    showError(message) {
        this.showNotification(message, 'error');
    }
    
    showSuccess(message) {
        this.showNotification(message, 'success');
    }
    
    showWarning(message) {
        this.showNotification(message, 'warning');
        this.warningShown = true;
    }
    
    showNotification(message, type) {
        // Remove existing notifications
        document.querySelectorAll('.custom-notification').forEach(n => n.remove());
        
        const notification = document.createElement('div');
        const alertClass = type === 'error' ? 'danger' : type === 'warning' ? 'warning' : 'success';
        
        notification.className = `custom-notification alert alert-${alertClass} alert-dismissible fade show`;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999;
            min-width: 300px;
            padding: 15px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        `;
        
        notification.innerHTML = `
            <div class="d-flex align-items-center">
                <i class="fas fa-${type === 'error' ? 'exclamation-circle' : type === 'warning' ? 'exclamation-triangle' : 'check-circle'} me-2"></i>
                <div class="flex-grow-1">${message}</div>
                <button type="button" class="btn-close" onclick="this.parentElement.parentElement.remove()"></button>
            </div>
        `;
        
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 5000);
    }
    
    destroy() {
        if (this.sessionCheckInterval) {
            clearInterval(this.sessionCheckInterval);
        }
        if (this.inactivityTimer) {
            clearTimeout(this.inactivityTimer);
        }
    }
}

// Initialize reports
let reportsManager = null;

document.addEventListener('DOMContentLoaded', function() {
    if (document.getElementById('adminLoginForm') || document.querySelector('.report-option')) {
        reportsManager = new AirQualityReports();
    }
});

window.addEventListener('beforeunload', function() {
    if (reportsManager) {
        reportsManager.destroy();
    }
});