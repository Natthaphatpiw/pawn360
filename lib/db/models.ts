import { ObjectId } from 'mongodb';

// Store Model
export interface Store {
  _id?: ObjectId;
  storeName: string;
  ownerName?: string;
  ownerEmail?: string;
  phone: string;
  taxId?: string;
  address: {
    houseNumber: string;
    village?: string;
    street?: string;
    subDistrict: string;
    district: string;
    province: string;
    country: string;
    postcode: string;
  };
  interestRate?: number; // Default interest rate for the store
  password?: string; // Hashed password for employee login (legacy)
  passwordHash?: string; // Hashed password for employee login
  ownerId?: ObjectId;
  lineIds?: string[];
  logoUrl?: string;
  stampUrl?: string;
  signatureUrl?: string;
  interestPresets?: any[];
  contractTemplate?: any;
  isActive?: boolean;
  googleMap?: string; // Google Maps URL
  createdAt: Date;
  updatedAt: Date;
}

// Customer Model
export interface Customer {
  _id?: ObjectId;
  lineId: string;
  title: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string;
  idNumber: string;
  address: {
    houseNumber: string;
    village?: string;
    street?: string;
    subDistrict: string;
    district: string;
    province: string;
    country: string;
    postcode: string;
  };
  totalContracts?: number;
  totalValue?: number;
  lastContractDate?: Date;
  storeId?: ObjectId[]; // Array of store IDs where customer has pawned items
  createdBy?: ObjectId;
  createdAt: Date;
  updatedAt: Date;
  contractsID?: ObjectId[];
  pawnRequests?: PawnRequest[];
  itemIds?: ObjectId[]; // Array of item IDs owned by this customer
}

// Pawn Request (embedded in Customer for pre-registration)
export interface PawnRequest {
  _id?: ObjectId;
  itemId?: ObjectId;
  qrCode: string;
  status: 'pending' | 'completed' | 'cancelled';
  createdAt: Date;
}

// Item Model
export interface Item {
  _id?: ObjectId;
  lineId: string;
  brand: string;
  model: string;
  type: string;
  serialNo?: string;
  condition: number;
  defects?: string;
  note?: string;
  accessories?: string;
  images: string[];
  status: 'pending' | 'active' | 'redeemed' | 'lost' | 'sold' | 'temporary';
  currentContractId?: ObjectId | null;
  contractHistory?: ObjectId[];
  storeId?: ObjectId;
  // ข้อมูลการจำนำ
  desiredAmount?: number;
  estimatedValue?: number;
  loanDays?: number;
  interestRate?: number;
  // ข้อมูลการต่อรอง (ถ้าร้านค้าแก้ไข)
  negotiatedAmount?: number;
  negotiatedDays?: number;
  negotiatedInterestRate?: number;
  negotiationStatus?: 'none' | 'pending' | 'accepted' | 'rejected';
  createdAt: Date;
  updatedAt: Date;
}

// Contract Model
export interface Contract {
  _id?: ObjectId;
  contractNumber: string;
  status: 'active' | 'overdue' | 'redeemed' | 'lost' | 'sold';
  customerId: ObjectId;
  lineId: string;
  item: {
    brand: string;
    model: string;
    type: string;
    serialNo?: string;
    accessories?: string;
    condition: number;
    defects?: string;
    note?: string;
    images: string[];
  };
  pawnDetails: {
    aiEstimatedPrice?: number;
    pawnedPrice: number;
    interestRate: number;
    periodDays: number;
    totalInterest: number;
    remainingAmount: number;
    fineAmount: number;
    payInterest: number;
    soldAmount: number;
    serviceFee?: number; // ค่าธรรมเนียมการดูแลรักษา
  };
  dates: {
    startDate: Date;
    dueDate: Date;
    redeemDate?: Date | null;
    suspendedDate?: Date | null;
  };
  transactionHistory: Transaction[];
  storeId: ObjectId;
  createdBy: ObjectId;
  userId: ObjectId;
  // ข้อมูลการเซ็นสัญญา
  signatures?: {
    seller: {
      name: string;
      signatureData?: string; // Base64 encoded signature image
      signedDate: Date;
    };
    buyer: {
      name: string;
      signatureData?: string; // Base64 encoded signature image
      signedDate: Date;
    };
  };
  // รูปภาพสัญญาและการยืนยันตัวตน
  contractImages?: {
    signedContract?: string; // URL to signed contract PDF/image in S3
    verificationPhoto?: string; // URL to verification photo in S3
  };
  createdAt: Date;
  updatedAt: Date;
}

// Transaction (embedded in Contract)
export interface Transaction {
  _id?: ObjectId;
  type: 'payment' | 'interest_payment' | 'redeem' | 'fine';
  amount: number;
  date: Date;
  note?: string;
}
