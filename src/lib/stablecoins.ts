export interface StablecoinRegistryEntry {
  chain: 'ethereum' | 'base' | 'arbitrum' | 'optimism' | 'polygon';
  chainId: number;
  symbol: 'USDC' | 'USDT' | 'DAI';
  name: string;
  address: string;
  decimals: number;
  canonical: boolean;
}

export interface StablecoinRegistryResponse {
  source: 'api' | 'embedded_fallback';
  endpoint: string;
  data: StablecoinRegistryEntry[];
}

const CHAIN_ALIASES: Record<string, StablecoinRegistryEntry['chain']> = {
  arbitrum: 'arbitrum',
  'arbitrum one': 'arbitrum',
  base: 'base',
  eth: 'ethereum',
  ethereum: 'ethereum',
  mainnet: 'ethereum',
  op: 'optimism',
  optimism: 'optimism',
  'op mainnet': 'optimism',
  polygon: 'polygon',
  'polygon pos': 'polygon',
  'polygon mainnet': 'polygon',
};

export const EMBEDDED_STABLECOINS: StablecoinRegistryEntry[] = [
  { chain: 'ethereum', chainId: 1, symbol: 'USDC', name: 'USD Coin', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6, canonical: true },
  { chain: 'ethereum', chainId: 1, symbol: 'USDT', name: 'Tether USD', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6, canonical: true },
  { chain: 'ethereum', chainId: 1, symbol: 'DAI', name: 'Dai Stablecoin', address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', decimals: 18, canonical: true },
  { chain: 'base', chainId: 8453, symbol: 'USDC', name: 'USD Coin', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6, canonical: true },
  { chain: 'base', chainId: 8453, symbol: 'USDT', name: 'Bridged Tether USD', address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', decimals: 6, canonical: false },
  { chain: 'base', chainId: 8453, symbol: 'DAI', name: 'Dai Stablecoin', address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', decimals: 18, canonical: false },
  { chain: 'arbitrum', chainId: 42161, symbol: 'USDC', name: 'USD Coin', address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6, canonical: true },
  { chain: 'arbitrum', chainId: 42161, symbol: 'USDT', name: 'Tether USD', address: '0xFd086bC7CD5C481DCC9C85ebe478A1C0b69FCbb9', decimals: 6, canonical: false },
  { chain: 'arbitrum', chainId: 42161, symbol: 'DAI', name: 'Dai Stablecoin', address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', decimals: 18, canonical: false },
  { chain: 'optimism', chainId: 10, symbol: 'USDC', name: 'USD Coin', address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', decimals: 6, canonical: true },
  { chain: 'optimism', chainId: 10, symbol: 'USDT', name: 'Tether USD', address: '0x94b008aA00579c1307B0EF2c499aD98a8CE58e58', decimals: 6, canonical: false },
  { chain: 'optimism', chainId: 10, symbol: 'DAI', name: 'Dai Stablecoin', address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', decimals: 18, canonical: false },
  { chain: 'polygon', chainId: 137, symbol: 'USDC', name: 'USD Coin', address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', decimals: 6, canonical: true },
  { chain: 'polygon', chainId: 137, symbol: 'USDT', name: 'Tether USD', address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6, canonical: false },
  { chain: 'polygon', chainId: 137, symbol: 'DAI', name: 'Dai Stablecoin', address: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063', decimals: 18, canonical: false },
];

export function normalizeChain(chain: string): StablecoinRegistryEntry['chain'] | null {
  return CHAIN_ALIASES[chain.trim().toLowerCase()] ?? null;
}

export function getStablecoinRegistry(chain?: string): StablecoinRegistryEntry[] {
  if (!chain) return [...EMBEDDED_STABLECOINS];

  const normalized = normalizeChain(chain);
  if (!normalized) return [];

  return EMBEDDED_STABLECOINS.filter((token) => token.chain === normalized);
}
