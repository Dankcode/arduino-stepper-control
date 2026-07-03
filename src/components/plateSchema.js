export const wellSchema = {
  well: 'string',
  type: "object",
  properties: {
    stepAmount: { type: "number", default: 0 },
    delayBetweenStep: { type: "number", default: 0 },
    lightTime: { type: "number", default: 0 },
    exposureTime: { type: "number", default: 0 },
    switchPlate: { type: "boolean", default: false },
  },
};
