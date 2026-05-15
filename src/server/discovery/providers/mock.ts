import type {
  DiscoveryInput,
  DiscoveryProvider,
  RawCandidate,
} from "../types";

/**
 * MockProvider — for tests and local dev. Returns a fixed list of
 * RawCandidates regardless of input. Lets tests exercise the engine's
 * fetch → classify → persist pipeline without an external dependency.
 */
export class MockProvider implements DiscoveryProvider {
  readonly name: string;
  constructor(
    private readonly candidates: RawCandidate[],
    name = "mock-v1",
  ) {
    this.name = name;
  }

  async discover(_input: DiscoveryInput): Promise<RawCandidate[]> {
    return [...this.candidates];
  }
}
