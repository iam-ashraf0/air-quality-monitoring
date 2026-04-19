from flask import Flask, render_template, request, redirect, url_for, jsonify, flash, session, make_response
import pymysql.cursors
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List
import os
import random
import csv
import io
import threading
import requests
import time
from reportlab.lib.pagesizes import letter, A4
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import inch

DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',
    'password': 'Ashraf@2026!',
    'db': 'aqi_dashboard_db',
    'cursorclass': pymysql.cursors.DictCursor
}

# Sensor Configuration - Set to False if no hardware sensors available
SENSOR_READER_ENABLED = False  # Change to True if you have Raspberry Pi with sensors
SENSOR_READ_INTERVAL = 30  # seconds
# ---------------------------------------------

# Admin password for report access
REPORT_ADMIN_PASSWORD = 'report_admin'
SESSION_TIMEOUT_MINUTES = 2

# --- 🌡️ Sensor Data Ranges for Validation ---
SENSOR_RANGES = {
    'pm2_5_ugm3':       {'min': 0.0, 'max': 500.0, 'step': 0.1, 'unit': 'µg/m³', 'desc': 'PMS5003 range: 0 to 500. Resolution: 1 µg/m³.'},
    'pm10_ugm3':        {'min': 0.0, 'max': 500.0, 'step': 0.1, 'unit': 'µg/m³', 'desc': 'PMS5003 range: 0 to 500. Resolution: 1 µg/m³.'},
    'gp2y_dust_mgm3':   {'min': 0.0, 'max': 0.5, 'step': 0.001, 'unit': 'mg/m³', 'desc': 'GP2Y1010AU0F (analog output, max ~0.5 mg/m³).'},
    'co2_ppm':          {'min': 400, 'max': 5000, 'step': 1, 'unit': 'ppm', 'desc': 'T6613 default range: 0 to 5000. Baseline is ~400.'},
    'co_ppm':           {'min': 0.0, 'max': 500.0, 'step': 0.1, 'unit': 'ppm', 'desc': 'MQ7B max continuous sensing range is usually < 500ppm.'},
    'voc_index':        {'min': 0.0, 'max': 500.0, 'step': 1.0, 'unit': 'Index', 'desc': 'SGP41 Index: 0 to 500. Reference is 100.'},
    'nox_index':        {'min': 0.0, 'max': 500.0, 'step': 1.0, 'unit': 'Index', 'desc': 'SGP41 Index: 0 to 500. Reference is 100.'},
    'nh3_ppm':          {'min': 0.0, 'max': 100.0, 'step': 0.1, 'unit': 'ppm', 'desc': 'DFRobot NH3 sensor max sensing range is 500ppm, but typical environmental limits are lower.'},
    'temperature_c':    {'min': -40.0, 'max': 85.0, 'step': 0.1, 'unit': '°C', 'desc': 'BME680 operating range.'},
    'humidity_percent': {'min': 0.0, 'max': 100.0, 'step': 0.1, 'unit': '%', 'desc': 'BME680 operating range.'},
    'pressure_hpa':     {'min': 300.0, 'max': 1100.0, 'step': 0.1, 'unit': 'hPa', 'desc': 'BME680 operating range (near sea level is ~1013 hPa).'}
}

# --- AQI Calculation Breakpoints (US EPA Standard) ---
AQI_BREAKPOINTS = {
    'pm2_5_ugm3': [(0, 50, 0.0, 12.0), (51, 100, 12.1, 35.4), (101, 150, 35.5, 55.4), (151, 200, 55.5, 150.4), (201, 300, 150.5, 250.4), (301, 500, 250.5, 500.4)],
    'pm10_ugm3': [(0, 50, 0, 54), (51, 100, 55, 154), (101, 150, 155, 254), (151, 200, 255, 354), (201, 300, 355, 424), (301, 500, 425, 604)],
    'co_ppm': [(0, 50, 0.0, 4.4), (51, 100, 4.5, 9.4), (101, 150, 9.5, 12.4), (151, 200, 12.5, 15.4), (201, 300, 15.5, 30.4), (301, 500, 30.5, 50.4)],
}

# --- AQI Helper Functions ---
def linear_interpolation(I_low, I_high, C_low, C_high, C):
    if C_high - C_low == 0: return I_high
    return ((I_high - I_low) / (C_high - C_low)) * (C - C_low) + I_low

def calculate_iaqi(pollutant_key, concentration):
    if concentration < 0: return 0
    breakpoints = AQI_BREAKPOINTS.get(pollutant_key)
    if not breakpoints: return 0

    for I_low, I_high, C_low, C_high in breakpoints:
        if C_low <= concentration <= C_high:
            iaqi = linear_interpolation(I_low, I_high, C_low, C_high, concentration)
            return int(round(iaqi))
        elif concentration > breakpoints[-1][3]:
            return 500 
    return 0 

