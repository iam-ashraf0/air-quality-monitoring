#!/bin/bash
echo "Setting up Raspberry Pi for Air Quality Monitor..."

# Update system
sudo apt update
sudo apt upgrade -y

# Install Python and pip
sudo apt install python3 python3-pip python3-venv -y

# Install system dependencies for sensors
sudo apt install i2c-tools libatlas-base-dev -y

# Enable I2C
sudo raspi-config nonint do_i2c 0

# Create virtual environment
python3 -m venv aqi_env
source aqi_env/bin/activate

# Install Python packages
pip install --upgrade pip
pip install -r requirements.txt

echo "Setup complete! Activate virtual environment with: source aqi_env/bin/activate"
echo "Then run: python app.py"