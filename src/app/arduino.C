// Arduino Sketch for Stepper Motor Control

// --- Axis Definition Structure ---
struct Axis {
  int stepPin;
  int dirPin;
  bool initialDirection; // true for HIGH, false for LOW
};

// Define each axis with step and direction pins
Axis xAxis = {2, 5, true};
Axis yAxis = {3, 6, true};
Axis zAxis = {4, 7, false};

const int enPin = 8; // Enable pin (active LOW for most drivers)

int stepAmount = 400; // Default step amount
bool motorsEnabled = true;

// --- Helper Functions ---

void setupAxis(Axis axis) {
  pinMode(axis.stepPin, OUTPUT);
  pinMode(axis.dirPin, OUTPUT);
  // Set the initial direction
  digitalWrite(axis.dirPin, axis.initialDirection ? HIGH : LOW);
}

void stepAxis(Axis axis) {
  digitalWrite(axis.stepPin, HIGH);
  delayMicroseconds(1000); // Pulse width (Adjust for faster/slower stepping)
  digitalWrite(axis.stepPin, LOW);
  delayMicroseconds(1000); // Time between steps
}
void moveAxis(Axis axis, int steps, bool direction) {
  if (!motorsEnabled) return;
  Serial.print("Moving steps: "); Serial.println(steps);
  
  // Set Direction
  digitalWrite(axis.dirPin, direction ? HIGH : LOW);
  
  for (int i = 0; i < steps; i++) {
    stepAxis(axis);
  }
  Serial.println("Move complete.");
}

void moveTwoAxes(Axis axis1, Axis axis2, int steps, bool direction) {
  if (!motorsEnabled) return;
  Serial.println("Moving two axes simultaneously...");
  
  // Set Direction for both
  digitalWrite(axis1.dirPin, direction ? HIGH : LOW);
  digitalWrite(axis2.dirPin, direction ? HIGH : LOW);
  
  for (int i = 0; i < steps; i++) {
    // Step both axes simultaneously
    digitalWrite(axis1.stepPin, HIGH);
    digitalWrite(axis2.stepPin, HIGH);
    delayMicroseconds(1000);
    digitalWrite(axis1.stepPin, LOW);
    digitalWrite(axis2.stepPin, LOW);
    delayMicroseconds(1000);
  }
  Serial.println("Move complete.");
}


// --- Setup ---

void setup() {
  // Set up axes
  setupAxis(xAxis);
  setupAxis(yAxis);
  setupAxis(zAxis);

  // Set up enable pin and enable motors by default
  pinMode(enPin, OUTPUT);
  digitalWrite(enPin, LOW); // Enable the motor driver (Active LOW)

  // Initialize serial communication
  Serial.begin(9600);
  Serial.println("Arduino Stepper Motor Control Initialized");
}
// --- Main Loop ---

void loop() {
  if (Serial.available() > 0) {
    char command = Serial.read();

    // Handle step amount updates (S command requires reading a string)
    if (command == 'S') {
      // Wait briefly for the rest of the data (the number) to arrive
      delay(10); 
      String stepString = Serial.readStringUntil('\n');
      stepString.trim(); // Clean up any whitespace
      if (stepString.length() > 0) {
        stepAmount = stepString.toInt();
        Serial.print("Step amount updated to: ");
        Serial.println(stepAmount);
      } else {
         Serial.println("Error: No step value received after 'S'.");
      }
      return; // Exit loop after handling S command
    }

    // Execute single-character commands
    switch (command) {
      case 'X': // Move X axis forward (true=forward)
        moveAxis(xAxis, stepAmount, true);
        break;
      case 'x': // Move X axis backward (false=backward)
        moveAxis(xAxis, stepAmount, false);
        break;
      case 'A': // Move Z and Y axes forward simultaneously
        moveTwoAxes(zAxis, yAxis, stepAmount, true);
        break;
      case 'a': // Move Z and Y axes backward simultaneously
        moveTwoAxes(zAxis, yAxis, stepAmount, false);
        break;
      case 'E': // Enable motors
        digitalWrite(enPin, LOW);
        motorsEnabled = true;
        Serial.println("Motors enabled");
        break;
      case 'D': // Disable motors
        digitalWrite(enPin, HIGH);
        motorsEnabled = false;
        Serial.println("Motors disabled");
        break;
      case 'T': // Test message
        Serial.println("Test message: Motors are working properly");
        break;
      default:
        Serial.println("Unknown command received.");
        break;
    }
  }
}