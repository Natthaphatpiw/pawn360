// Comprehensive Apple Products List (2015-2025)
// This file contains detailed product information for accurate pricing estimation

export interface AppleProduct {
  id: number;
  name: string;
  type: 'Mobile' | 'Laptop' | 'Tablet' | 'Smartwatch' | 'Audio';
  category: 'iPhone' | 'MacBook' | 'iPad' | 'Watch' | 'Audio';
  year: number;
  specs: string;

  // Detailed specifications
  colors?: string[];
  storageOptions?: string[];
  screenSize?: string;
  ram?: string;
  chip?: string;
  connectivity?: string[]; // For Watch and iPad

  // Price range (for reference)
  originalPrice?: number;
  currentMarketPrice?: number;
}

export const APPLE_PRODUCTS: AppleProduct[] = [
  // ==================== IPHONE (2015-2025) ====================

  // iPhone 15 Series (2023)
  {
    id: 1,
    name: 'iPhone 15 Pro Max',
    type: 'Mobile',
    category: 'iPhone',
    year: 2023,
    specs: '256GB Titanium Natural',
    colors: ['Natural Titanium', 'Blue Titanium', 'White Titanium', 'Black Titanium'],
    storageOptions: ['256GB', '512GB', '1TB'],
    screenSize: '6.7"',
    chip: 'A17 Pro',
    originalPrice: 51900,
    currentMarketPrice: 48000
  },
  {
    id: 2,
    name: 'iPhone 15 Pro',
    type: 'Mobile',
    category: 'iPhone',
    year: 2023,
    specs: '128GB Blue Titanium',
    colors: ['Natural Titanium', 'Blue Titanium', 'White Titanium', 'Black Titanium'],
    storageOptions: ['128GB', '256GB', '512GB', '1TB'],
    screenSize: '6.1"',
    chip: 'A17 Pro',
    originalPrice: 41900,
    currentMarketPrice: 38000
  },
  {
    id: 3,
    name: 'iPhone 15 Plus',
    type: 'Mobile',
    category: 'iPhone',
    year: 2023,
    specs: '128GB Black',
    colors: ['Black', 'Blue', 'Green', 'Yellow', 'Pink'],
    storageOptions: ['128GB', '256GB', '512GB'],
    screenSize: '6.7"',
    chip: 'A16 Bionic',
    originalPrice: 35900,
    currentMarketPrice: 32000
  },
  {
    id: 4,
    name: 'iPhone 15',
    type: 'Mobile',
    category: 'iPhone',
    year: 2023,
    specs: '128GB Black',
    colors: ['Black', 'Blue', 'Green', 'Yellow', 'Pink'],
    storageOptions: ['128GB', '256GB', '512GB'],
    screenSize: '6.1"',
    chip: 'A16 Bionic',
    originalPrice: 29900,
    currentMarketPrice: 27000
  },

  // iPhone 14 Series (2022)
  {
    id: 5,
    name: 'iPhone 14 Pro Max',
    type: 'Mobile',
    category: 'iPhone',
    year: 2022,
    specs: '256GB Deep Purple',
    colors: ['Deep Purple', 'Space Black', 'Silver', 'Gold'],
    storageOptions: ['128GB', '256GB', '512GB', '1TB'],
    screenSize: '6.7"',
    chip: 'A16 Bionic',
    originalPrice: 48900,
    currentMarketPrice: 40000
  },
  {
    id: 6,
    name: 'iPhone 14 Pro',
    type: 'Mobile',
    category: 'iPhone',
    year: 2022,
    specs: '128GB Space Black',
    colors: ['Deep Purple', 'Space Black', 'Silver', 'Gold'],
    storageOptions: ['128GB', '256GB', '512GB', '1TB'],
    screenSize: '6.1"',
    chip: 'A16 Bionic',
    originalPrice: 38900,
    currentMarketPrice: 33000
  },
  {
    id: 7,
    name: 'iPhone 14 Plus',
    type: 'Mobile',
    category: 'iPhone',
    year: 2022,
    specs: '128GB Midnight',
    colors: ['Midnight', 'Starlight', 'Blue', 'Purple', 'Red'],
    storageOptions: ['128GB', '256GB', '512GB'],
    screenSize: '6.7"',
    chip: 'A15 Bionic',
    originalPrice: 32900,
    currentMarketPrice: 28000
  },
  {
    id: 8,
    name: 'iPhone 14',
    type: 'Mobile',
    category: 'iPhone',
    year: 2022,
    specs: '128GB Midnight',
    colors: ['Midnight', 'Starlight', 'Blue', 'Purple', 'Red'],
    storageOptions: ['128GB', '256GB', '512GB'],
    screenSize: '6.1"',
    chip: 'A15 Bionic',
    originalPrice: 29900,
    currentMarketPrice: 24000
  },

  // iPhone 13 Series (2021)
  {
    id: 9,
    name: 'iPhone 13 Pro Max',
    type: 'Mobile',
    category: 'iPhone',
    year: 2021,
    specs: '256GB Sierra Blue',
    colors: ['Sierra Blue', 'Graphite', 'Gold', 'Silver'],
    storageOptions: ['128GB', '256GB', '512GB', '1TB'],
    screenSize: '6.7"',
    chip: 'A15 Bionic',
    originalPrice: 45900,
    currentMarketPrice: 32000
  },
  {
    id: 10,
    name: 'iPhone 13 Pro',
    type: 'Mobile',
    category: 'iPhone',
    year: 2021,
    specs: '128GB Graphite',
    colors: ['Sierra Blue', 'Graphite', 'Gold', 'Silver'],
    storageOptions: ['128GB', '256GB', '512GB', '1TB'],
    screenSize: '6.1"',
    chip: 'A15 Bionic',
    originalPrice: 38900,
    currentMarketPrice: 28000
  },
  {
    id: 11,
    name: 'iPhone 13',
    type: 'Mobile',
    category: 'iPhone',
    year: 2021,
    specs: '128GB Starlight',
    colors: ['Starlight', 'Midnight', 'Blue', 'Pink', 'Red', 'Green'],
    storageOptions: ['128GB', '256GB', '512GB'],
    screenSize: '6.1"',
    chip: 'A15 Bionic',
    originalPrice: 29900,
    currentMarketPrice: 20000
  },
  {
    id: 12,
    name: 'iPhone 13 mini',
    type: 'Mobile',
    category: 'iPhone',
    year: 2021,
    specs: '128GB Pink',
    colors: ['Starlight', 'Midnight', 'Blue', 'Pink', 'Red', 'Green'],
    storageOptions: ['128GB', '256GB', '512GB'],
    screenSize: '5.4"',
    chip: 'A15 Bionic',
    originalPrice: 25900,
    currentMarketPrice: 17000
  },

  // iPhone 12 Series (2020)
  {
    id: 13,
    name: 'iPhone 12 Pro Max',
    type: 'Mobile',
    category: 'iPhone',
    year: 2020,
    specs: '256GB Pacific Blue',
    colors: ['Pacific Blue', 'Graphite', 'Gold', 'Silver'],
    storageOptions: ['128GB', '256GB', '512GB'],
    screenSize: '6.7"',
    chip: 'A14 Bionic',
    originalPrice: 42900,
    currentMarketPrice: 25000
  },
  {
    id: 14,
    name: 'iPhone 12 Pro',
    type: 'Mobile',
    category: 'iPhone',
    year: 2020,
    specs: '128GB Graphite',
    colors: ['Pacific Blue', 'Graphite', 'Gold', 'Silver'],
    storageOptions: ['128GB', '256GB', '512GB'],
    screenSize: '6.1"',
    chip: 'A14 Bionic',
    originalPrice: 35900,
    currentMarketPrice: 22000
  },
  {
    id: 15,
    name: 'iPhone 12',
    type: 'Mobile',
    category: 'iPhone',
    year: 2020,
    specs: '64GB White',
    colors: ['White', 'Black', 'Blue', 'Green', 'Red', 'Purple'],
    storageOptions: ['64GB', '128GB', '256GB'],
    screenSize: '6.1"',
    chip: 'A14 Bionic',
    originalPrice: 28900,
    currentMarketPrice: 17000
  },
  {
    id: 16,
    name: 'iPhone 12 mini',
    type: 'Mobile',
    category: 'iPhone',
    year: 2020,
    specs: '64GB Purple',
    colors: ['White', 'Black', 'Blue', 'Green', 'Red', 'Purple'],
    storageOptions: ['64GB', '128GB', '256GB'],
    screenSize: '5.4"',
    chip: 'A14 Bionic',
    originalPrice: 24900,
    currentMarketPrice: 14000
  },

  // iPhone 11 Series (2019)
  {
    id: 17,
    name: 'iPhone 11 Pro Max',
    type: 'Mobile',
    category: 'iPhone',
    year: 2019,
    specs: '256GB Midnight Green',
    colors: ['Midnight Green', 'Space Gray', 'Silver', 'Gold'],
    storageOptions: ['64GB', '256GB', '512GB'],
    screenSize: '6.5"',
    chip: 'A13 Bionic',
    originalPrice: 41900,
    currentMarketPrice: 18000
  },
  {
    id: 18,
    name: 'iPhone 11 Pro',
    type: 'Mobile',
    category: 'iPhone',
    year: 2019,
    specs: '64GB Space Gray',
    colors: ['Midnight Green', 'Space Gray', 'Silver', 'Gold'],
    storageOptions: ['64GB', '256GB', '512GB'],
    screenSize: '5.8"',
    chip: 'A13 Bionic',
    originalPrice: 35900,
    currentMarketPrice: 15000
  },
  {
    id: 19,
    name: 'iPhone 11',
    type: 'Mobile',
    category: 'iPhone',
    year: 2019,
    specs: '64GB Purple',
    colors: ['Purple', 'Yellow', 'Green', 'Black', 'White', 'Red'],
    storageOptions: ['64GB', '128GB', '256GB'],
    screenSize: '6.1"',
    chip: 'A13 Bionic',
    originalPrice: 24900,
    currentMarketPrice: 12000
  },

  // iPhone XS Series (2018)
  {
    id: 20,
    name: 'iPhone XS Max',
    type: 'Mobile',
    category: 'iPhone',
    year: 2018,
    specs: '256GB Gold',
    colors: ['Gold', 'Space Gray', 'Silver'],
    storageOptions: ['64GB', '256GB', '512GB'],
    screenSize: '6.5"',
    chip: 'A12 Bionic',
    originalPrice: 41900,
    currentMarketPrice: 12000
  },
  {
    id: 21,
    name: 'iPhone XS',
    type: 'Mobile',
    category: 'iPhone',
    year: 2018,
    specs: '64GB Space Gray',
    colors: ['Gold', 'Space Gray', 'Silver'],
    storageOptions: ['64GB', '256GB', '512GB'],
    screenSize: '5.8"',
    chip: 'A12 Bionic',
    originalPrice: 35900,
    currentMarketPrice: 10000
  },
  {
    id: 22,
    name: 'iPhone XR',
    type: 'Mobile',
    category: 'iPhone',
    year: 2018,
    specs: '64GB Blue',
    colors: ['Blue', 'White', 'Black', 'Yellow', 'Coral', 'Red'],
    storageOptions: ['64GB', '128GB', '256GB'],
    screenSize: '6.1"',
    chip: 'A12 Bionic',
    originalPrice: 26900,
    currentMarketPrice: 9000
  },

  // iPhone X (2017)
  {
    id: 23,
    name: 'iPhone X',
    type: 'Mobile',
    category: 'iPhone',
    year: 2017,
    specs: '64GB Space Gray',
    colors: ['Space Gray', 'Silver'],
    storageOptions: ['64GB', '256GB'],
    screenSize: '5.8"',
    chip: 'A11 Bionic',
    originalPrice: 35900,
    currentMarketPrice: 8000
  },

  // iPhone 8 Series (2017)
  {
    id: 24,
    name: 'iPhone 8 Plus',
    type: 'Mobile',
    category: 'iPhone',
    year: 2017,
    specs: '64GB Space Gray',
    colors: ['Space Gray', 'Silver', 'Gold'],
    storageOptions: ['64GB', '256GB'],
    screenSize: '5.5"',
    chip: 'A11 Bionic',
    originalPrice: 29900,
    currentMarketPrice: 7000
  },
  {
    id: 25,
    name: 'iPhone 8',
    type: 'Mobile',
    category: 'iPhone',
    year: 2017,
    specs: '64GB Gold',
    colors: ['Space Gray', 'Silver', 'Gold'],
    storageOptions: ['64GB', '256GB'],
    screenSize: '4.7"',
    chip: 'A11 Bionic',
    originalPrice: 25900,
    currentMarketPrice: 5500
  },

  // iPhone 7 Series (2016)
  {
    id: 26,
    name: 'iPhone 7 Plus',
    type: 'Mobile',
    category: 'iPhone',
    year: 2016,
    specs: '128GB Jet Black',
    colors: ['Jet Black', 'Black', 'Silver', 'Gold', 'Rose Gold'],
    storageOptions: ['32GB', '128GB', '256GB'],
    screenSize: '5.5"',
    chip: 'A10 Fusion',
    originalPrice: 32900,
    currentMarketPrice: 6000
  },
  {
    id: 27,
    name: 'iPhone 7',
    type: 'Mobile',
    category: 'iPhone',
    year: 2016,
    specs: '128GB Rose Gold',
    colors: ['Jet Black', 'Black', 'Silver', 'Gold', 'Rose Gold'],
    storageOptions: ['32GB', '128GB', '256GB'],
    screenSize: '4.7"',
    chip: 'A10 Fusion',
    originalPrice: 26900,
    currentMarketPrice: 4500
  },

  // iPhone SE Series
  {
    id: 28,
    name: 'iPhone SE (2022)',
    type: 'Mobile',
    category: 'iPhone',
    year: 2022,
    specs: '64GB Midnight',
    colors: ['Midnight', 'Starlight', 'Red'],
    storageOptions: ['64GB', '128GB', '256GB'],
    screenSize: '4.7"',
    chip: 'A15 Bionic',
    originalPrice: 15900,
    currentMarketPrice: 13000
  },
  {
    id: 29,
    name: 'iPhone SE (2020)',
    type: 'Mobile',
    category: 'iPhone',
    year: 2020,
    specs: '64GB White',
    colors: ['White', 'Black', 'Red'],
    storageOptions: ['64GB', '128GB', '256GB'],
    screenSize: '4.7"',
    chip: 'A13 Bionic',
    originalPrice: 14900,
    currentMarketPrice: 9000
  },

  // iPhone 6s Series (2015)
  {
    id: 30,
    name: 'iPhone 6s Plus',
    type: 'Mobile',
    category: 'iPhone',
    year: 2015,
    specs: '64GB Rose Gold',
    colors: ['Rose Gold', 'Silver', 'Gold', 'Space Gray'],
    storageOptions: ['32GB', '64GB', '128GB'],
    screenSize: '5.5"',
    chip: 'A9',
    originalPrice: 29900,
    currentMarketPrice: 3500
  },
  {
    id: 31,
    name: 'iPhone 6s',
    type: 'Mobile',
    category: 'iPhone',
    year: 2015,
    specs: '64GB Space Gray',
    colors: ['Rose Gold', 'Silver', 'Gold', 'Space Gray'],
    storageOptions: ['32GB', '64GB', '128GB'],
    screenSize: '4.7"',
    chip: 'A9',
    originalPrice: 25900,
    currentMarketPrice: 3000
  },

  // ==================== MACBOOK (2015-2025) ====================

  // MacBook Air M3 (2024)
  {
    id: 100,
    name: 'MacBook Air M3 13"',
    type: 'Laptop',
    category: 'MacBook',
    year: 2024,
    specs: '8GB/256GB Space Grey',
    colors: ['Space Grey', 'Silver', 'Starlight', 'Midnight'],
    storageOptions: ['256GB', '512GB', '1TB', '2TB'],
    screenSize: '13.6"',
    ram: '8GB/16GB/24GB',
    chip: 'M3',
    originalPrice: 39900,
    currentMarketPrice: 37000
  },
  {
    id: 101,
    name: 'MacBook Air M3 15"',
    type: 'Laptop',
    category: 'MacBook',
    year: 2024,
    specs: '8GB/512GB Midnight',
    colors: ['Space Grey', 'Silver', 'Starlight', 'Midnight'],
    storageOptions: ['256GB', '512GB', '1TB', '2TB'],
    screenSize: '15.3"',
    ram: '8GB/16GB/24GB',
    chip: 'M3',
    originalPrice: 49900,
    currentMarketPrice: 47000
  },

  // MacBook Air M2 (2022-2023)
  {
    id: 102,
    name: 'MacBook Air M2 13"',
    type: 'Laptop',
    category: 'MacBook',
    year: 2022,
    specs: '8GB/256GB Midnight',
    colors: ['Space Grey', 'Silver', 'Starlight', 'Midnight'],
    storageOptions: ['256GB', '512GB', '1TB', '2TB'],
    screenSize: '13.6"',
    ram: '8GB/16GB/24GB',
    chip: 'M2',
    originalPrice: 37900,
    currentMarketPrice: 32000
  },
  {
    id: 103,
    name: 'MacBook Air M2 15"',
    type: 'Laptop',
    category: 'MacBook',
    year: 2023,
    specs: '8GB/256GB Starlight',
    colors: ['Space Grey', 'Silver', 'Starlight', 'Midnight'],
    storageOptions: ['256GB', '512GB', '1TB', '2TB'],
    screenSize: '15.3"',
    ram: '8GB/16GB/24GB',
    chip: 'M2',
    originalPrice: 47900,
    currentMarketPrice: 42000
  },

  // MacBook Air M1 (2020)
  {
    id: 104,
    name: 'MacBook Air M1',
    type: 'Laptop',
    category: 'MacBook',
    year: 2020,
    specs: '8GB/256GB Silver',
    colors: ['Space Grey', 'Silver', 'Gold'],
    storageOptions: ['256GB', '512GB', '1TB', '2TB'],
    screenSize: '13.3"',
    ram: '8GB/16GB',
    chip: 'M1',
    originalPrice: 33900,
    currentMarketPrice: 25000
  },

  // MacBook Pro 14" (2021-2023)
  {
    id: 105,
    name: 'MacBook Pro 14" M3 Pro',
    type: 'Laptop',
    category: 'MacBook',
    year: 2023,
    specs: '18GB/512GB Space Black',
    colors: ['Space Black', 'Silver'],
    storageOptions: ['512GB', '1TB', '2TB', '4TB'],
    screenSize: '14.2"',
    ram: '18GB/36GB',
    chip: 'M3 Pro',
    originalPrice: 69900,
    currentMarketPrice: 65000
  },
  {
    id: 106,
    name: 'MacBook Pro 14" M3 Max',
    type: 'Laptop',
    category: 'MacBook',
    year: 2023,
    specs: '36GB/1TB Space Black',
    colors: ['Space Black', 'Silver'],
    storageOptions: ['1TB', '2TB', '4TB', '8TB'],
    screenSize: '14.2"',
    ram: '36GB/48GB/64GB/128GB',
    chip: 'M3 Max',
    originalPrice: 109900,
    currentMarketPrice: 102000
  },
  {
    id: 107,
    name: 'MacBook Pro 14" M2 Pro',
    type: 'Laptop',
    category: 'MacBook',
    year: 2023,
    specs: '16GB/512GB Space Grey',
    colors: ['Space Grey', 'Silver'],
    storageOptions: ['512GB', '1TB', '2TB'],
    screenSize: '14.2"',
    ram: '16GB/32GB',
    chip: 'M2 Pro',
    originalPrice: 69900,
    currentMarketPrice: 58000
  },
  {
    id: 108,
    name: 'MacBook Pro 14" M1 Pro',
    type: 'Laptop',
    category: 'MacBook',
    year: 2021,
    specs: '16GB/512GB Space Grey',
    colors: ['Space Grey', 'Silver'],
    storageOptions: ['512GB', '1TB', '2TB'],
    screenSize: '14.2"',
    ram: '16GB/32GB',
    chip: 'M1 Pro',
    originalPrice: 69900,
    currentMarketPrice: 48000
  },

  // MacBook Pro 16" (2021-2023)
  {
    id: 109,
    name: 'MacBook Pro 16" M3 Max',
    type: 'Laptop',
    category: 'MacBook',
    year: 2023,
    specs: '36GB/1TB Space Black',
    colors: ['Space Black', 'Silver'],
    storageOptions: ['512GB', '1TB', '2TB', '4TB', '8TB'],
    screenSize: '16.2"',
    ram: '36GB/48GB/64GB/128GB',
    chip: 'M3 Max',
    originalPrice: 119900,
    currentMarketPrice: 112000
  },
  {
    id: 110,
    name: 'MacBook Pro 16" M2 Max',
    type: 'Laptop',
    category: 'MacBook',
    year: 2023,
    specs: '32GB/1TB Space Grey',
    colors: ['Space Grey', 'Silver'],
    storageOptions: ['512GB', '1TB', '2TB', '4TB', '8TB'],
    screenSize: '16.2"',
    ram: '16GB/32GB/64GB/96GB',
    chip: 'M2 Max',
    originalPrice: 109900,
    currentMarketPrice: 92000
  },
  {
    id: 111,
    name: 'MacBook Pro 16" M1 Max',
    type: 'Laptop',
    category: 'MacBook',
    year: 2021,
    specs: '32GB/1TB Space Grey',
    colors: ['Space Grey', 'Silver'],
    storageOptions: ['512GB', '1TB', '2TB', '4TB', '8TB'],
    screenSize: '16.2"',
    ram: '16GB/32GB/64GB',
    chip: 'M1 Max',
    originalPrice: 109900,
    currentMarketPrice: 72000
  },

  // MacBook Pro 13" M2 (2022)
  {
    id: 112,
    name: 'MacBook Pro 13" M2',
    type: 'Laptop',
    category: 'MacBook',
    year: 2022,
    specs: '8GB/256GB Space Grey',
    colors: ['Space Grey', 'Silver'],
    storageOptions: ['256GB', '512GB', '1TB', '2TB'],
    screenSize: '13.3"',
    ram: '8GB/16GB/24GB',
    chip: 'M2',
    originalPrice: 45900,
    currentMarketPrice: 38000
  },

  // MacBook Pro 13" M1 (2020)
  {
    id: 113,
    name: 'MacBook Pro 13" M1',
    type: 'Laptop',
    category: 'MacBook',
    year: 2020,
    specs: '8GB/256GB Space Grey',
    colors: ['Space Grey', 'Silver'],
    storageOptions: ['256GB', '512GB', '1TB', '2TB'],
    screenSize: '13.3"',
    ram: '8GB/16GB',
    chip: 'M1',
    originalPrice: 41900,
    currentMarketPrice: 28000
  },

  // MacBook Pro 16" Intel (2019)
  {
    id: 114,
    name: 'MacBook Pro 16" 2019',
    type: 'Laptop',
    category: 'MacBook',
    year: 2019,
    specs: 'i7/16GB/512GB Space Grey',
    colors: ['Space Grey', 'Silver'],
    storageOptions: ['512GB', '1TB', '2TB', '4TB', '8TB'],
    screenSize: '16"',
    ram: '16GB/32GB/64GB',
    chip: 'Intel Core i7/i9',
    originalPrice: 87900,
    currentMarketPrice: 35000
  },

  // MacBook Pro 13" Intel (2020)
  {
    id: 115,
    name: 'MacBook Pro 13" 2020 Intel',
    type: 'Laptop',
    category: 'MacBook',
    year: 2020,
    specs: 'i5/8GB/256GB Space Grey',
    colors: ['Space Grey', 'Silver'],
    storageOptions: ['256GB', '512GB', '1TB', '2TB'],
    screenSize: '13.3"',
    ram: '8GB/16GB/32GB',
    chip: 'Intel Core i5/i7',
    originalPrice: 47900,
    currentMarketPrice: 22000
  },

  // MacBook Air Intel (2020)
  {
    id: 116,
    name: 'MacBook Air 2020 Intel',
    type: 'Laptop',
    category: 'MacBook',
    year: 2020,
    specs: 'i3/8GB/256GB Gold',
    colors: ['Space Grey', 'Silver', 'Gold'],
    storageOptions: ['256GB', '512GB', '1TB', '2TB'],
    screenSize: '13.3"',
    ram: '8GB/16GB',
    chip: 'Intel Core i3/i5/i7',
    originalPrice: 33900,
    currentMarketPrice: 18000
  },

  // MacBook 12" (2015-2017)
  {
    id: 117,
    name: 'MacBook 12" 2017',
    type: 'Laptop',
    category: 'MacBook',
    year: 2017,
    specs: 'm3/8GB/256GB Rose Gold',
    colors: ['Space Grey', 'Silver', 'Gold', 'Rose Gold'],
    storageOptions: ['256GB', '512GB'],
    screenSize: '12"',
    ram: '8GB/16GB',
    chip: 'Intel Core m3/i5/i7',
    originalPrice: 45900,
    currentMarketPrice: 15000
  },

  // ==================== IPAD (2015-2025) ====================

  // iPad Pro 13" M4 (2024)
  {
    id: 200,
    name: 'iPad Pro 13" M4',
    type: 'Tablet',
    category: 'iPad',
    year: 2024,
    specs: '256GB Wi-Fi Space Black',
    colors: ['Space Black', 'Silver'],
    storageOptions: ['256GB', '512GB', '1TB', '2TB'],
    screenSize: '13"',
    connectivity: ['Wi-Fi', 'Wi-Fi + Cellular'],
    chip: 'M4',
    originalPrice: 49900,
    currentMarketPrice: 47000
  },

  // iPad Pro 11" M4 (2024)
  {
    id: 201,
    name: 'iPad Pro 11" M4',
    type: 'Tablet',
    category: 'iPad',
    year: 2024,
    specs: '128GB Wi-Fi Space Black',
    colors: ['Space Black', 'Silver'],
    storageOptions: ['128GB', '256GB', '512GB', '1TB', '2TB'],
    screenSize: '11"',
    connectivity: ['Wi-Fi', 'Wi-Fi + Cellular'],
    chip: 'M4',
    originalPrice: 34900,
    currentMarketPrice: 33000
  },

  // iPad Pro 12.9" M2 (2022)
  {
    id: 202,
    name: 'iPad Pro 12.9" M2',
    type: 'Tablet',
    category: 'iPad',
    year: 2022,
    specs: '128GB Wi-Fi Silver',
    colors: ['Space Grey', 'Silver'],
    storageOptions: ['128GB', '256GB', '512GB', '1TB', '2TB'],
    screenSize: '12.9"',
    connectivity: ['Wi-Fi', 'Wi-Fi + Cellular'],
    chip: 'M2',
    originalPrice: 42900,
    currentMarketPrice: 35000
  },

  // iPad Pro 11" M2 (2022)
  {
    id: 203,
    name: 'iPad Pro 11" M2',
    type: 'Tablet',
    category: 'iPad',
    year: 2022,
    specs: '128GB Wi-Fi Space Grey',
    colors: ['Space Grey', 'Silver'],
    storageOptions: ['128GB', '256GB', '512GB', '1TB', '2TB'],
    screenSize: '11"',
    connectivity: ['Wi-Fi', 'Wi-Fi + Cellular'],
    chip: 'M2',
    originalPrice: 31900,
    currentMarketPrice: 26000
  },

  // iPad Air M2 (2024)
  {
    id: 204,
    name: 'iPad Air 13" M2',
    type: 'Tablet',
    category: 'iPad',
    year: 2024,
    specs: '128GB Wi-Fi Blue',
    colors: ['Space Grey', 'Starlight', 'Purple', 'Blue'],
    storageOptions: ['128GB', '256GB', '512GB', '1TB'],
    screenSize: '13"',
    connectivity: ['Wi-Fi', 'Wi-Fi + Cellular'],
    chip: 'M2',
    originalPrice: 29900,
    currentMarketPrice: 28000
  },
  {
    id: 205,
    name: 'iPad Air 11" M2',
    type: 'Tablet',
    category: 'iPad',
    year: 2024,
    specs: '128GB Wi-Fi Starlight',
    colors: ['Space Grey', 'Starlight', 'Purple', 'Blue'],
    storageOptions: ['128GB', '256GB', '512GB', '1TB'],
    screenSize: '11"',
    connectivity: ['Wi-Fi', 'Wi-Fi + Cellular'],
    chip: 'M2',
    originalPrice: 21900,
    currentMarketPrice: 20000
  },

  // iPad Air M1 (2022)
  {
    id: 206,
    name: 'iPad Air 5 M1',
    type: 'Tablet',
    category: 'iPad',
    year: 2022,
    specs: '64GB Wi-Fi Blue',
    colors: ['Space Grey', 'Starlight', 'Pink', 'Purple', 'Blue'],
    storageOptions: ['64GB', '256GB'],
    screenSize: '10.9"',
    connectivity: ['Wi-Fi', 'Wi-Fi + Cellular'],
    chip: 'M1',
    originalPrice: 21900,
    currentMarketPrice: 17000
  },

  // iPad 10th Gen (2022)
  {
    id: 207,
    name: 'iPad 10th Gen',
    type: 'Tablet',
    category: 'iPad',
    year: 2022,
    specs: '64GB Wi-Fi Blue',
    colors: ['Blue', 'Pink', 'Yellow', 'Silver'],
    storageOptions: ['64GB', '256GB'],
    screenSize: '10.9"',
    connectivity: ['Wi-Fi', 'Wi-Fi + Cellular'],
    chip: 'A14 Bionic',
    originalPrice: 14900,
    currentMarketPrice: 13000
  },

  // iPad 9th Gen (2021)
  {
    id: 208,
    name: 'iPad 9th Gen',
    type: 'Tablet',
    category: 'iPad',
    year: 2021,
    specs: '64GB Wi-Fi Space Grey',
    colors: ['Space Grey', 'Silver'],
    storageOptions: ['64GB', '256GB'],
    screenSize: '10.2"',
    connectivity: ['Wi-Fi', 'Wi-Fi + Cellular'],
    chip: 'A13 Bionic',
    originalPrice: 10900,
    currentMarketPrice: 9000
  },

  // iPad mini 6 (2021)
  {
    id: 209,
    name: 'iPad mini 6',
    type: 'Tablet',
    category: 'iPad',
    year: 2021,
    specs: '64GB Wi-Fi Purple',
    colors: ['Space Grey', 'Pink', 'Purple', 'Starlight'],
    storageOptions: ['64GB', '256GB'],
    screenSize: '8.3"',
    connectivity: ['Wi-Fi', 'Wi-Fi + Cellular'],
    chip: 'A15 Bionic',
    originalPrice: 19900,
    currentMarketPrice: 16000
  },

  // ==================== APPLE WATCH (2015-2025) ====================

  // Apple Watch Series 9 (2023)
  {
    id: 300,
    name: 'Apple Watch Series 9',
    type: 'Smartwatch',
    category: 'Watch',
    year: 2023,
    specs: '45mm GPS Midnight Aluminum',
    colors: ['Midnight', 'Starlight', 'Pink', 'Silver', 'Red'],
    screenSize: '41mm/45mm',
    connectivity: ['GPS', 'GPS + Cellular'],
    chip: 'S9',
    originalPrice: 14900,
    currentMarketPrice: 13000
  },

  // Apple Watch Ultra 2 (2023)
  {
    id: 301,
    name: 'Apple Watch Ultra 2',
    type: 'Smartwatch',
    category: 'Watch',
    year: 2023,
    specs: '49mm GPS+Cellular Titanium',
    colors: ['Natural Titanium'],
    screenSize: '49mm',
    connectivity: ['GPS + Cellular'],
    chip: 'S9',
    originalPrice: 29900,
    currentMarketPrice: 27000
  },

  // Apple Watch SE 2 (2023)
  {
    id: 302,
    name: 'Apple Watch SE 2',
    type: 'Smartwatch',
    category: 'Watch',
    year: 2023,
    specs: '40mm GPS Midnight',
    colors: ['Midnight', 'Starlight', 'Silver'],
    screenSize: '40mm/44mm',
    connectivity: ['GPS', 'GPS + Cellular'],
    chip: 'S8',
    originalPrice: 9900,
    currentMarketPrice: 8500
  },

  // Apple Watch Series 8 (2022)
  {
    id: 303,
    name: 'Apple Watch Series 8',
    type: 'Smartwatch',
    category: 'Watch',
    year: 2022,
    specs: '45mm GPS Midnight',
    colors: ['Midnight', 'Starlight', 'Silver', 'Red'],
    screenSize: '41mm/45mm',
    connectivity: ['GPS', 'GPS + Cellular'],
    chip: 'S8',
    originalPrice: 14900,
    currentMarketPrice: 11000
  },

  // Apple Watch Ultra 1 (2022)
  {
    id: 304,
    name: 'Apple Watch Ultra 1',
    type: 'Smartwatch',
    category: 'Watch',
    year: 2022,
    specs: '49mm GPS+Cellular Titanium',
    colors: ['Titanium'],
    screenSize: '49mm',
    connectivity: ['GPS + Cellular'],
    chip: 'S8',
    originalPrice: 29900,
    currentMarketPrice: 22000
  },

  // Apple Watch Series 7 (2021)
  {
    id: 305,
    name: 'Apple Watch Series 7',
    type: 'Smartwatch',
    category: 'Watch',
    year: 2021,
    specs: '45mm GPS Midnight',
    colors: ['Midnight', 'Starlight', 'Green', 'Blue', 'Red'],
    screenSize: '41mm/45mm',
    connectivity: ['GPS', 'GPS + Cellular'],
    chip: 'S7',
    originalPrice: 13900,
    currentMarketPrice: 9000
  },

  // ==================== AIRPODS & AUDIO (2016-2025) ====================

  // AirPods Pro 2 (2023)
  {
    id: 400,
    name: 'AirPods Pro 2',
    type: 'Audio',
    category: 'Audio',
    year: 2023,
    specs: 'USB-C MagSafe Case',
    colors: ['White'],
    chip: 'H2',
    originalPrice: 8990,
    currentMarketPrice: 7500
  },

  // AirPods Pro 2 (2022 - Lightning)
  {
    id: 401,
    name: 'AirPods Pro 2 Lightning',
    type: 'Audio',
    category: 'Audio',
    year: 2022,
    specs: 'Lightning MagSafe Case',
    colors: ['White'],
    chip: 'H2',
    originalPrice: 8990,
    currentMarketPrice: 6500
  },

  // AirPods Max (2020)
  {
    id: 402,
    name: 'AirPods Max',
    type: 'Audio',
    category: 'Audio',
    year: 2020,
    specs: 'Space Grey',
    colors: ['Space Grey', 'Silver', 'Sky Blue', 'Green', 'Pink'],
    chip: 'H1',
    originalPrice: 19900,
    currentMarketPrice: 15000
  },

  // AirPods 3 (2021)
  {
    id: 403,
    name: 'AirPods 3',
    type: 'Audio',
    category: 'Audio',
    year: 2021,
    specs: 'Lightning Case',
    colors: ['White'],
    chip: 'H1',
    originalPrice: 6490,
    currentMarketPrice: 5000
  },

  // AirPods 2 (2019)
  {
    id: 404,
    name: 'AirPods 2',
    type: 'Audio',
    category: 'Audio',
    year: 2019,
    specs: 'with Charging Case',
    colors: ['White'],
    chip: 'H1',
    originalPrice: 5990,
    currentMarketPrice: 3000
  },

  // AirPods Pro 1 (2019)
  {
    id: 405,
    name: 'AirPods Pro 1',
    type: 'Audio',
    category: 'Audio',
    year: 2019,
    specs: 'Lightning Case',
    colors: ['White'],
    chip: 'H1',
    originalPrice: 8990,
    currentMarketPrice: 4000
  },
];

// Helper function to filter products
export function getAppleProductsByCategory(category: string) {
  return APPLE_PRODUCTS.filter(p => p.category === category);
}

export function getAppleProductsByYear(year: number) {
  return APPLE_PRODUCTS.filter(p => p.year === year);
}

export function searchAppleProducts(query: string) {
  const lowerQuery = query.toLowerCase();
  return APPLE_PRODUCTS.filter(p =>
    p.name.toLowerCase().includes(lowerQuery) ||
    p.specs.toLowerCase().includes(lowerQuery) ||
    p.category.toLowerCase().includes(lowerQuery)
  );
}
