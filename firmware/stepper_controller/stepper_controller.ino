// Microscope stepper controller firmware.
// Upload this sketch to the Arduino-compatible board connected to the Pi.

struct Axis {
  uint8_t stepPin;
  uint8_t dirPin;
  bool forwardLevel;
};

const Axis X_AXIS = {2, 5, HIGH};
const Axis Y_AXIS = {3, 6, HIGH};
const Axis Z_AXIS = {4, 7, LOW};

const uint8_t ENABLE_PIN = 8;
const unsigned long PULSE_US = 600;
const long MIN_STEPS = 1;
const long MAX_STEPS = 50000;

long stepAmount = 400;
bool motorsEnabled = true;
char commandBuffer[24];
uint8_t commandLength = 0;

void setupAxis(const Axis &axis) {
  pinMode(axis.stepPin, OUTPUT);
  pinMode(axis.dirPin, OUTPUT);
  digitalWrite(axis.stepPin, LOW);
  digitalWrite(axis.dirPin, axis.forwardLevel);
}

void setMotorsEnabled(bool enabled) {
  motorsEnabled = enabled;
  digitalWrite(ENABLE_PIN, enabled ? LOW : HIGH);
}

void pulsePin(uint8_t pin) {
  digitalWrite(pin, HIGH);
  delayMicroseconds(PULSE_US);
  digitalWrite(pin, LOW);
}

void moveAxis(const Axis &axis, long steps, bool forward) {
  if (!motorsEnabled) {
    Serial.println("ERR:motors_disabled");
    return;
  }

  digitalWrite(axis.dirPin, forward ? axis.forwardLevel : !axis.forwardLevel);
  for (long i = 0; i < steps; i++) {
    pulsePin(axis.stepPin);
    delayMicroseconds(PULSE_US);
  }
  Serial.println("OK:move_complete");
}

void moveTwoAxes(const Axis &axisA, const Axis &axisB, long steps, bool forward) {
  if (!motorsEnabled) {
    Serial.println("ERR:motors_disabled");
    return;
  }

  digitalWrite(axisA.dirPin, forward ? axisA.forwardLevel : !axisA.forwardLevel);
  digitalWrite(axisB.dirPin, forward ? axisB.forwardLevel : !axisB.forwardLevel);
  for (long i = 0; i < steps; i++) {
    digitalWrite(axisA.stepPin, HIGH);
    digitalWrite(axisB.stepPin, HIGH);
    delayMicroseconds(PULSE_US);
    digitalWrite(axisA.stepPin, LOW);
    digitalWrite(axisB.stepPin, LOW);
    delayMicroseconds(PULSE_US);
  }
  Serial.println("OK:move_complete");
}

void setStepAmount(const char *value) {
  char *endPtr = nullptr;
  long parsed = strtol(value, &endPtr, 10);
  if (endPtr == value || parsed < MIN_STEPS || parsed > MAX_STEPS) {
    Serial.println("ERR:invalid_steps");
    return;
  }

  stepAmount = parsed;
  Serial.print("OK:steps=");
  Serial.println(stepAmount);
}

void executeCommand(char *command) {
  if (command[0] == '\0') return;

  switch (command[0]) {
    case 'S':
      setStepAmount(command + 1);
      break;
    case 'X':
      moveAxis(X_AXIS, stepAmount, true);
      break;
    case 'x':
      moveAxis(X_AXIS, stepAmount, false);
      break;
    case 'A':
      moveTwoAxes(Z_AXIS, Y_AXIS, stepAmount, true);
      break;
    case 'a':
      moveTwoAxes(Z_AXIS, Y_AXIS, stepAmount, false);
      break;
    case 'E':
      setMotorsEnabled(true);
      Serial.println("OK:motors_enabled");
      break;
    case 'D':
      setMotorsEnabled(false);
      Serial.println("OK:motors_disabled");
      break;
    case 'T':
      Serial.println("OK:test");
      break;
    case '?':
      Serial.print("OK:steps=");
      Serial.print(stepAmount);
      Serial.print(",enabled=");
      Serial.println(motorsEnabled ? "1" : "0");
      break;
    default:
      Serial.println("ERR:unknown_command");
      break;
  }
}

void setup() {
  setupAxis(X_AXIS);
  setupAxis(Y_AXIS);
  setupAxis(Z_AXIS);
  pinMode(ENABLE_PIN, OUTPUT);
  setMotorsEnabled(true);

  Serial.begin(9600);
  Serial.println("OK:microscope_stepper_ready");
}

void loop() {
  while (Serial.available() > 0) {
    char incoming = Serial.read();
    if (incoming == '\r') continue;

    if (incoming == '\n') {
      commandBuffer[commandLength] = '\0';
      executeCommand(commandBuffer);
      commandLength = 0;
      continue;
    }

    if (commandLength < sizeof(commandBuffer) - 1) {
      commandBuffer[commandLength++] = incoming;
    } else {
      commandLength = 0;
      Serial.println("ERR:command_too_long");
    }
  }
}
