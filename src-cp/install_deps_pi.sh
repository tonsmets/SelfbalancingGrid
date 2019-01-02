#!/bin/bash

# Check for root
if [[ $EUID -ne 0 ]]; then
   echo "This script must be run as root" 
   exit 1
fi

# Install NodeJS
apt-get update
curl -sL https://deb.nodesource.com/setup_8.x | sudo -E bash -
apt-get install -y nodejs
node -v

# Create working directory
mkdir -P /home/pi/electron
chown -R pi:pi /home/pi/electron

# Fill the working directory with our application


# Create launch file
cat <<EOF >/home/pi/Desktop/launch.sh
#!/bin/bash
cd /home/pi/electron
npm install
npm start
EOF
chown pi:pi /home/pi/Desktop/launch.sh
chmod +x /home/pi/Desktop/launch.sh

# Backup autostart file
cp /home/pi/.config/lxsession/LXDE-pi/autostart /home/pi/autostart.backup

# Hide mouse pointer
apt-get install unclutter
echo "@unclutter -idle 0" >> /home/pi/.config/lxsession/LXDE-pi/autostart

# Disable screen sleep
echo "@xset s noblank" >> /home/pi/.config/lxsession/LXDE-pi/autostart
echo "@xset s off" >> /home/pi/.config/lxsession/LXDE-pi/autostart
echo "@xset -dpms" >> /home/pi/.config/lxsession/LXDE-pi/autostart

# Add auto startup to crontab
echo "$(echo '@reboot export DISPLAY=:0 && /home/pi/Desktop/launch.sh' ; crontab -u pi -l)" | crontab -u pi -

# Reboot the pi
reboot
