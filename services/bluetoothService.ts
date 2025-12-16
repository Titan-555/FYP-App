// Generic Bluetooth Service for BLE Sensors
// Note: Web Bluetooth requires HTTPS or Localhost to work.

export class BluetoothService {
  private device: any = null; // Using any to avoid requiring @types/web-bluetooth
  private server: any = null;
  private service: any = null;
  private characteristic: any = null;
  private onDataCallback: ((value: number) => void) | null = null;
  private textDecoder = new TextDecoder();
  private dataBuffer: string = "";

  // CONFIGURATION: Replace these with your specific device UUIDs if different.
  // These are standard UUIDs for HM-10/CC2541/ESP32 Serial Modules often used in DIY sensors.
  // If you use a custom Service UUID, place it here.
  // Note: You must use lowercase.
  private static SERVICE_UUID = '0000ffe0-0000-1000-8000-00805f9b34fb'; 
  private static CHARACTERISTIC_UUID = '0000ffe1-0000-1000-8000-00805f9b34fb';

  async connect(): Promise<boolean> {
    if (!('bluetooth' in navigator)) {
      throw new Error('Bluetooth is not supported in this browser. Please use Chrome/Edge on Desktop or Android.');
    }

    try {
      console.log('Requesting Bluetooth Device...');
      
      // Request device with a filter. 
      // We accept all devices but must specify the service we want to access in optionalServices.
      this.device = await (navigator as any).bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [BluetoothService.SERVICE_UUID] 
      });

      this.device.addEventListener('gattserverdisconnected', this.onDisconnected.bind(this));

      console.log('Connecting to GATT Server...');
      this.server = await this.device.gatt.connect();

      console.log('Getting Service...');
      this.service = await this.server.getPrimaryService(BluetoothService.SERVICE_UUID);

      console.log('Getting Characteristic...');
      this.characteristic = await this.service.getCharacteristic(BluetoothService.CHARACTERISTIC_UUID);

      console.log('Bluetooth Connected!');
      return true;
    } catch (error) {
      console.error('Bluetooth Connection Error:', error);
      throw error;
    }
  }

  disconnect() {
    if (this.device && this.device.gatt.connected) {
      this.device.gatt.disconnect();
    }
    this.device = null;
    this.server = null;
    this.service = null;
    this.characteristic = null;
  }

  isConnected(): boolean {
    return this.device && this.device.gatt.connected;
  }

  getDeviceName(): string | null {
    return this.device ? this.device.name : null;
  }

  async startStreaming(callback: (value: number) => void) {
    if (!this.characteristic) {
      throw new Error("No characteristic connected");
    }

    this.onDataCallback = callback;
    
    await this.characteristic.startNotifications();
    this.characteristic.addEventListener('characteristicvaluechanged', this.handleNotifications.bind(this));
  }

  async stopStreaming() {
    if (this.characteristic) {
      try {
        await this.characteristic.stopNotifications();
        this.characteristic.removeEventListener('characteristicvaluechanged', this.handleNotifications.bind(this));
      } catch (e) {
        console.warn("Error stopping notifications", e);
      }
    }
  }

  private handleNotifications(event: any) {
    const value = event.target.value;
    
    // PARSING LOGIC
    // Scenario A: Your device sends raw text like "1.23\n2.45\n"
    const chunk = this.textDecoder.decode(value);
    this.dataBuffer += chunk;
    
    // Process complete lines
    const lines = this.dataBuffer.split('\n');
    // Keep the last incomplete chunk in the buffer
    this.dataBuffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length > 0) {
        // Parse float
        const voltage = parseFloat(trimmed);
        if (!isNaN(voltage) && this.onDataCallback) {
          this.onDataCallback(voltage);
        }
      }
    }

    /* 
    // Scenario B: Your device sends raw bytes (e.g., 2 bytes for int16)
    // Uncomment this and comment out Scenario A if needed.
    
    const dataView = new DataView(value.buffer);
    // Example: Read Int16 Little Endian
    const rawInt = dataView.getInt16(0, true); 
    // Scale it (e.g. if 0-4095 maps to 0-3.3V)
    const voltage = (rawInt / 4095) * 3.3; 
    
    if (this.onDataCallback) {
       this.onDataCallback(voltage);
    }
    */
  }

  private onDisconnected(event: any) {
    const device = event.target;
    console.log(`Device ${device.name} is disconnected.`);
    // You might want to trigger a callback in the App to update UI status
  }
}