def calculate_aqi(data):
    iaqi_values = []
    for key in ['pm2_5_ugm3', 'pm10_ugm3', 'co_ppm']:
        value = data.get(key)
        if value is not None:
            iaqi_values.append(calculate_iaqi(key, float(value)))

    if not iaqi_values: return 0
    final_aqi = max(iaqi_values)
    return min(final_aqi, 500)

def get_aqi_category_info(aqi):
    if aqi <= 50: 
        return {'category': 'Good', 'color': '#00E400', 'alert': False, 'reco': 'Air quality is satisfactory. No risk.'}
    elif aqi <= 100: 
        return {'category': 'Moderate', 'color': '#FFFF00', 'alert': False, 'reco': 'Air quality is acceptable. Unusually sensitive people should consider limiting prolonged outdoor exertion.'}
    elif aqi <= 150: 
        return {'category': 'Unhealthy for Sensitive Groups', 'color': '#FF7E00', 'alert': True, 'reco': 'Members of sensitive groups may experience health effects. General public not likely to be affected.'}
    elif aqi <= 200: 
        return {'category': 'Unhealthy', 'color': '#FF0000', 'alert': True, 'reco': 'Everyone may begin to experience health effects. Sensitive groups should avoid all outdoor exertion.'}
    elif aqi <= 300: 
        return {'category': 'Very Unhealthy', 'color': '#8F3F97', 'alert': True, 'reco': 'Health warnings of emergency conditions. Entire population is more likely to be affected.'}
    else: 
        return {'category': 'Hazardous', 'color': '#7E0023', 'alert': True, 'reco': 'Health alert: everyone should avoid all outdoor exertion.'}

# --- Helper Functions for PDF Generation ---
def get_aqi_color(aqi_value):
    """Return color based on AQI value"""
    if aqi_value <= 50:
        return '#27ae60'  # Green
    elif aqi_value <= 100:
        return '#f39c12'  # Orange
    elif aqi_value <= 150:
        return '#e67e22'  # Dark Orange
    elif aqi_value <= 200:
        return '#e74c3c'  # Red
    elif aqi_value <= 300:
        return '#8e44ad'  # Purple
    else:
        return '#7d3c98'  # Dark Purple

def get_aqi_icon(aqi_value):
    """Return icon based on AQI value"""
    if aqi_value <= 50:
        return '🟢'
    elif aqi_value <= 100:
        return '🟡'
    elif aqi_value <= 150:
        return '🟠'
    elif aqi_value <= 200:
        return '🔴'
    elif aqi_value <= 300:
        return '🟣'
    else:
        return '🟤'

def format_value(value, decimals=1):
    """Format numeric values with proper decimal places"""
    if value is None or value == '' or value == '--':
        return '--'
    try:
        num_value = float(value)
        if decimals == 0:
            return f"{int(num_value)}"
        else:
            format_str = f"{{:.{decimals}f}}"
            return format_str.format(num_value)
    except (ValueError, TypeError):
        return '--'

# --- Session Management Functions ---
def is_admin_authenticated():
    if not session.get('report_admin'):
        return False
    
    last_activity = session.get('last_activity')
    if not last_activity:
        return False
    
    last_activity_time = datetime.fromisoformat(last_activity)
    if datetime.now() - last_activity_time > timedelta(minutes=SESSION_TIMEOUT_MINUTES):
        session.clear()
        return False
    
    session['last_activity'] = datetime.now().isoformat()
    return True

def update_session_activity():
    if session.get('report_admin'):
        session['last_activity'] = datetime.now().isoformat()

# --- Flask Setup and Utility ---
app = Flask(__name__)
app.secret_key = 'your_super_secret_project_key_2024_aqi_monitor' 
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(minutes=SESSION_TIMEOUT_MINUTES)

def get_db_connection():
    try:
        return pymysql.connect(**DB_CONFIG)
    except Exception as e:
        print(f"Database connection error: {e}")
        return None

