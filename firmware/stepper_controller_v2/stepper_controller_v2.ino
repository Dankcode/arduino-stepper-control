// Stepper controller firmware V2.
// Non-blocking multi-axis stepping with a small command queue and OK/ERR
// replies for the Pi backend.

struct Axis {
  uint8_t stepPin;
  uint8_t dirPin;
  bool forwardLevel;
  long position;
};

Axis axes[3] = {
  {2, 5, HIGH, 0},  // X
  {3, 6, HIGH, 0},  // Y
  {4, 7, LOW,  0},  // Z
};

const uint8_t ENABLE_PIN = 8;
const bool ENABLE_ACTIVE_LEVEL = LOW;

struct Move { long dx, dy, dz; };
const uint8_t QUEUE_DEPTH = 4;
Move queueBuf[QUEUE_DEPTH];
uint8_t qHead = 0;
uint8_t qCount = 0;

float vmax = 2000.0;
float acc = 4000.0;
long legacyStepAmount = 400;
bool motorsEnabled = true;

Move currentMove = {0, 0, 0};
long absDelta[3] = {0, 0, 0};
int dirSign[3] = {0, 0, 0};
long errorAcc[3] = {0, 0, 0};
long dominantSteps = 0;
long completedSteps = 0;
unsigned long nextStepAtMicros = 0;
bool moveActive = false;

char lineBuffer[80];
uint8_t lineLength = 0;

long max3(long a, long b, long c) {
  long m = a > b ? a : b;
  return m > c ? m : c;
}

void setMotorsEnabled(bool enabled) {
  motorsEnabled = enabled;
  digitalWrite(ENABLE_PIN, enabled ? ENABLE_ACTIVE_LEVEL : !ENABLE_ACTIVE_LEVEL);
}

void printDone() {
  Serial.print("OK:done ");
  Serial.print(axes[0].position);
  Serial.print(' ');
  Serial.print(axes[1].position);
  Serial.print(' ');
  Serial.println(axes[2].position);
}

void reportPosition() {
  Serial.print("POS ");
  Serial.print(axes[0].position);
  Serial.print(' ');
  Serial.print(axes[1].position);
  Serial.print(' ');
  Serial.print(axes[2].position);
  Serial.print("; Q ");
  Serial.print(qCount + (moveActive ? 1 : 0));
  Serial.print("; EN ");
  Serial.println(motorsEnabled ? 1 : 0);
}

void computeRamp(const Move &m) {
  currentMove = m;
  absDelta[0] = labs(m.dx);
  absDelta[1] = labs(m.dy);
  absDelta[2] = labs(m.dz);
  dirSign[0] = (m.dx > 0) - (m.dx < 0);
  dirSign[1] = (m.dy > 0) - (m.dy < 0);
  dirSign[2] = (m.dz > 0) - (m.dz < 0);
  dominantSteps = max3(absDelta[0], absDelta[1], absDelta[2]);
  completedSteps = 0;
  errorAcc[0] = 0;
  errorAcc[1] = 0;
  errorAcc[2] = 0;

  for (uint8_t i = 0; i < 3; i++) {
    if (dirSign[i] != 0) {
      bool forward = dirSign[i] > 0;
      digitalWrite(axes[i].dirPin, forward ? axes[i].forwardLevel : !axes[i].forwardLevel);
    }
  }

  nextStepAtMicros = micros();
  moveActive = dominantSteps > 0;
  if (!moveActive) {
    printDone();
  }
}

bool popQueuedMove(Move &m) {
  if (qCount == 0) return false;
  m = queueBuf[qHead];
  qHead = (qHead + 1) % QUEUE_DEPTH;
  qCount--;
  return true;
}

void startNextMoveIfIdle() {
  if (moveActive) return;
  Move next;
  if (popQueuedMove(next)) {
    computeRamp(next);
  }
}

float currentSpeed() {
  if (dominantSteps <= 0) return vmax;
  long remaining = dominantSteps - completedSteps;
  float accelLimited = sqrt(2.0 * acc * max(completedSteps, 1L));
  float decelLimited = sqrt(2.0 * acc * max(remaining, 1L));
  float speed = min(vmax, min(accelLimited, decelLimited));
  return max(speed, 50.0);
}

void pulseAxis(uint8_t axisIndex) {
  digitalWrite(axes[axisIndex].stepPin, HIGH);
  digitalWrite(axes[axisIndex].stepPin, LOW);
  axes[axisIndex].position += dirSign[axisIndex];
}

