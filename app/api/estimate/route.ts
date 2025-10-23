import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

interface EstimateRequest {
  itemType: string;
  brand: string;
  model: string;
  serialNo: string;
  accessories: string;
  condition: number;
  defects: string;
  note: string;
  images: string[];
  lineId: string;
}

interface EstimateResponse {
  success: boolean;
  estimatedPrice: number;
  condition: number;
  marketPrice: number;
  pawnPrice: number;
  confidence: number;
  allPrices: number[];
  sources: string[];
  normalizedInput: string;
  calculation: {
    marketPrice: string;
    pawnPrice: string;
    finalPrice: string;
  };
}

// Agent 1: Normalize input data
async function normalizeInput(input: EstimateRequest): Promise<string> {
  const prompt = `Normalize and clean the following product information for accurate pricing. Correct any typos, standardize formatting, and make the description suitable for market research:

Product Type: ${input.itemType}
Brand: ${input.brand}
Model: ${input.model}
Serial Number: ${input.serialNo}
Accessories: ${input.accessories}
Condition: ${input.condition}%
Defects: ${input.defects}
Additional Notes: ${input.note}

Please provide a clean, standardized description that would be suitable for searching second-hand market prices. Focus on key specifications and condition details.`;

  const response = await openai.responses.create({
    model: 'gpt-4.1-mini',
    input: prompt,
    // max_tokens: 300,
    // temperature: 0.1,
  });

  return response.output_text || '';
}

// Helper functions for advanced price calculation
function calculatePercentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) {
    return sorted[lower];
  }
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function calculateIQRMedian(prices: number[]): number {
  const Q1 = calculatePercentile(prices, 25);
  const Q3 = calculatePercentile(prices, 75);
  const IQR = Q3 - Q1;

  const lowerBound = Q1 - 1.5 * IQR;
  const upperBound = Q3 + 1.5 * IQR;

  const cleanedPrices = prices.filter(price => price >= lowerBound && price <= upperBound);

  if (cleanedPrices.length === 0) {
    return calculatePercentile(prices, 30); // Use 30th percentile for competitive pricing
  }

  return calculatePercentile(cleanedPrices, 25); // Use 25th percentile for competitive pricing
}

function calculateTrimmedMean(prices: number[]): number {
  const sortedPrices = [...prices].sort((a, b) => a - b);
  const n = sortedPrices.length;
  const startIdx = Math.floor(0.03 * n); // Remove bottom 3%
  const endIdx = Math.floor(0.75 * n); // Remove top 25%
  const trimmedPrices = sortedPrices.slice(startIdx, endIdx);

  if (trimmedPrices.length === 0) {
    return calculatePercentile(prices, 20);
  }

  const sum = trimmedPrices.reduce((acc, price) => acc + price, 0);
  return sum / trimmedPrices.length;
}

function calculateSimpleClusteringMedian(prices: number[]): number {
  if (prices.length < 3) {
    return calculatePercentile(prices, 50);
  }

  // Simple clustering by grouping prices into ranges
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min;
  const numBins = Math.min(10, Math.floor(prices.length / 3));

  if (range === 0) {
    return prices[0];
  }

  const binSize = range / numBins;
  const clusters: number[][] = Array.from({ length: numBins }, () => []);

  prices.forEach(price => {
    const binIndex = Math.min(Math.floor((price - min) / binSize), numBins - 1);
    clusters[binIndex].push(price);
  });

  // Find the largest cluster
  let maxClusterSize = 0;
  let mainClusterPrices: number[] = [];

  clusters.forEach(cluster => {
    if (cluster.length > maxClusterSize) {
      maxClusterSize = cluster.length;
      mainClusterPrices = cluster;
    }
  });

  if (mainClusterPrices.length === 0) {
    return calculatePercentile(prices, 20);
  }

  return calculatePercentile(mainClusterPrices, 20); // Use 20th percentile for competitive pricing
}

