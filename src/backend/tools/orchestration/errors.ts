export class InterruptedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InterruptedError";
  }
}