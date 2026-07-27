export type DiscoverItemType = 'skill' | 'mcp' | 'plugin';
export type DiscoverSource = 'github' | 'mcp_registry' | 'smithery';

export interface DiscoverResult {
  source: DiscoverSource;
  itemType: DiscoverItemType;
  name: string;
  description: string | null;
  url: string;
  rating: { kind: 'stars' | 'use_count' | 'official'; value: number | null };
  verified: boolean;
}
