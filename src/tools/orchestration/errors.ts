export class InterruptedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InterruptedError";
  }
}

export class HumanInterventionRequiredError extends Error {
  public readonly question: string;
  constructor(question: string) {
    super("Human intervention is required.");
    this.name = "HumanInterventionRequiredError";
    this.question = question;
  }
}