function calculateSimpleOutlierRemoval(prices: number[]): number {
  if (prices.length < 4) {
    return calculatePercentile(prices, 50);
  }

  // Simple outlier detection using IQR
  const Q1 = calculatePercentile(prices, 25);
  const Q3 = calculatePercentile(prices, 75);
  const IQR = Q3 - Q1;
  const lowerBound = Q1 - 1.5 * IQR;
  const upperBound = Q3 + 1.5 * IQR;

  const inlierPrices = prices.filter(price => price >= lowerBound && price <= upperBound);

  if (inlierPrices.length === 0) {
    return calculatePercentile(prices, 25);
  }

  return calculatePercentile(inlierPrices, 25); // Use 25th percentile for competitive pricing
}

function calculateRobustEnsemble(prices: number[], estimates: number[]): number {
  if (estimates.length === 0) {
    return calculatePercentile(prices, 20);
  }

  const validEstimates = estimates.filter(est => est > 0);
  if (validEstimates.length === 0) {
    return calculatePercentile(prices, 20);
  }

  // Calculate median of prices for weighting
  const medianPrice = calculatePercentile(prices, 50);

  // Calculate weights based on proximity to median
  const weights = validEstimates.map(est => {
    const distance = Math.abs(est - medianPrice) / medianPrice;
    return 1.0 / (1.0 + distance); // Inverse distance weighting
  });

  // Weighted average
  const totalWeight = weights.reduce((acc, weight) => acc + weight, 0);
  const weightedSum = validEstimates.reduce((acc, est, i) => acc + est * weights[i], 0);

  return weightedSum / totalWeight;
}

function calculateConfidenceScore(prices: number[], estimate: number): number {
  if (prices.length < 2 || estimate <= 0) {
    return 0.0;
  }

  // Calculate coefficient of variation
  const mean = prices.reduce((acc, price) => acc + price, 0) / prices.length;
  const variance = prices.reduce((acc, price) => acc + Math.pow(price - mean, 2), 0) / prices.length;
  const std = Math.sqrt(variance);
  const cv = std / mean;

  // Calculate how close estimate is to median
  const medianPrice = calculatePercentile(prices, 50);
  const estimateError = Math.abs(estimate - medianPrice) / medianPrice;

  // Calculate sample size factor
  const sampleFactor = Math.min(1.0, prices.length / 20.0);

  // Combined confidence score (0 to 1)
  const confidence = (1.0 - Math.min(cv, 1.0)) * (1.0 - Math.min(estimateError, 1.0)) * sampleFactor;

  return Math.max(0.0, Math.min(1.0, confidence));
}

function applyCompetitivePricingFilters(price: number, prices: number[]): number {
  if (!prices || prices.length === 0 || price <= 0) {
    return price;
  }

  const filteredPrices = prices.filter(p => p > 100 && p !== 999999);
  if (filteredPrices.length === 0) {
    return price;
  }

  // Calculate market position percentiles
  const percentile10 = calculatePercentile(filteredPrices, 10);
  const percentile15 = calculatePercentile(filteredPrices, 15);
  const percentile25 = calculatePercentile(filteredPrices, 25);
  const percentile30 = calculatePercentile(filteredPrices, 30);
  const percentile70 = calculatePercentile(filteredPrices, 70);
  const median = calculatePercentile(filteredPrices, 50);

  let competitivePrice = price;

  // Rule 1: If price is above median, bring it down towards 25th percentile
  if (price > median) {
    competitivePrice = percentile25 + (price - percentile25) * 0.4;
  }

  // Rule 2: If price is above 70th percentile of market, cap it at 30th percentile
  if (price > percentile70) {
    competitivePrice = Math.min(competitivePrice, percentile30);
  }

  // Rule 3: Ensure price is not below 15th percentile (avoid suspiciously low prices)
  competitivePrice = Math.max(competitivePrice, percentile15);

  // Rule 4: Final competitive adjustment - reduce by 3-8% based on market density
  const mean = filteredPrices.reduce((acc, p) => acc + p, 0) / filteredPrices.length;
  const variance = filteredPrices.reduce((acc, p) => acc + Math.pow(p - mean, 2), 0) / filteredPrices.length;
  const std = Math.sqrt(variance);
  const cv = std / mean;

  // Higher variation = more aggressive pricing
  let adjustmentFactor = 0.93; // 7% reduction default
  if (cv > 0.5) { // High variation market
    adjustmentFactor = 0.85; // 15% reduction
  } else if (cv > 0.3) { // Medium variation market
    adjustmentFactor = 0.90; // 10% reduction
  }

  competitivePrice = competitivePrice * adjustmentFactor;

  // Final sanity check - ensure we didn't go too low
  if (competitivePrice < percentile10) {
    competitivePrice = percentile15;
  }

  return competitivePrice;
}