def fetch_latest_reading(connection) -> Optional[Dict[str, Any]]:
    if not connection: return None

    try:
        with connection.cursor() as cursor:
            sql = "SELECT * FROM sensor_readings ORDER BY timestamp DESC LIMIT 1"
            cursor.execute(sql)
            raw_data = cursor.fetchone()
            
            if raw_data:
                aqi = calculate_aqi(raw_data)
                aqi_info = get_aqi_category_info(aqi)
                
                data = {
                    'aqi': aqi,
                    'aqi_category': aqi_info['category'],
                    'aqi_color': aqi_info['color'],
                    'health_recommendation': aqi_info['reco'],
                    'is_alert': aqi_info['alert'],
                    'timestamp': raw_data['timestamp'].isoformat(),
                    
                    'pm25': round(raw_data['pm2_5_ugm3'], 2) if raw_data['pm2_5_ugm3'] is not None else '--',
                    'pm10': round(raw_data['pm10_ugm3'], 2) if raw_data['pm10_ugm3'] is not None else '--',
                    'dust_gp2y': round(raw_data['gp2y_dust_mgm3'], 3) if raw_data['gp2y_dust_mgm3'] is not None else '--',
                    'co2': raw_data['co2_ppm'] if raw_data['co2_ppm'] is not None else '--',
                    'co': round(raw_data['co_ppm'], 2) if raw_data['co_ppm'] is not None else '--',
                    'voc': round(raw_data['voc_index'], 2) if raw_data['voc_index'] is not None else '--',
                    'nox': round(raw_data['nox_index'], 2) if raw_data['nox_index'] is not None else '--',
                    'nh3': round(raw_data['nh3_ppm'], 2) if raw_data['nh3_ppm'] is not None else '--',
                    'temperature': round(raw_data['temperature_c'], 1) if raw_data['temperature_c'] is not None else '--',
                    'humidity': round(raw_data['humidity_percent'], 1) if raw_data['humidity_percent'] is not None else '--',
                    'pressure': round(raw_data['pressure_hpa'], 1) if raw_data['pressure_hpa'] is not None else '--',
                }
                return data
            return None
    except Exception as e:
        print(f"Error fetching data: {e}")
        return None
    finally:
        if connection:
            connection.close()

def generate_report_data(start_date, end_date):
    """Generate report data from database"""
    connection = get_db_connection()
    if not connection:
        return {'error': 'Database connection failed'}
    
    try:
        with connection.cursor() as cursor:
            sql = """
                SELECT * 
                FROM sensor_readings 
                WHERE timestamp BETWEEN %s AND %s 
                ORDER BY timestamp DESC
            """
            cursor.execute(sql, (start_date, end_date))
            raw_readings = cursor.fetchall()
            
            if not raw_readings:
                return {'error': 'No data found for the selected date range'}
            
            processed_readings = []
            total_aqi = 0
            max_aqi = 0
            alert_count = 0
            pollutant_totals = {
                'pm25': 0, 'pm10': 0, 'co2': 0, 'co': 0, 
                'voc': 0, 'nox': 0, 'temperature': 0, 
                'humidity': 0, 'pressure': 0
            }
            pollutant_counts = {k: 0 for k in pollutant_totals.keys()}
            
            for reading in raw_readings:
                # Calculate AQI for this reading
                aqi = calculate_aqi(reading)
                aqi_info = get_aqi_category_info(aqi)
                
                processed_reading = {
                    'timestamp': reading['timestamp'].isoformat(),
                    'aqi': aqi,
                    'aqi_category': aqi_info['category'],
                    'aqi_color': aqi_info['color'],
                    'is_alert': aqi_info['alert'],
                    # All sensor fields with proper formatting
                    'pm25': round(reading['pm2_5_ugm3'], 2) if reading['pm2_5_ugm3'] is not None else None,
                    'pm10': round(reading['pm10_ugm3'], 2) if reading['pm10_ugm3'] is not None else None,
                    'dust': round(reading['gp2y_dust_mgm3'], 3) if reading['gp2y_dust_mgm3'] is not None else None,
                    'co2': reading['co2_ppm'] if reading['co2_ppm'] is not None else None,
                    'co': round(reading['co_ppm'], 2) if reading['co_ppm'] is not None else None,
                    'voc': round(reading['voc_index'], 2) if reading['voc_index'] is not None else None,
                    'nox': round(reading['nox_index'], 2) if reading['nox_index'] is not None else None,
                    'nh3': round(reading['nh3_ppm'], 2) if reading['nh3_ppm'] is not None else None,
                    'temperature': round(reading['temperature_c'], 1) if reading['temperature_c'] is not None else None,
                    'humidity': round(reading['humidity_percent'], 1) if reading['humidity_percent'] is not None else None,
                    'pressure': round(reading['pressure_hpa'], 1) if reading['pressure_hpa'] is not None else None
                }
                
                processed_readings.append(processed_reading)
                total_aqi += aqi
                max_aqi = max(max_aqi, aqi)
                
                if aqi_info['alert']:
                    alert_count += 1
                
                # Aggregate for averages
                for key in pollutant_totals.keys():
                    if key in processed_reading and processed_reading[key] is not None:
                        pollutant_totals[key] += processed_reading[key]
                        pollutant_counts[key] += 1
            
            avg_aqi = round(total_aqi / len(processed_readings)) if processed_readings else 0
            avg_aqi_info = get_aqi_category_info(avg_aqi)
            
            # Calculate averages for each pollutant
            averages = {}
            for key in pollutant_totals.keys():
                if pollutant_counts[key] > 0:
                    averages[key] = round(pollutant_totals[key] / pollutant_counts[key], 1)
                else:
                    averages[key] = None
            
            summary = {
                'total_records': len(processed_readings),
                'avg_aqi': avg_aqi,
                'aqi_category': avg_aqi_info['category'],
                'aqi_color': avg_aqi_info['color'],
                'max_aqi': max_aqi,
                'alert_count': alert_count,
                'date_range': {
                    'start': start_date.strftime('%Y-%m-%d'),
                    'end': end_date.strftime('%Y-%m-%d')
                },
                'averages': averages
            }
            
            return {
                'readings': processed_readings,
                'summary': summary
            }
            
    except Exception as e:
        print(f"Error generating report: {e}")
        import traceback
        traceback.print_exc()
        return {'error': str(e)}
    finally:
        if connection:
            connection.close()

