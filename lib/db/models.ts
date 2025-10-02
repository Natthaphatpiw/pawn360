import { ObjectId } from 'mongodb';

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
  storeId?: ObjectId;
  createdBy?: ObjectId;
  createdAt: Date;
  updatedAt: Date;
  contractsID?: ObjectId[];
  pawnRequests?: PawnRequest[];
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
  status: 'pending' | 'active' | 'redeemed' | 'lost' | 'sold';
  currentContractId?: ObjectId | null;
  contractHistory?: ObjectId[];
  storeId?: ObjectId;
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