function calculateMarketPriceAdvanced(prices: number[]): { [key: string]: number } {
  if (!prices || prices.length === 0) {
    return {
      iqr_median: 0.0,
      trimmed_mean: 0.0,
      dbscan_median: 0.0,
      isolation_forest: 0.0,
      robust_estimate: 0.0,
      confidence_score: 0.0
    };
  }

  // Initial filtering
  const filteredPrices = prices.filter(price => price > 100 && price !== 999999);

  if (filteredPrices.length === 0) {
    return {
      iqr_median: 0.0,
      trimmed_mean: 0.0,
      dbscan_median: 0.0,
      isolation_forest: 0.0,
      robust_estimate: 0.0,
      confidence_score: 0.0
    };
  }

  if (filteredPrices.length === 1) {
    const singlePrice = filteredPrices[0];
    return {
      iqr_median: singlePrice,
      trimmed_mean: singlePrice,
      dbscan_median: singlePrice,
      isolation_forest: singlePrice,
      robust_estimate: singlePrice,
      confidence_score: 1.0
    };
  }

  // Method 1: Original IQR method
  const iqrResult = calculateIQRMedian(filteredPrices);

  // Method 2: Trimmed mean
  const trimmedResult = calculateTrimmedMean(filteredPrices);

  // Method 3: Simple clustering
  const dbscanResult = calculateSimpleClusteringMedian(filteredPrices);

  // Method 4: Simple outlier removal
  const isolationResult = calculateSimpleOutlierRemoval(filteredPrices);

  // Method 5: Ensemble robust estimate
  const robustResult = calculateRobustEnsemble(filteredPrices, [
    iqrResult, trimmedResult, dbscanResult, isolationResult
  ]);

  // Calculate confidence score
  const confidence = calculateConfidenceScore(filteredPrices, robustResult);

  return {
    iqr_median: iqrResult,
    trimmed_mean: trimmedResult,
    dbscan_median: dbscanResult,
    isolation_forest: isolationResult,
    robust_estimate: robustResult,
    confidence_score: confidence
  };
}

function calculateMarketPrice(prices: number[]): number {
  const results = calculateMarketPriceAdvanced(prices);
  // Use the most competitive estimate with stronger reduction
  const competitivePrice = Math.min(
    results.robust_estimate,
    results.trimmed_mean,
    results.dbscan_median
  ) * 0.90;

  // Apply additional competitive filters
  return applyCompetitivePricingFilters(competitivePrice, prices);
}