# --- PDF Generation Function (Fixed) ---
def generate_pdf_export(report_data, report_title):
    """Generate PDF report with clean layout"""
    try:
        buffer = io.BytesIO()
        
        # Page setup
        doc = SimpleDocTemplate(buffer, pagesize=A4, 
                              topMargin=0.5*inch, 
                              bottomMargin=0.5*inch,
                              leftMargin=0.5*inch,
                              rightMargin=0.5*inch)
        
        styles = getSampleStyleSheet()
        story = []
        
        # Color scheme
        COLORS = {
            'primary': colors.HexColor('#2563eb'),
            'secondary': colors.HexColor('#3b82f6'),
            'success': colors.HexColor('#059669'),
            'warning': colors.HexColor('#d97706'),
            'danger': colors.HexColor('#dc2626'),
            'dark': colors.HexColor('#1e293b'),
            'light': colors.HexColor('#f8fafc'),
            'border': colors.HexColor('#e2e8f0'),
        }
        
        # AQI color mapping
        def get_aqi_pdf_color(aqi):
            if aqi <= 50: return COLORS['success']
            if aqi <= 100: return COLORS['warning']
            if aqi <= 150: return colors.HexColor('#f97316')
            if aqi <= 200: return COLORS['danger']
            if aqi <= 300: return colors.HexColor('#8b5cf6')
            return colors.HexColor('#7f1d1d')
        
        # Styles
        title_style = ParagraphStyle(
            'MainTitle',
            parent=styles['Heading1'],
            fontSize=24,
            spaceAfter=20,
            alignment=1,
            textColor=COLORS['primary'],
            fontName='Helvetica-Bold',
        )
        
        section_style = ParagraphStyle(
            'SectionTitle',
            parent=styles['Heading2'],
            fontSize=16,
            spaceAfter=12,
            spaceBefore=20,
            textColor=COLORS['dark'],
            fontName='Helvetica-Bold',
        )
        
        normal_style = ParagraphStyle(
            'Normal',
            parent=styles['Normal'],
            fontSize=9,
            spaceAfter=6,
            textColor=COLORS['dark'],
            leading=14,
            fontName='Helvetica',
        )
        
        small_style = ParagraphStyle(
            'Small',
            parent=styles['Normal'],
            fontSize=8,
            spaceAfter=4,
            textColor=colors.HexColor('#64748b'),
            leading=11,
            fontName='Helvetica',
        )
        
        # Cover Page
        story.append(Paragraph(report_title, title_style))
        story.append(Spacer(1, 10))
        story.append(Paragraph(
            f"Generated: {datetime.now().strftime('%B %d, %Y at %H:%M')}",
            normal_style
        ))
        story.append(Spacer(1, 30))
        
        # Summary
        if report_data.get('summary'):
            summary = report_data['summary']
            
            summary_data = [
                ['METRIC', 'VALUE'],
                ['Total Records', str(summary.get('total_records', 0))],
                ['Average AQI', f"{summary.get('avg_aqi', 0)} - {summary.get('aqi_category', 'N/A')}"],
                ['Maximum AQI', str(summary.get('max_aqi', 0))],
                ['Health Alerts', str(summary.get('alert_count', 0))],
                ['Period', f"{summary['date_range']['start']} to {summary['date_range']['end']}"],
            ]
            
            summary_table = Table(summary_data, colWidths=[2*inch, 4*inch])
            summary_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), COLORS['primary']),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 12),
                ('FONTSIZE', (0, 1), (-1, -1), 10),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('GRID', (0, 0), (-1, -1), 0.5, COLORS['border']),
                ('BOX', (0, 0), (-1, -1), 1, COLORS['primary']),
            ]))
            
            story.append(summary_table)
            story.append(PageBreak())
            
            # Averages
            if summary.get('averages'):
                story.append(Paragraph("Average Readings", section_style))
                
                avg_data = [
                    ['Parameter', 'Average', 'Unit'],
                    ['PM2.5', format_value(summary['averages'].get('pm25'), 1), 'µg/m³'],
                    ['PM10', format_value(summary['averages'].get('pm10'), 1), 'µg/m³'],
                    ['CO₂', format_value(summary['averages'].get('co2'), 0), 'ppm'],
                    ['CO', format_value(summary['averages'].get('co'), 1), 'ppm'],
                    ['Temperature', format_value(summary['averages'].get('temperature'), 1), '°C'],
                    ['Humidity', format_value(summary['averages'].get('humidity'), 1), '%'],
                ]
                
                avg_table = Table(avg_data, colWidths=[2*inch, 1.5*inch, 1*inch])
                avg_table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), COLORS['secondary']),
                    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                    ('FONTSIZE', (0, 0), (-1, -1), 9),
                    ('GRID', (0, 0), (-1, -1), 0.5, COLORS['border']),
                ]))
                
                story.append(avg_table)
                story.append(PageBreak())
        
        # Detailed Readings
        if report_data.get('readings'):
            readings = report_data['readings']
            
            story.append(Paragraph("Detailed Sensor Readings", section_style))
            
            headers = [
                ['Timestamp', 'AQI', 'Category', 'PM2.5', 'PM10', 'CO₂', 'Temp', 'Humidity']
            ]
            
            col_widths = [1.2*inch, 0.5*inch, 1.2*inch, 0.5*inch, 0.5*inch, 0.5*inch, 0.5*inch, 0.5*inch]
            
            # Split into chunks
            max_rows = 30
            for i in range(0, len(readings), max_rows):
                chunk = readings[i:i + max_rows]
                
                data = headers.copy()
                
                for reading in chunk:
                    dt = datetime.fromisoformat(reading['timestamp'])
                    timestamp = dt.strftime('%Y-%m-%d %H:%M')
                    
                    row = [
                        timestamp,
                        str(reading['aqi']),
                        reading['aqi_category'][:15],
                        format_value(reading['pm25'], 1),
                        format_value(reading['pm10'], 1),
                        format_value(reading['co2'], 0),
                        format_value(reading['temperature'], 1),
                        format_value(reading['humidity'], 1),
                    ]
                    data.append(row)
                
                table = Table(data, colWidths=col_widths, repeatRows=1)
                
                table_style = TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), COLORS['primary']),
                    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                    ('FONTSIZE', (0, 0), (-1, 0), 9),
                    ('FONTSIZE', (0, 1), (-1, -1), 8),
                    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                    ('GRID', (0, 0), (-1, -1), 0.5, COLORS['border']),
                    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, COLORS['light']]),
                ])
                
                # Color code AQI values
                for j, reading in enumerate(chunk, start=1):
                    aqi_color = get_aqi_pdf_color(reading['aqi'])
                    table_style.add('TEXTCOLOR', (1, j), (1, j), aqi_color)
                    table_style.add('FONTNAME', (1, j), (1, j), 'Helvetica-Bold')
                
                table.setStyle(table_style)
                story.append(table)
                
                if i + max_rows < len(readings):
                    story.append(PageBreak())
        
        # Footer
        story.append(Spacer(1, 20))
        footer_text = f"Report generated by Air Quality Monitoring System | {datetime.now().strftime('%Y-%m-%d %H:%M')}"
        story.append(Paragraph(footer_text, small_style))
        
        doc.build(story)
        buffer.seek(0)
        return buffer.getvalue()
        
    except Exception as e:
        print(f"Error generating PDF: {e}")
        import traceback
        traceback.print_exc()
        raise

