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
  googleMapUrl?: string; // URL to Google Maps for store location
  interestPresets?: any[];
  contractTemplate?: any;
  isActive?: boolean;
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
  lineId: string; // LINE User ID ของลูกค้า

  // ข้อมูลสินค้าที่จำนำ
  brand: string;
  model: string;
  type: string;
  serialNo: string;
  condition: number;
  defects: string;
  note: string;
  accessories: string;
  images: Array<string>;

  // ข้อมูลสัญญาจำนำ
  status: 'pending' | 'active' | 'redeemed' | 'lost' | 'sold' | 'temporary';
  currentContractId?: ObjectId;
  contractHistory?: Array<ObjectId>;

  // ข้อมูลการเงิน - ราคาเริ่มต้น (ก่อนต่อรอง)
  desiredAmount: number; // เงินต้นที่ลูกค้าขอ (ก่อนต่อรอง)
  estimatedValue: number;
  loanDays: number; // จำนวนวันสัญญา (ไม่ใช่ contractDays!)
  interestRate: number; // อัตราดอกเบี้ย % ต่อเดือน (เริ่มต้น)

  // 🔥 ข้อมูลสัญญาจริง (หลังต่อรอง) - สำคัญมาก!
  confirmationNewContract?: {
    itemId: string;
    pawnPrice: number; // 🔥 เงินต้นจริงหลังต่อรอง (ใช้ตัวนี้ในการคำนวณ!)
    interestRate: number; // 🔥 อัตราดอกเบี้ยจริงหลังต่อรอง
    loanDays: number;
    interest: number; // ดอกเบี้ยรวมทั้งหมด
    total: number; // ยอดรวมที่ต้องชำระ
    item: string;
  };
  confirmationStatus?: string; // 'confirmed', 'rejected', etc.
  confirmationTimestamp?: Date;
  confirmationModifications?: Array<string>; // รายการเปลี่ยนแปลงจากการต่อรอง

  // สำหรับคำนวณดอกเบี้ย (optional fields)
  lastInterestCutoffDate?: Date; // วันที่ตัดดอกครั้งล่าสุด
  accruedInterest?: number; // ดอกเบี้ยค้างสะสม

  // ประวัติ (optional fields)
  principalHistory?: Array<{
    type: 'reduce' | 'increase';
    changedAt: Date;
    previousPrincipal: number;
    newPrincipal: number;
    reduceAmount?: number;
    increaseAmount?: number;
    interestPaid?: number;
    interestCutoff?: number;
    totalPaid?: number;
    daysSinceLastCutoff?: number;
    notificationId: ObjectId;
  }>;

  extensionHistory?: Array<{
    extendedAt: Date;
    extensionDays: number; // จำนวนวันที่ต่อ
    notificationId: ObjectId;
  }>;

  redeemedAt?: Date;

  // อื่นๆ
  storeId?: ObjectId;
  negotiationStatus?: string;
  createdAt: Date; // ⭐ วันเริ่มสัญญา (ไม่ใช่ startDate!)
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
  // เอกสารสัญญาและการยืนยันตัวตน
  documents?: {
    contractHtmlUrl?: string; // URL to contract HTML in S3
    verificationPhotoUrl?: string; // URL to verification photo in S3
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

// Notification Model (for async workflow between Customer and Shop System)
export interface Notification {
  _id?: ObjectId;
  shopNotificationId: string; // Notification ID from Shop System
  contractId: ObjectId;
  customerId: ObjectId;
  lineUserId: string;
  type: 'redemption' | 'extension' | 'increase_principal' | 'reduce_principal';
  status: 'pending' | 'confirmed' | 'rejected' | 'payment_pending' | 'payment_uploaded' | 'completed' | 'failed';
  qrCodeUrl?: string;
  paymentProofUrl?: string;
  callbackUrl: string;
  amount?: number;
  message?: string;
  shopResponse?: {
    action: 'confirm' | 'reject';
    confirmed: boolean;
    message: string;
    qrCodeUrl?: string;
    timestamp: Date;
  };
  paymentVerification?: {
    verified: boolean;
    message: string;
    timestamp: Date;
  };
  lastWebhookAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