// Agent 2: Get comprehensive market pricing with 20+ prices
async function getMarketPrice(normalizedInput: string): Promise<{ marketPrice: number; allPrices: number[]; confidence: number; sources: string[] }> {
  const prompt = `Please search for second-hand prices of this item in Thailand and provide me with at least 20 different price listings. Focus on platforms like Kaidee, Facebook Marketplace, and other Thai second-hand marketplaces.

${normalizedInput}

Please return the response in this exact format:
PRICES: [price1, price2, price3, ..., price20+]
SOURCES: [source1, source2, source3, ..., sourceN]

Where:
- PRICES should be an array of numerical prices in Thai Baht (THB) only
- SOURCES should be an array of platform names where each price was found
- Focus on Thailand market only, not international prices
- Include both competitive and premium listings to get full market range
- Make sure prices are realistic for Thai market conditions

Example format:
PRICES: [8500, 9200, 7800, 10500, 6900, 8800, 7600, 11200, 7200, 9500, 8200, 10800, 7000, 9000, 7500, 9800, 6800, 9300, 7700, 10200]
SOURCES: ["Kaidee", "Facebook Marketplace", "Kaidee", "Facebook Marketplace", "Kaidee", "Facebook Marketplace", "Kaidee", "Facebook Marketplace", "Kaidee", "Facebook Marketplace"]`;

  const response = await openai.responses.create({
    model: 'gpt-4.1-mini',
    tools: [{ type: "web_search_preview" }],
    input: prompt,
    // max_tokens: 1000,
    // temperature: 0.1,
  });

  const responseText = response.output_text || '';

  // Parse PRICES array
  const pricesMatch = responseText.match(/PRICES:\s*\[([^\]]+)\]/);
  let allPrices: number[] = [];
  let sources: string[] = [];

  if (pricesMatch) {
    try {
      const pricesStr = pricesMatch[1];
      allPrices = pricesStr.split(',')
        .map(price => parseInt(price.trim().replace(/[^\d]/g, '')))
        .filter(price => !isNaN(price) && price > 0);
    } catch (error) {
      console.error('Error parsing prices:', error);
    }
  }

  // Parse SOURCES array
  const sourcesMatch = responseText.match(/SOURCES:\s*\[([^\]]+)\]/);
  if (sourcesMatch) {
    try {
      const sourcesStr = sourcesMatch[1];
      sources = sourcesStr.split(',')
        .map(source => source.trim().replace(/["']/g, ''))
        .filter(source => source.length > 0);
    } catch (error) {
      console.error('Error parsing sources:', error);
    }
  }

  console.log('📊 Raw prices from AI:', allPrices);
  console.log('📍 Sources:', sources);

  // Calculate market price using advanced algorithm
  const marketPrice = calculateMarketPrice(allPrices);
  console.log('💰 Calculated market price:', marketPrice);

  // Calculate confidence
  const confidence = allPrices.length >= 10 ? 0.85 : Math.min(0.5, allPrices.length / 20);

  return {
    marketPrice,
    allPrices,
    confidence,
    sources
  };
}


export async function POST(request: NextRequest): Promise<NextResponse<EstimateResponse | { error: string }>> {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    const body: EstimateRequest = await request.json();

    // Validate required fields
    if (!body.itemType || !body.brand || !body.model || !body.lineId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Agent 1: Normalize input
    console.log('🔄 Normalizing input...');
    const normalizedInput = await normalizeInput(body);
    console.log('✅ Input normalized:', normalizedInput);

    // Agent 2: Get comprehensive market pricing (20+ prices)
    console.log('🔄 Getting comprehensive market pricing...');
    const marketResult = await getMarketPrice(normalizedInput);
    const { marketPrice, allPrices, confidence, sources } = marketResult;
    console.log('✅ Market price calculation:', marketPrice);
    console.log('📊 Number of prices collected:', allPrices.length);

    // Calculate pawn price: market price * 0.6 (for pawn shop pricing)
    const pawnPrice = Math.round(marketPrice * 0.6);
    console.log('🏦 Pawn price (60% of market):', pawnPrice);

    // Use condition score from AI analysis (already done in analyze-condition API)
    const conditionScore = body.condition; // This comes from the analyze-condition API result (0-1 scale)
    console.log('✅ Using condition score from AI analysis:', conditionScore);

    // Calculate final estimate: pawn price * condition score
    const estimatedPrice = Math.round(pawnPrice * conditionScore);
    console.log('💰 Final estimated price:', estimatedPrice);

    // Ensure minimum price
    const finalPrice = Math.max(estimatedPrice, 100);

    return NextResponse.json({
      success: true,
      estimatedPrice: finalPrice,
      condition: conditionScore,
      marketPrice: marketPrice,
      pawnPrice: pawnPrice,
      confidence: confidence,
      allPrices: allPrices,
      sources: sources,
      normalizedInput: normalizedInput,
      calculation: {
        marketPrice: `ราคาตลาดมือสองที่คำนวณแล้ว (ใช้ algorithm ขั้นสูง)`,
        pawnPrice: `ราคาจำนำ = ราคาตลาด × 0.6`,
        finalPrice: `ราคาประเมิน = ราคาจำนำ × สภาพสินค้า (${conditionScore})`
      }
    });

  } catch (error: any) {
    console.error('Error in AI estimation:', error);
    return NextResponse.json(
      { error: 'Failed to estimate price' },
      { status: 500 }
    );
  }
}