def generate_csv_export(report_data, report_title):
    """Generate CSV export with clean formatting"""
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Title and metadata
    writer.writerow([report_title])
    writer.writerow([f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"])
    writer.writerow([])
    
    # Summary section
    if report_data.get('summary'):
        summary = report_data['summary']
        writer.writerow(['SUMMARY STATISTICS'])
        writer.writerow(['Metric', 'Value'])
        writer.writerow(['Total Records', summary.get('total_records', 0)])
        writer.writerow(['Average AQI', summary.get('avg_aqi', 0)])
        writer.writerow(['AQI Category', summary.get('aqi_category', 'N/A')])
        writer.writerow(['Maximum AQI', summary.get('max_aqi', 0)])
        writer.writerow(['Health Alert Periods', summary.get('alert_count', 0)])
        writer.writerow(['Start Date', summary['date_range']['start']])
        writer.writerow(['End Date', summary['date_range']['end']])
        
        # Averages
        if summary.get('averages'):
            writer.writerow([])
            writer.writerow(['AVERAGE READINGS'])
            writer.writerow(['Parameter', 'Average Value', 'Unit'])
            for param, value in summary['averages'].items():
                if value is not None:
                    if param == 'pm25':
                        writer.writerow(['PM2.5', value, 'µg/m³'])
                    elif param == 'pm10':
                        writer.writerow(['PM10', value, 'µg/m³'])
                    elif param == 'co2':
                        writer.writerow(['CO₂', value, 'ppm'])
                    elif param == 'co':
                        writer.writerow(['CO', value, 'ppm'])
                    elif param == 'voc':
                        writer.writerow(['VOC', value, 'Index'])
                    elif param == 'temperature':
                        writer.writerow(['Temperature', value, '°C'])
                    elif param == 'humidity':
                        writer.writerow(['Humidity', value, '%'])
                    elif param == 'pressure':
                        writer.writerow(['Pressure', value, 'hPa'])
        
        writer.writerow([])
    
    # Detailed readings
    writer.writerow(['DETAILED READINGS'])
    writer.writerow([
        'Timestamp', 'AQI', 'AQI Category', 
        'PM2.5 (µg/m³)', 'PM10 (µg/m³)', 'Dust (mg/m³)', 
        'CO₂ (ppm)', 'CO (ppm)', 'VOC Index', 'NOx Index', 'NH₃ (ppm)',
        'Temperature (°C)', 'Humidity (%)', 'Pressure (hPa)'
    ])
    
    if report_data.get('readings'):
        for reading in report_data['readings']:
            writer.writerow([
                reading['timestamp'],
                reading['aqi'],
                reading['aqi_category'],
                reading.get('pm25') or '',
                reading.get('pm10') or '',
                reading.get('dust') or '',
                reading.get('co2') or '',
                reading.get('co') or '',
                reading.get('voc') or '',
                reading.get('nox') or '',
                reading.get('nh3') or '',
                reading.get('temperature') or '',
                reading.get('humidity') or '',
                reading.get('pressure') or ''
            ])
    
    return output.getvalue()

# --- Routes ---
@app.route('/')
def index():
    connection = get_db_connection()
    latest_reading = fetch_latest_reading(connection)

    total_records = 0
    if connection:
        try:
            conn_reopened = get_db_connection()
            if conn_reopened:
                with conn_reopened.cursor() as cursor_reopened:
                    cursor_reopened.execute("SELECT COUNT(*) as count FROM sensor_readings")
                    total_records = cursor_reopened.fetchone()['count']
        except Exception as e:
            print(f"Error fetching total records: {e}")
            pass

    return render_template('dashboard.html', 
                           latest_reading=latest_reading,
                           total_records=total_records)

@app.route('/api/current')
def api_current():
    connection = get_db_connection()
    data = fetch_latest_reading(connection)
    
    if data:
        return jsonify({'success': True, 'data': data})
    return jsonify({'success': False, 'error': 'No data or DB error.'}), 404

@app.route('/api/history')
def api_history():
    time_range = request.args.get('range', 'hourly')
    
    data_points = []
    
    connection = get_db_connection()
    if connection:
        try:
            with connection.cursor() as cursor:
                if time_range == 'hourly':
                    start_time = datetime.now() - timedelta(hours=12)
                    sql = "SELECT * FROM sensor_readings WHERE timestamp >= %s ORDER BY timestamp ASC"
                    cursor.execute(sql, (start_time,))
                elif time_range == 'daily':
                    start_time = datetime.now() - timedelta(days=7)
                    sql = "SELECT * FROM sensor_readings WHERE timestamp >= %s ORDER BY timestamp ASC"
                    cursor.execute(sql, (start_time,))
                else:  # weekly
                    start_time = datetime.now() - timedelta(days=30)
                    sql = "SELECT * FROM sensor_readings WHERE timestamp >= %s ORDER BY timestamp ASC"
                    cursor.execute(sql, (start_time,))
                
                raw_data = cursor.fetchall()
                
                for reading in raw_data:
                    aqi = calculate_aqi(reading)
                    data_points.append({
                        'timestamp': reading['timestamp'].isoformat(),
                        'aqi': aqi,
                        'pm25': round(reading['pm2_5_ugm3'], 2) if reading['pm2_5_ugm3'] is not None else 0,
                        'pm10': round(reading['pm10_ugm3'], 2) if reading['pm10_ugm3'] is not None else 0,
                        'co2': reading['co2_ppm'] if reading['co2_ppm'] is not None else 0
                    })
                    
        except Exception as e:
            print(f"Error fetching history: {e}")
        finally:
            if connection:
                connection.close()
        
    return jsonify({'success': True, 'data': data_points})

@app.route('/api/stats')
def api_stats():
    stats_data = {
        'aqi': {'min': 0, 'max': 0, 'avg': 0},
        'pm25': {'min': 0, 'max': 0, 'avg': 0},
        'pm10': {'min': 0, 'max': 0, 'avg': 0},
        'co2': {'min': 0, 'max': 0, 'avg': 0},
        'alert_count': 0
    }
    
    connection = get_db_connection()
    if connection:
        try:
            with connection.cursor() as cursor:
                start_time = datetime.now() - timedelta(hours=24)
                cursor.execute("""
                    SELECT 
                        MIN(calculated_aqi) as min_aqi,
                        MAX(calculated_aqi) as max_aqi,
                        AVG(calculated_aqi) as avg_aqi,
                        MIN(pm2_5_ugm3) as min_pm25,
                        MAX(pm2_5_ugm3) as max_pm25,
                        AVG(pm2_5_ugm3) as avg_pm25,
                        MIN(pm10_ugm3) as min_pm10,
                        MAX(pm10_ugm3) as max_pm10,
                        AVG(pm10_ugm3) as avg_pm10,
                        MIN(co2_ppm) as min_co2,
                        MAX(co2_ppm) as max_co2,
                        AVG(co2_ppm) as avg_co2,
                        COUNT(CASE WHEN calculated_aqi > 100 THEN 1 END) as alert_count
                    FROM sensor_readings 
                    WHERE timestamp >= %s
                """, (start_time,))
                
                result = cursor.fetchone()
                
                if result and result['min_aqi'] is not None:
                    stats_data = {
                        'aqi': {
                            'min': int(result['min_aqi']),
                            'max': int(result['max_aqi']),
                            'avg': int(result['avg_aqi'])
                        },
                        'pm25': {
                            'min': round(result['min_pm25'], 1),
                            'max': round(result['max_pm25'], 1),
                            'avg': round(result['avg_pm25'], 1)
                        },
                        'pm10': {
                            'min': round(result['min_pm10'], 1),
                            'max': round(result['max_pm10'], 1),
                            'avg': round(result['avg_pm10'], 1)
                        },
                        'co2': {
                            'min': int(result['min_co2']),
                            'max': int(result['max_co2']),
                            'avg': int(result['avg_co2'])
                        },
                        'alert_count': result['alert_count'] or 0
                    }
                    
        except Exception as e:
            print(f"Error fetching statistics: {e}")
        finally:
            if connection:
                connection.close()
    
    return jsonify({'success': True, 'data': stats_data})

# New API endpoint for sensor status
@app.route('/api/sensor/status')
def api_sensor_status():
    return jsonify({
        'success': True,
        'sensor_enabled': SENSOR_READER_ENABLED,
        'sensor_type': 'Hardware Sensors' if SENSOR_READER_ENABLED else 'Manual Entry',
        'read_interval': SENSOR_READ_INTERVAL
    })

# --- Reports Routes ---
@app.route('/reports')
def reports():
    today = datetime.now().strftime('%Y-%m-%d')
    
    if not is_admin_authenticated():
        session.pop('report_admin', None)
        session.pop('last_activity', None)
        session.pop('last_report_data', None)
        session.pop('last_report_title', None)
    
    return render_template('reports.html', today=today)

@app.route('/api/reports/login', methods=['POST'])
def api_reports_login():
    data = request.get_json()
    password = data.get('password', '')
    
    if password == REPORT_ADMIN_PASSWORD:
        session['report_admin'] = True
        session['last_activity'] = datetime.now().isoformat()
        session.permanent = True
        
        return jsonify({'success': True})
    else:
        return jsonify({'success': False, 'error': 'Invalid password'})

@app.route('/api/reports/generate')
def api_reports_generate():
    if not is_admin_authenticated():
        return jsonify({'success': False, 'error': 'Session expired. Please login again.'}), 401
    
    period = request.args.get('period')
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    
    end_time = datetime.now()
    
    if period == '24h':
        start_time = end_time - timedelta(hours=24)
        report_title = "24-Hour Air Quality Report"
    elif period == '7d':
        start_time = end_time - timedelta(days=7)
        report_title = "7-Day Air Quality Report"
    elif period == '15d':
        start_time = end_time - timedelta(days=15)
        report_title = "15-Day Air Quality Report"
    elif period == '30d':
        start_time = end_time - timedelta(days=30)
        report_title = "30-Day Air Quality Report"
    elif start_date and end_date:
        try:
            start_time = datetime.strptime(start_date, '%Y-%m-%d')
            end_time = datetime.strptime(end_date, '%Y-%m-%d') + timedelta(days=1)
            report_title = f"Custom Air Quality Report ({start_date} to {end_date})"
        except ValueError:
            return jsonify({'success': False, 'error': 'Invalid date format'})
    else:
        return jsonify({'success': False, 'error': 'Invalid period specified'})
    
    report_data = generate_report_data(start_time, end_time)
    
    if 'error' in report_data:
        return jsonify({'success': False, 'error': report_data['error']})
    
    session['last_report_data'] = report_data
    session['last_report_title'] = report_title
    
    return jsonify({'success': True, 'data': report_data})

@app.route('/api/reports/export/csv')
def api_reports_export_csv():
    if not is_admin_authenticated():
        return jsonify({'success': False, 'error': 'Session expired. Please login again.'}), 401

    report_data = session.get('last_report_data')
    report_title = request.args.get('title') or session.get('last_report_title', 'Air Quality Report')

    if not report_data:
        return jsonify({'success': False, 'error': 'No report data available'})

    csv_data = generate_csv_export(report_data, report_title)

    response = make_response(csv_data)
    response.headers['Content-Type'] = 'text/csv'
    response.headers['Content-Disposition'] = f'attachment; filename="{report_title}.csv"'

    return response
    if not is_admin_authenticated():
        return jsonify({'success': False, 'error': 'Session expired. Please login again.'}), 401
    
    report_data = session.get('last_report_data')
    report_title = session.get('last_report_title', 'Air Quality Report')
    
    if not report_data:
        return jsonify({'success': False, 'error': 'No report data available'})
    
    csv_data = generate_csv_export(report_data, report_title)
    
    response = make_response(csv_data)
    response.headers['Content-Type'] = 'text/csv'
    response.headers['Content-Disposition'] = f'attachment; filename="{report_title.replace(" ", "_")}.csv"'
    
    return response

@app.route('/api/reports/export/pdf')
def api_reports_export_pdf():
    if not is_admin_authenticated():
        return jsonify({'success': False, 'error': 'Session expired. Please login again.'}), 401

    report_data = session.get('last_report_data')
    report_title = request.args.get('title') or session.get('last_report_title', 'Air Quality Report')

    if not report_data:
        return jsonify({'success': False, 'error': 'No report data available'})

    pdf_data = generate_pdf_export(report_data, report_title)

    response = make_response(pdf_data)
    response.headers['Content-Type'] = 'application/pdf'
    response.headers['Content-Disposition'] = f'attachment; filename="{report_title}.pdf"'

    return response
    if not is_admin_authenticated():
        return jsonify({'success': False, 'error': 'Session expired. Please login again.'}), 401
    
    report_data = session.get('last_report_data')
    report_title = session.get('last_report_title', 'Air Quality Report')
    
    if not report_data:
        return jsonify({'success': False, 'error': 'No report data available'})
    
    try:
        pdf_data = generate_pdf_export(report_data, report_title)
        
        response = make_response(pdf_data)
        response.headers['Content-Type'] = 'application/pdf'
        response.headers['Content-Disposition'] = f'attachment; filename="{report_title.replace(" ", "_")}.pdf"'
        
        return response
    except Exception as e:
        print(f"PDF Generation Error: {e}")
        return jsonify({'success': False, 'error': f'PDF generation failed: {str(e)}'}), 500

@app.route('/api/reports/logout')
def api_reports_logout():
    session.clear()
    return jsonify({'success': True})

@app.route('/api/reports/check-session')
def api_reports_check_session():
    if is_admin_authenticated():
        return jsonify({'success': True, 'authenticated': True})
    else:
        return jsonify({'success': True, 'authenticated': False})

# --- Manual Entry Route ---
def validate_data(data):
    errors = {}
    for key, sensor_info in SENSOR_RANGES.items():
        min_val = sensor_info['min']
        max_val = sensor_info['max']
        
        if key in data:
            try:
                value = int(data[key]) if key == 'co2_ppm' else float(data[key])
                if not (min_val <= value <= max_val):
                    errors[key] = f"Value {value} out of range. Must be between {min_val} and {max_val}."
            except ValueError:
                errors[key] = f"Invalid format for {key}. Must be a number."
    return errors

@app.route('/manual_entry', methods=['GET', 'POST'])
def manual_entry():
    if request.method == 'POST':
        form_data = request.form.to_dict()
        
        errors = validate_data(form_data)
        if errors:
            for key, error in errors.items():
                flash(f"Validation Error ({key.upper()}): {error}", 'error')
            return redirect(url_for('manual_entry'))

        data = {}
        for key in form_data:
            if key == 'co2_ppm':
                data[key] = int(form_data[key])
            else:
                try:
                    data[key] = float(form_data[key])
                except ValueError:
                    data[key] = None 
        
        data['calculated_aqi'] = calculate_aqi(data)
        
        try:
            connection = get_db_connection()
            if connection:
                with connection.cursor() as cursor:
                    fields = ', '.join(data.keys())
                    placeholders = ', '.join(['%s'] * len(data))
                    sql = f"INSERT INTO sensor_readings ({fields}) VALUES ({placeholders})"
                    
                    cursor.execute(sql, tuple(data.values()))
                connection.commit()
                flash('Data successfully submitted and AQI calculated!', 'success')
                return redirect(url_for('index'))
            else:
                 flash("Error: Could not establish database connection.", 'error')
                 return redirect(url_for('manual_entry'))
        except Exception as e:
            flash(f"Database Error: Could not save data. Details: {e}", 'error')
            if 'connection' in locals() and connection:
                connection.rollback()
            return redirect(url_for('manual_entry'))
        finally:
            if 'connection' in locals() and connection:
                connection.close()

    return render_template('manual_entry.html', ranges=SENSOR_RANGES)

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5001)