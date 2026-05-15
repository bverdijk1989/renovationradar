/**
 * Connector-specific error hierarchy. The runner catches these and converts
 * them into structured `CrawlJob.errorMessage` strings; nothing else should
 * try to be clever with them.
 *
 * Every error carries:
 *   - `code`: stable identifier, surfaced in CrawlJob.meta
 *   - human-readable Dutch `message`
 *   - optional `details` (URL, status code, missing field, ...)
 */
export abstract class ConnectorError extends Error {
  abstract readonly code: string;
  constructor(message: string, public readonly details?: unknown) {
    super(message);
    this.name = this.constructor.name;
  }
}

/** Source.status != active OR legalStatus != green. Runner refuses to run. */
export class LegalGateError extends ConnectorError {
  readonly code = "legal_gate_blocked";
}

/** No connector in the registry claims the source. */
export class NoConnectorError extends ConnectorError {
  readonly code = "no_connector";
}

/** validateSource() returned ok=false. */
export class SourceValidationError extends ConnectorError {
  readonly code = "source_validation_failed";
}

/** HTTP layer failure. */
export class TransportError extends ConnectorError {
  readonly code = "transport_error";
}

/** Rate limiter said wait too long, or AbortSignal fired. */
export class RateLimitError extends ConnectorError {
  readonly code = "rate_limited";
}

/** Payload couldn't be parsed (bad XML, malformed JSON, ...). */
export class ParseError extends ConnectorError {
  readonly code = "parse_error";
}

/** Connector explicitly refuses to run (e.g. placeholder for API/HTML). */
export class NotImplementedError extends ConnectorError {
  readonly code = "not_implemented";
}

/** CrawlJob row vanished between enqueue and run (deleted, race condition). */
export class JobNotFoundError extends ConnectorError {
  readonly code = "job_not_found";
}
