const { SerialPort } = require('serialport');

let port;

const connectToArduino = (portName) => {
  port = new SerialPort({ path: portName, baudRate: 9600 }, (err) => {
    if (err) {
      console.error('Error opening port:', err.message);
    } else {
      console.log(`Connected to ${portName}`);
    }
  });
};

const sendCommand = (command) => {
  if (port && port.isOpen) {
    port.write(command, (err) => {
      if (err) {
        console.error('Error sending command:', err.message);
      } else {
        console.log(`Command sent: ${command}`);
      }
    });
  } else {
    console.error('Port is not open');
  }
};

module.exports = { connectToArduino, sendCommand };