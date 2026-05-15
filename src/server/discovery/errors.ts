export abstract class DiscoveryError extends Error {
  abstract readonly code: string;
  constructor(message: string, public readonly details?: unknown) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class RobotsBlockedError extends DiscoveryError {
  readonly code = "robots_blocked";
}

export class FetchFailedError extends DiscoveryError {
  readonly code = "fetch_failed";
}

export class InvalidProviderInputError extends DiscoveryError {
  readonly code = "invalid_provider_input";
}

export class ProviderNotImplementedError extends DiscoveryError {
  readonly code = "provider_not_implemented";
}