void tickSteppers() {
  if (!moveActive) {
    startNextMoveIfIdle();
    return;
  }

  unsigned long now = micros();
  if ((long)(now - nextStepAtMicros) < 0) return;

  for (uint8_t i = 0; i < 3; i++) {
    if (absDelta[i] == 0) continue;
    errorAcc[i] += absDelta[i];
    if (errorAcc[i] >= dominantSteps) {
      errorAcc[i] -= dominantSteps;
      pulseAxis(i);
    }
  }

  completedSteps++;
  if (completedSteps >= dominantSteps) {
    moveActive = false;
    printDone();
    startNextMoveIfIdle();
    return;
  }

  float speed = currentSpeed();
  nextStepAtMicros = now + (unsigned long)(1000000.0 / speed);
}

void enqueueMove(long dx, long dy, long dz) {
  if (qCount >= QUEUE_DEPTH) {
    Serial.println("ERR:queue_full");
    return;
  }

  uint8_t tail = (qHead + qCount) % QUEUE_DEPTH;
  queueBuf[tail].dx = dx;
  queueBuf[tail].dy = dy;
  queueBuf[tail].dz = dz;
  qCount++;
  Serial.println("OK:queued");
  startNextMoveIfIdle();
}

void abortAll() {
  qHead = 0;
  qCount = 0;
  moveActive = false;
  Serial.println("OK:aborted");
  reportPosition();
}

void homeAxes() {
  Serial.println("ERR:no_limit_switches");
}

bool parseLong(char *token, long &out) {
  if (token == NULL) return false;
  char *endPtr = NULL;
  out = strtol(token, &endPtr, 10);
  return endPtr != token && *endPtr == '\0';
}

void parseCommand(char *line) {
  char *cmd = strtok(line, " ");
  if (cmd == NULL) return;

  if (strcmp(cmd, "M") == 0) {
    long dx, dy, dz;
    if (!parseLong(strtok(NULL, " "), dx) ||
        !parseLong(strtok(NULL, " "), dy) ||
        !parseLong(strtok(NULL, " "), dz)) {
      Serial.println("ERR:parse");
      return;
    }
    enqueueMove(dx, dy, dz);
    return;
  }

  if (strcmp(cmd, "V") == 0) {
    long nextVmax, nextAcc;
    if (!parseLong(strtok(NULL, " "), nextVmax) ||
        !parseLong(strtok(NULL, " "), nextAcc) ||
        nextVmax <= 0 || nextAcc <= 0) {
      Serial.println("ERR:parse");
      return;
    }
    vmax = nextVmax;
    acc = nextAcc;
    Serial.println("OK:profile");
    return;
  }

  if (strcmp(cmd, "H") == 0) { homeAxes(); return; }
  if (strcmp(cmd, "!") == 0) { abortAll(); return; }
  if (strcmp(cmd, "?") == 0) { reportPosition(); return; }

  if (cmd[0] == 'S') {
    long steps;
    if (!parseLong(cmd + 1, steps) || steps <= 0) {
      Serial.println("ERR:parse");
      return;
    }
    legacyStepAmount = steps;
    Serial.println("OK:steps");
    return;
  }

  if (strcmp(cmd, "E") == 0) { setMotorsEnabled(true); Serial.println("OK:enabled"); return; }
  if (strcmp(cmd, "D") == 0) { setMotorsEnabled(false); Serial.println("OK:disabled"); return; }
  if (strcmp(cmd, "X") == 0) { enqueueMove(legacyStepAmount, 0, 0); return; }
  if (strcmp(cmd, "x") == 0) { enqueueMove(-legacyStepAmount, 0, 0); return; }
  if (strcmp(cmd, "A") == 0) { enqueueMove(0, legacyStepAmount, legacyStepAmount); return; }
  if (strcmp(cmd, "a") == 0) { enqueueMove(0, -legacyStepAmount, -legacyStepAmount); return; }
  if (strcmp(cmd, "T") == 0) {
    enqueueMove(legacyStepAmount, 0, 0);
    enqueueMove(-legacyStepAmount, 0, 0);
    return;
  }

  Serial.println("ERR:unknown_command");
}

void setup() {
  for (uint8_t i = 0; i < 3; i++) {
    pinMode(axes[i].stepPin, OUTPUT);
    pinMode(axes[i].dirPin, OUTPUT);
    digitalWrite(axes[i].stepPin, LOW);
    digitalWrite(axes[i].dirPin, axes[i].forwardLevel);
  }
  pinMode(ENABLE_PIN, OUTPUT);
  setMotorsEnabled(true);
  Serial.begin(115200);
  Serial.println("OK:stepper_v2_ready");
}

void loop() {
  while (Serial.available() > 0) {
    char ch = Serial.read();
    if (ch == '\r') continue;
    if (ch == '\n') {
      lineBuffer[lineLength] = '\0';
      parseCommand(lineBuffer);
      lineLength = 0;
    } else if (lineLength < sizeof(lineBuffer) - 1) {
      lineBuffer[lineLength++] = ch;
    } else {
      lineLength = 0;
      Serial.println("ERR:line_too_long");
    }
  }
  tickSteppers();
}
