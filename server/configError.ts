/** Carries setting names only. Never attach environment values or raw validation issues. */
export class ConfigurationError extends Error {
  constructor(public readonly configurationFields: string[], message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}
